const { pool } = require('../config/database');
async function utilisateurs(req, res, next) {
  try { const [lignes] = await pool.execute('SELECT u.id, u.name, u.email, u.role, u.is_active, u.email_verified, u.created_at, b.verification_status FROM users u LEFT JOIN barbers b ON b.user_id = u.id ORDER BY u.created_at DESC'); return res.json(lignes); } catch (erreur) { return next(erreur); }
}
async function avis(req, res, next) {
  try {
    const [lignes] = await pool.execute('SELECT r.id, r.rating, r.comment, r.is_hidden, r.is_flagged, r.created_at, u.name AS client_name, b.shop_name FROM reviews r JOIN users u ON u.id = r.client_id JOIN barbers b ON b.id = r.barber_id ORDER BY r.is_flagged DESC, r.created_at DESC');
    return res.json(lignes);
  } catch (erreur) { return next(erreur); }
}
async function changerActivation(req, res, next) {
  try { await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [req.body.isActive, req.params.id]); return res.json({ id: Number(req.params.id), is_active: req.body.isActive }); } catch (erreur) { return next(erreur); }
}
async function modererAvis(req, res, next) {
  try { await pool.execute('UPDATE reviews SET is_hidden = ?, is_flagged = ? WHERE id = ?', [req.body.isHidden, req.body.isFlagged, req.params.id]); return res.json({ id: Number(req.params.id), is_hidden: req.body.isHidden, is_flagged: req.body.isFlagged }); } catch (erreur) { return next(erreur); }
}
async function verifierBarbier(req, res, next) {
  try {
    const [resultat] = await pool.execute('UPDATE barbers SET verification_status = ? WHERE user_id = ?', [req.body.status, req.params.id]);
    if (!resultat.affectedRows) return res.status(404).json({ message: 'Profil barbier introuvable.' });
    return res.json({ user_id: Number(req.params.id), verification_status: req.body.status });
  } catch (erreur) { return next(erreur); }
}
module.exports = { utilisateurs, avis, changerActivation, modererAvis, verifierBarbier };
