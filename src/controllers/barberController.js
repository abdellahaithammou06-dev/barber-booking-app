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
  if (service) { conditions.push('EXISTS (SELECT 1 FROM services s WHERE s.barber_id = b.id AND s.name LIKE ?)'); valeurs.push(`%${service}%`); }
  try {
    const [lignes] = await pool.execute(`SELECT b.id, b.shop_name, b.address, b.latitude, b.longitude, b.description, b.phone, ${distance}, COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS review_count FROM barbers b JOIN users u ON u.id = b.user_id LEFT JOIN reviews r ON r.barber_id = b.id AND r.is_hidden = FALSE WHERE ${conditions.join(' AND ')} GROUP BY b.id ORDER BY distance_km IS NULL, distance_km ASC, rating DESC`, valeurs);
    return res.json(lignes);
  } catch (erreur) { return next(erreur); }
}

async function detail(req, res, next) {
  try {
    const [barbiers] = await pool.execute('SELECT b.*, u.name AS owner_name FROM barbers b JOIN users u ON u.id = b.user_id WHERE b.id = ? AND u.is_active = TRUE', [req.params.id]);
    if (!barbiers[0]) return res.status(404).json({ message: 'Barbier introuvable.' });
    const [services, photos] = await Promise.all([
      pool.execute('SELECT * FROM services WHERE barber_id = ? ORDER BY price', [req.params.id]),
      pool.execute('SELECT * FROM barber_photos WHERE barber_id = ? ORDER BY is_cover DESC', [req.params.id]),
    ]);
    return res.json({ ...barbiers[0], services: services[0], photos: photos[0] });
  } catch (erreur) { return next(erreur); }
}

async function monBarbier(utilisateurId) {
  const [lignes] = await pool.execute('SELECT id FROM barbers WHERE user_id = ?', [utilisateurId]);
  return lignes[0];
}

async function ajouterService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    if (!barbier || Number(req.params.id) !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    const { name, description = null, price, duration } = req.body;
    const [resultat] = await pool.execute('INSERT INTO services (barber_id, name, description, price, duration) VALUES (?, ?, ?, ?, ?)', [barbier.id, name, description, price, duration]);
    return res.status(201).json({ id: resultat.insertId, barber_id: barbier.id, name, description, price, duration });
  } catch (erreur) { return next(erreur); }
}

async function modifierService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    const [services] = await pool.execute('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (!services[0]) return res.status(404).json({ message: 'Service introuvable.' });
    if (!barbier || services[0].barber_id !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    const service = { ...services[0], ...req.body };
    await pool.execute('UPDATE services SET name = ?, description = ?, price = ?, duration = ? WHERE id = ?', [service.name, service.description, service.price, service.duration, service.id]);
    return res.json(service);
  } catch (erreur) { return next(erreur); }
}

async function supprimerService(req, res, next) {
  try {
    const barbier = await monBarbier(req.utilisateur.id);
    const [services] = await pool.execute('SELECT barber_id FROM services WHERE id = ?', [req.params.id]);
    if (!services[0]) return res.status(404).json({ message: 'Service introuvable.' });
    if (!barbier || services[0].barber_id !== barbier.id) return res.status(403).json({ message: 'Vous ne pouvez gérer que vos services.' });
    await pool.execute('DELETE FROM services WHERE id = ?', [req.params.id]);
    return res.status(204).send();
  } catch (erreur) { return next(erreur); }
}

async function creneauxDisponibles(req, res, next) {
  const { date, serviceId } = req.query;
  const dateObjet = new Date(`${date}T12:00:00`);
  if (Number.isNaN(dateObjet.getTime())) return res.status(422).json({ message: 'Date invalide.' });
  try {
    const [services] = await pool.execute('SELECT duration FROM services WHERE id = ? AND barber_id = ?', [serviceId, req.params.id]);
    if (!services[0]) return res.status(404).json({ message: 'Service introuvable pour ce barbier.' });
    const [absences, horaires, rendezVous] = await Promise.all([
      pool.execute('SELECT id FROM time_off WHERE barber_id = ? AND date = ? AND is_full_day = TRUE', [req.params.id, date]),
      pool.execute('SELECT start_time, end_time FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND is_active = TRUE', [req.params.id, dateObjet.getDay()]),
      pool.execute("SELECT a.time, s.duration FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.barber_id = ? AND a.date = ? AND a.status IN ('pending', 'confirmed')", [req.params.id, date]),
    ]);
    if (absences[0].length || !horaires[0].length) return res.json({ date, slots: [] });
    const duree = services[0].duration;
    const occupes = rendezVous[0].map((rdv) => ({ debut: rdv.time.slice(0, 5), duree: rdv.duration }));
    const slots = [];
    for (const horaire of horaires[0]) {
      const [h1, m1] = horaire.start_time.split(':').map(Number); const [h2, m2] = horaire.end_time.split(':').map(Number);
      for (let minutes = h1 * 60 + m1; minutes + duree <= h2 * 60 + m2; minutes += duree) {
        const chevauchement = occupes.some((rdv) => { const [h, m] = rdv.debut.split(':').map(Number); const debut = h * 60 + m; return minutes < debut + rdv.duree && minutes + duree > debut; });
        if (!chevauchement) slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
      }
    }
    return res.json({ date, duration: duree, slots });
  } catch (erreur) { return next(erreur); }
}

module.exports = { lister, detail, ajouterService, modifierService, supprimerService, creneauxDisponibles, monBarbier };
