const { pool } = require('../config/database');

async function lister(req, res, next) {
  const { service, q, latitude, longitude } = req.query;
  const conditions = ['u.is_active = TRUE'];
  const valeurs = [];
  let distance = 'NULL AS distance_km';
  if (latitude !== undefined && longitude !== undefined) {
    distance = '(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(b.latitude)) * COS(RADIANS(b.longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(b.latitude))))) AS distance_km';
    valeurs.push(Number(latitude), Number(longitude), Number(latitude));
  }
  if (q) { conditions.push('(b.shop_name LIKE ? OR b.address LIKE ?)'); valeurs.push(`%${q}%`, `%${q}%`); }
  if (service) { conditions.push('EXISTS (SELECT 1 FROM barber_services bs JOIN services s ON s.id = bs.service_id WHERE bs.barber_id = b.id AND s.name LIKE ?)'); valeurs.push(`%${service}%`); }
  try {
    const [lignes] = await pool.execute(`SELECT b.id, b.shop_name, b.address, b.latitude, b.longitude, b.description, b.phone, (SELECT CASE WHEN bp.url LIKE 'data:image/webp;base64,%' THEN CONCAT('/barbers/', b.id, '/cover-photo') ELSE bp.url END FROM barber_photos bp WHERE bp.barber_id = b.id AND bp.is_cover = TRUE ORDER BY bp.id DESC LIMIT 1) AS cover_photo_url, ${distance}, COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count FROM barbers b JOIN users u ON u.id = b.user_id LEFT JOIN reviews r ON r.barber_id = b.id AND r.is_hidden = FALSE WHERE ${conditions.join(' AND ')} GROUP BY b.id ORDER BY distance_km IS NULL, distance_km ASC, rating DESC`, valeurs);
    return res.json(lignes);
  } catch (erreur) { return next(erreur); }
}

async function detail(req, res, next) {
  try {
    const [barbiers] = await pool.execute('SELECT b.*, u.name AS owner_name FROM barbers b JOIN users u ON u.id = b.user_id WHERE b.id = ? AND u.is_active = TRUE', [req.params.id]);
    if (!barbiers[0]) return res.status(404).json({ message: 'Barbier introuvable.' });
    const [services, photos] = await Promise.all([
      pool.execute('SELECT s.id, s.name, s.description, bs.price, bs.duration_minutes AS duration FROM barber_services bs JOIN services s ON s.id = bs.service_id WHERE bs.barber_id = ? ORDER BY bs.price', [req.params.id]),
      pool.execute("SELECT id, barber_id, CASE WHEN url LIKE 'data:image/webp;base64,%' THEN CONCAT('/barbers/', barber_id, '/cover-photo') ELSE url END AS url, is_cover FROM barber_photos WHERE barber_id = ? ORDER BY is_cover DESC", [req.params.id]),
    ]);
    return res.json({ ...barbiers[0], services: services[0], photos: photos[0] });
  } catch (erreur) { return next(erreur); }
}

async function monBarbier(utilisateurId) {
  const [lignes] = await pool.execute('SELECT id FROM barbers WHERE user_id = ?', [utilisateurId]);
  return lignes[0];
}

async function monProfil(req, res, next) {
  try {
    const [lignes] = await pool.execute("SELECT b.*, (SELECT CASE WHEN bp.url LIKE 'data:image/webp;base64,%' THEN CONCAT('/barbers/', b.id, '/cover-photo') ELSE bp.url END FROM barber_photos bp WHERE bp.barber_id = b.id AND bp.is_cover = TRUE ORDER BY bp.id DESC LIMIT 1) AS cover_photo_url FROM barbers b WHERE b.user_id = ?", [req.utilisateur.id]);
    return res.json(lignes[0] || null);
  } catch (erreur) { return next(erreur); }
}

async function modifierProfil(req, res, next) {
  const { shopName, address = null, phone = null, description = null, latitude = null, longitude = null, coverImage = null } = req.body;
  try {
    await pool.execute(
      'INSERT INTO barbers (user_id, shop_name, address, phone, description, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE shop_name = VALUES(shop_name), address = VALUES(address), phone = VALUES(phone), description = VALUES(description), latitude = VALUES(latitude), longitude = VALUES(longitude)',
      [req.utilisateur.id, shopName, address, phone, description, latitude, longitude],
    );
    const barbier = await monBarbier(req.utilisateur.id);
    if (coverImage) {
      await pool.execute('DELETE FROM barber_photos WHERE barber_id = ? AND is_cover = TRUE', [barbier.id]);
      await pool.execute('INSERT INTO barber_photos (barber_id, url, is_cover) VALUES (?, ?, TRUE)', [barbier.id, coverImage]);
    }
    const [lignes] = await pool.execute("SELECT b.*, (SELECT CASE WHEN bp.url LIKE 'data:image/webp;base64,%' THEN CONCAT('/barbers/', b.id, '/cover-photo') ELSE bp.url END FROM barber_photos bp WHERE bp.barber_id = b.id AND bp.is_cover = TRUE ORDER BY bp.id DESC LIMIT 1) AS cover_photo_url FROM barbers b WHERE b.user_id = ?", [req.utilisateur.id]);
    return res.json(lignes[0]);
  } catch (erreur) { return next(erreur); }
}

async function photoCouverture(req, res, next) {
  try {
    const [photos] = await pool.execute('SELECT url FROM barber_photos WHERE barber_id = ? AND is_cover = TRUE ORDER BY id DESC LIMIT 1', [req.params.id]);
    const match = photos[0]?.url?.match(/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return res.status(404).end();
    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(Buffer.from(match[1], 'base64'));
  } catch (erreur) { return next(erreur); }
}

async function catalogueServices(req, res, next) {
  try {
    const [services] = await pool.execute('SELECT id, name, description FROM services ORDER BY name');
    return res.json(services);
  } catch (erreur) { return next(erreur); }
}

async function horairesDuBarbier(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier) return res.json([]);
    const [lignes] = await pool.execute('SELECT day_of_week, start_time, end_time, is_active FROM working_hours WHERE barber_id = ? ORDER BY day_of_week, start_time', [barbier.id]);
    return res.json(lignes);
  } catch (erreur) { return next(erreur); }
}

async function modifierHoraires(req, res, next) {
  const { hours } = req.body;
  let connexion;
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier) return res.status(409).json({ message: 'Enregistrez d’abord le profil de votre salon.' });
    connexion = await pool.getConnection();
    await connexion.beginTransaction();
    await connexion.execute('DELETE FROM working_hours WHERE barber_id = ?', [barbier.id]);
    for (const item of hours) {
      if (item.active) await connexion.execute('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, TRUE)', [barbier.id, item.dayOfWeek, item.startTime, item.endTime]);
    }
    await connexion.commit();
    return res.json(hours);
  } catch (erreur) {
    if (connexion) await connexion.rollback();
    return next(erreur);
  } finally { connexion?.release(); }
}

async function ajouterService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier || Number(req.params.id) !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    const { serviceId, price, durationMinutes = 30 } = req.body;
    const [services] = await pool.execute('SELECT id, name, description FROM services WHERE id = ?', [serviceId]);
    if (!services[0]) return res.status(404).json({ message: 'Prestation introuvable.' });
    await pool.execute('INSERT INTO barber_services (barber_id, service_id, price, duration_minutes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), duration_minutes = VALUES(duration_minutes)', [barbier.id, serviceId, price, durationMinutes]);
    return res.status(201).json({ ...services[0], barber_id: barbier.id, price, duration_minutes: durationMinutes });
  } catch (erreur) { return next(erreur); }
}

async function modifierService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier || Number(req.params.id) !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    const { price, durationMinutes } = req.body;
    const [resultat] = await pool.execute('UPDATE barber_services SET price = ?, duration_minutes = ? WHERE barber_id = ? AND service_id = ?', [price, durationMinutes, barbier.id, req.params.serviceId]);
    if (!resultat.affectedRows) return res.status(404).json({ message: 'Prestation non proposée par ce barbier.' });
    return res.json({ barber_id: barbier.id, service_id: Number(req.params.serviceId), price, duration_minutes: durationMinutes });
  } catch (erreur) { return next(erreur); }
}

async function supprimerService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier || Number(req.params.id) !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    const [resultat] = await pool.execute('DELETE FROM barber_services WHERE barber_id = ? AND service_id = ?', [barbier.id, req.params.serviceId]);
    if (!resultat.affectedRows) return res.status(404).json({ message: 'Prestation non proposée par ce barbier.' });
    return res.status(204).send();
  } catch (erreur) { return next(erreur); }
}

async function servicesDuBarbier(req, res, next) {
  try {
    const [services] = await pool.execute('SELECT s.id, s.name, s.description, bs.price, bs.duration_minutes FROM barber_services bs JOIN services s ON s.id = bs.service_id WHERE bs.barber_id = ? ORDER BY bs.price ASC', [req.params.id]);
    return res.json(services);
  } catch (erreur) { return next(erreur); }
}

async function creneauxDisponibles(req, res, next) {
  const { date, serviceId } = req.query;
  const dateObjet = new Date(`${date}T12:00:00`);
  if (Number.isNaN(dateObjet.getTime())) return res.status(422).json({ message: 'Date invalide.' });
  try {
    const [services] = await pool.execute('SELECT duration_minutes FROM barber_services WHERE service_id = ? AND barber_id = ?', [serviceId, req.params.id]);
    if (!services[0]) return res.status(404).json({ message: 'Service introuvable pour ce barbier.' });
    const [absences, horaires, rendezVous] = await Promise.all([
      pool.execute('SELECT id FROM time_off WHERE barber_id = ? AND date = ? AND is_full_day = TRUE', [req.params.id, date]),
      pool.execute('SELECT start_time, end_time FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND is_active = TRUE', [req.params.id, dateObjet.getDay()]),
      pool.execute("SELECT time, duration_minutes FROM appointments WHERE barber_id = ? AND date = ? AND status IN ('pending', 'confirmed')", [req.params.id, date]),
    ]);
    if (absences[0].length || !horaires[0].length) return res.json({ date, slots: [] });
    const duree = services[0].duration_minutes;
    const occupes = rendezVous[0].map((rdv) => ({ debut: rdv.time.slice(0, 5), duree: rdv.duration_minutes }));
    const aujourdHui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (date < aujourdHui) return res.json({ date, duration: duree, slots: [] });
    const heureActuelle = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [heureNow, minuteNow] = heureActuelle.split(':').map(Number);
    const minutesMaintenant = heureNow * 60 + minuteNow;
    const slots = [];
    for (const horaire of horaires[0]) {
      const [h1, m1] = horaire.start_time.split(':').map(Number); const [h2, m2] = horaire.end_time.split(':').map(Number);
      for (let minutes = h1 * 60 + m1; minutes + duree <= h2 * 60 + m2; minutes += duree) {
        const chevauchement = occupes.some((rdv) => { const [h, m] = rdv.debut.split(':').map(Number); const debut = h * 60 + m; return minutes < debut + rdv.duree && minutes + duree > debut; });
        if (!chevauchement && (date !== aujourdHui || minutes > minutesMaintenant)) slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
      }
    }
    return res.json({ date, duration: duree, slots });
  } catch (erreur) { return next(erreur); }
}

module.exports = { lister, detail, servicesDuBarbier, catalogueServices, monProfil, modifierProfil, photoCouverture, horairesDuBarbier, modifierHoraires, ajouterService, modifierService, supprimerService, creneauxDisponibles, monBarbier };
