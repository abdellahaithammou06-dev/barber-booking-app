const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

async function authentifier(req, res, next) {
  const entete = req.headers.authorization || '';
  const token = entete.startsWith('Bearer ') ? entete.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Token d’accès manquant.' });

  try {
    const chargeUtile = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const [lignes] = await pool.execute(
      'SELECT id, name, email, role, is_active, auth_version FROM users WHERE id = ?',
      [chargeUtile.id],
    );
    if (!lignes[0] || !lignes[0].is_active || Number(chargeUtile.auth_version || 0) !== Number(lignes[0].auth_version || 0)) {
      return res.status(401).json({ message: 'Compte invalide ou désactivé.' });
    }
    req.utilisateur = lignes[0];
    return next();
  } catch (erreur) {
    return res.status(401).json({ message: 'Token d’accès invalide ou expiré.' });
  }
}

function autoriser(...roles) {
  return (req, res, next) => (roles.includes(req.utilisateur.role)
    ? next()
    : res.status(403).json({ message: 'Droits insuffisants.' }));
}

module.exports = { authentifier, autoriser };
