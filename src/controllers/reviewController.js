const { pool } = require('../config/database');
async function creer(req, res, next) {
  const { barberId, appointmentId = null, rating, comment = null } = req.body;
  try {
    if (appointmentId) {
      const [[rdv]] = await pool.execute("SELECT id FROM appointments WHERE id = ? AND client_id = ? AND barber_id = ? AND status = 'completed'", [appointmentId, req.utilisateur.id, barberId]);
      if (!rdv) return res.status(422).json({ message: 'Seul un rendez-vous terminé peut être évalué.' });
    }
    const [resultat] = await pool.execute('INSERT INTO reviews (client_id, barber_id, appointment_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [req.utilisateur.id, barberId, appointmentId, rating, comment]);
    return res.status(201).json({ id: resultat.insertId, barber_id: barberId, rating, comment });
  } catch (erreur) { return next(erreur); }
}
async function lister(req, res, next) {
  try {
    const [lignes] = await pool.execute('SELECT r.*, u.name AS client_name FROM reviews r JOIN users u ON u.id = r.client_id WHERE r.barber_id = ? AND r.is_hidden = FALSE ORDER BY r.created_at DESC', [req.params.id]);
    return res.json(lignes);
  } catch (erreur) { return next(erreur); }
}
module.exports = { creer, lister };
