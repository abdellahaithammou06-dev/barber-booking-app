const { pool } = require('../config/database');
const { monBarbier } = require('./barberController');
const { normaliserNumeroWhatsApp } = require('../utils/phone');

function minutes(heure) { const [h, m] = heure.slice(0, 5).split(':').map(Number); return h * 60 + m; }
function heureLocaleMaroc() {
  const maintenant = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
  const heure = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(maintenant);
  return { date, minutes: minutes(heure) };
}
function instantMaroc(date, time) {
  const cible = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  const pieces = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(cible));
  const valeur = Object.fromEntries(pieces.map((piece) => [piece.type, piece.value]));
  const localeCommeUtc = Date.UTC(Number(valeur.year), Number(valeur.month) - 1, Number(valeur.day), Number(valeur.hour), Number(valeur.minute), Number(valeur.second));
  return cible - (localeCommeUtc - cible);
}

async function creer(req, res, next) {
  const { barberId, serviceId, date, time } = req.body;
  const whatsappOptIn = req.body.whatsappOptIn === true;
  const clientPhone = whatsappOptIn ? normaliserNumeroWhatsApp(req.body.clientPhone) : null;
  if (whatsappOptIn && !clientPhone) return res.status(422).json({ message: 'Saisissez un numéro WhatsApp valide pour recevoir le rappel.' });
  const connexion = await pool.getConnection();
  try {
    await connexion.beginTransaction();
    const maintenantMaroc = heureLocaleMaroc();
    if (date < maintenantMaroc.date || (date === maintenantMaroc.date && minutes(time) <= maintenantMaroc.minutes)) {
      await connexion.rollback();
      return res.status(422).json({ message: 'Choisissez un créneau qui n’est pas encore passé.' });
    }
    // Serialize bookings per salon so simultaneous requests cannot claim the same free slot.
    const [[barbier]] = await connexion.execute('SELECT id FROM barbers WHERE id = ? FOR UPDATE', [barberId]);
    if (!barbier) { await connexion.rollback(); return res.status(404).json({ message: 'Barbier introuvable.' }); }
    const [[service]] = await connexion.execute('SELECT bs.price, bs.duration_minutes FROM barber_services bs WHERE bs.service_id = ? AND bs.barber_id = ?', [serviceId, barberId]);
    if (!service) { await connexion.rollback(); return res.status(404).json({ message: 'Service introuvable pour ce barbier.' }); }
    const jour = new Date(`${date}T12:00:00`).getDay();
    const [[absence]] = await connexion.execute('SELECT id FROM time_off WHERE barber_id = ? AND date = ? AND is_full_day = TRUE', [barberId, date]);
    const [horaires] = await connexion.execute('SELECT start_time, end_time FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND is_active = TRUE', [barberId, jour]);
    const demande = minutes(time);
    const dansHoraire = !absence && horaires.some((h) => demande >= minutes(h.start_time) && demande + service.duration_minutes <= minutes(h.end_time));
    if (!dansHoraire) { await connexion.rollback(); return res.status(422).json({ message: 'Ce créneau est hors des horaires disponibles.' }); }
    const [existants] = await connexion.execute("SELECT time, duration_minutes FROM appointments WHERE barber_id = ? AND date = ? AND status IN ('pending', 'confirmed') FOR UPDATE", [barberId, date]);
    const conflit = existants.some((rdv) => demande < minutes(rdv.time) + rdv.duration_minutes && demande + service.duration_minutes > minutes(rdv.time));
    if (conflit) { await connexion.rollback(); return res.status(409).json({ message: 'Ce créneau vient d’être réservé.' }); }
    const [resultat] = await connexion.execute('INSERT INTO appointments (client_id, barber_id, service_id, price_at_booking, duration_minutes, date, time, client_phone, whatsapp_opt_in) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.utilisateur.id, barberId, serviceId, service.price, service.duration_minutes, date, time, clientPhone, whatsappOptIn]);
    await connexion.commit();
    return res.status(201).json({ id: resultat.insertId, client_id: req.utilisateur.id, barber_id: barberId, service_id: serviceId, price_at_booking: service.price, duration_minutes: service.duration_minutes, date, time, status: 'pending', client_phone: clientPhone, whatsapp_opt_in: whatsappOptIn });
  } catch (erreur) { await connexion.rollback(); return next(erreur); } finally { connexion.release(); }
}

async function miens(req, res, next) {
  try {
    const barbier = req.utilisateur.role === 'barber' ? await monBarbier(req.utilisateur.id) : null;
    const sql = barbier
      ? "SELECT a.*, u.name AS client_name, s.name AS service_name, EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review FROM appointments a JOIN users u ON u.id = a.client_id JOIN services s ON s.id = a.service_id WHERE a.barber_id = ? AND a.status NOT IN ('cancelled_by_client', 'cancelled_by_barber') ORDER BY a.date DESC, a.time DESC"
      : "SELECT a.*, b.shop_name, b.address AS shop_address, b.phone AS shop_phone, s.name AS service_name, EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id WHERE a.client_id = ? AND a.status NOT IN ('cancelled_by_client', 'cancelled_by_barber') ORDER BY a.date DESC, a.time DESC";
    const [lignes] = await pool.execute(sql, [barbier ? barbier.id : req.utilisateur.id]);
    const delai = Number(process.env.APPOINTMENT_CANCELLATION_MIN_HOURS || 2) * 60 * 60 * 1000;
    return res.json(lignes.map((rdv) => {
      const dateRdv = typeof rdv.date === 'string' ? rdv.date.slice(0, 10) : rdv.date.toISOString().slice(0, 10);
      const finRdv = instantMaroc(dateRdv, rdv.time) + Number(rdv.duration_minutes || 0) * 60 * 1000;
      const peutAnnuler = rdv.status === 'pending'
        || (rdv.status === 'confirmed' && instantMaroc(dateRdv, rdv.time) - Date.now() >= delai);
      return {
        ...rdv,
        is_past: finRdv <= Date.now(),
        can_delete: finRdv <= Date.now() && ['client', 'barber'].includes(req.utilisateur.role),
        client_can_cancel: req.utilisateur.role === 'barber' ? undefined : peutAnnuler,
        cancellation_min_hours: delai / (60 * 60 * 1000),
      };
    }));
  } catch (erreur) { return next(erreur); }
}

async function supprimer(req, res, next) {
  try {
    const [[rdv]] = await pool.execute('SELECT id, client_id, barber_id, date, time, duration_minutes FROM appointments WHERE id = ?', [req.params.id]);
    if (!rdv) return res.status(404).json({ message: 'Rendez-vous introuvable.' });

    let autorise = req.utilisateur.role === 'admin';
    if (req.utilisateur.role === 'client') autorise = rdv.client_id === req.utilisateur.id;
    if (req.utilisateur.role === 'barber') {
      const barbier = await monBarbier(req.utilisateur.id);
      autorise = Boolean(barbier && rdv.barber_id === barbier.id);
    }
    if (!autorise) return res.status(403).json({ message: 'Vous ne pouvez pas supprimer ce rendez-vous.' });

    const dateRdv = typeof rdv.date === 'string' ? rdv.date.slice(0, 10) : rdv.date.toISOString().slice(0, 10);
    const finRdv = instantMaroc(dateRdv, rdv.time) + Number(rdv.duration_minutes || 0) * 60 * 1000;
    if (finRdv > Date.now()) return res.status(422).json({ message: 'Seuls les rendez-vous passés peuvent être supprimés.' });

    await pool.execute('DELETE FROM appointments WHERE id = ?', [rdv.id]);
    return res.status(204).send();
  } catch (erreur) { return next(erreur); }
}

async function changerStatut(req, res, next) {
  const { status } = req.body;
  try {
    const [[rdv]] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!rdv) return res.status(404).json({ message: 'Rendez-vous introuvable.' });
    const barbier = req.utilisateur.role === 'barber' ? await monBarbier(req.utilisateur.id) : null;
    let autorise = false;
    if (req.utilisateur.role === 'admin') autorise = true;
    if (barbier && rdv.barber_id === barbier.id) {
      autorise = (rdv.status === 'pending' && ['confirmed', 'cancelled_by_barber'].includes(status))
        || (rdv.status === 'confirmed' && ['cancelled_by_barber', 'completed', 'no_show'].includes(status));
    }
    if (rdv.client_id === req.utilisateur.id && status === 'cancelled_by_client' && rdv.status === 'pending') {
      // A pending request has not been accepted by the barber, so the client can withdraw it at any time.
      autorise = true;
    } else if (rdv.client_id === req.utilisateur.id && status === 'cancelled_by_client' && rdv.status === 'confirmed') {
      const heuresMin = Number(process.env.APPOINTMENT_CANCELLATION_MIN_HOURS || 2);
      const delai = heuresMin * 60 * 60 * 1000;
      const dateRdv = typeof rdv.date === 'string' ? rdv.date.slice(0, 10) : rdv.date.toISOString().slice(0, 10);
      autorise = instantMaroc(dateRdv, rdv.time) - Date.now() >= delai;
      if (!autorise) return res.status(403).json({ message: `Un rendez-vous confirmé peut être annulé jusqu’à ${heuresMin} h avant l’heure prévue.` });
    }
    if (!autorise) return res.status(403).json({ message: 'Transition de statut non autorisée.' });
    await pool.execute('UPDATE appointments SET status = ? WHERE id = ?', [status, rdv.id]);
    return res.json({ ...rdv, status });
  } catch (erreur) { return next(erreur); }
}
module.exports = { creer, miens, changerStatut, supprimer };
