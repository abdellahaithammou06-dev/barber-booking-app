const { pool } = require('../config/database');
const { monBarbier } = require('./barberController');

function minutes(heure) { const [h, m] = heure.slice(0, 5).split(':').map(Number); return h * 60 + m; }

async function creer(req, res, next) {
  const { barberId, serviceId, date, time } = req.body;
  const connexion = await pool.getConnection();
  try {
    await connexion.beginTransaction();
    const [[service]] = await connexion.execute('SELECT * FROM services WHERE id = ? AND barber_id = ?', [serviceId, barberId]);
    if (!service) { await connexion.rollback(); return res.status(404).json({ message: 'Service introuvable pour ce barbier.' }); }
    const jour = new Date(`${date}T12:00:00`).getDay();
    const [[absence]] = await connexion.execute('SELECT id FROM time_off WHERE barber_id = ? AND date = ? AND is_full_day = TRUE', [barberId, date]);
    const [horaires] = await connexion.execute('SELECT start_time, end_time FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND is_active = TRUE', [barberId, jour]);
    const demande = minutes(time);
    const dansHoraire = !absence && horaires.some((h) => demande >= minutes(h.start_time) && demande + service.duration <= minutes(h.end_time));
    if (!dansHoraire) { await connexion.rollback(); return res.status(422).json({ message: 'Ce créneau est hors des horaires disponibles.' }); }
    const [existants] = await connexion.execute("SELECT a.time, s.duration FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.barber_id = ? AND a.date = ? AND a.status IN ('pending', 'confirmed') FOR UPDATE", [barberId, date]);
    const conflit = existants.some((rdv) => demande < minutes(rdv.time) + rdv.duration && demande + service.duration > minutes(rdv.time));
    if (conflit) { await connexion.rollback(); return res.status(409).json({ message: 'Ce créneau vient d’être réservé.' }); }
    const [resultat] = await connexion.execute('INSERT INTO appointments (client_id, barber_id, service_id, date, time) VALUES (?, ?, ?, ?, ?)', [req.utilisateur.id, barberId, serviceId, date, time]);
    await connexion.commit();
    return res.status(201).json({ id: resultat.insertId, client_id: req.utilisateur.id, barber_id: barberId, service_id: serviceId, date, time, status: 'pending' });
  } catch (erreur) { await connexion.rollback(); return next(erreur); } finally { connexion.release(); }
}

async function miens(req, res, next) {
  try {
    const barbier = req.utilisateur.role === 'barber' ? await monBarbier(req.utilisateur.id) : null;
    const sql = barbier
      ? 'SELECT a.*, u.name AS client_name, s.name AS service_name FROM appointments a JOIN users u ON u.id = a.client_id JOIN services s ON s.id = a.service_id WHERE a.barber_id = ? ORDER BY a.date DESC, a.time DESC'
      : 'SELECT a.*, b.shop_name, s.name AS service_name FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id WHERE a.client_id = ? ORDER BY a.date DESC, a.time DESC';
    const [lignes] = await pool.execute(sql, [barbier ? barbier.id : req.utilisateur.id]);
    return res.json(lignes);
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
    if (barbier && rdv.barber_id === barbier.id && ['confirmed', 'cancelled_by_barber', 'completed', 'no_show'].includes(status)) autorise = true;
    if (rdv.client_id === req.utilisateur.id && status === 'cancelled_by_client' && ['pending', 'confirmed'].includes(rdv.status)) {
      const delai = Number(process.env.APPOINTMENT_CANCELLATION_MIN_HOURS || 2) * 60 * 60 * 1000;
      autorise = new Date(`${rdv.date.toISOString().slice(0, 10)}T${rdv.time}`).getTime() - Date.now() >= delai;
    }
    if (!autorise) return res.status(403).json({ message: 'Transition de statut non autorisée.' });
    await pool.execute('UPDATE appointments SET status = ? WHERE id = ?', [status, rdv.id]);
    return res.json({ ...rdv, status });
  } catch (erreur) { return next(erreur); }
}
module.exports = { creer, miens, changerStatut };
