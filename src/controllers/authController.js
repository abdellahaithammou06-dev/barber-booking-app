const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { creerTokens } = require('../config/tokens');

function reponseUtilisateur(utilisateur) {
  return { id: utilisateur.id, name: utilisateur.name, email: utilisateur.email, role: utilisateur.role };
}

async function inscrire(req, res, next) {
  const { name, email, password, role = 'client' } = req.body;
  try {
    const [existants] = await pool.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existants.length) return res.status(409).json({ message: 'Cette adresse e-mail est déjà utilisée.' });
    const hash = await bcrypt.hash(password, 12);
    const [resultat] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase(), hash, role],
    );
    const utilisateur = { id: resultat.insertId, name: name.trim(), email: email.toLowerCase(), role };
    return res.status(201).json({ utilisateur: reponseUtilisateur(utilisateur), ...creerTokens(utilisateur) });
  } catch (erreur) { return next(erreur); }
}

async function connexion(req, res, next) {
  const { email, password } = req.body;
  try {
    const [lignes] = await pool.execute('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    const utilisateur = lignes[0];
    if (!utilisateur || !utilisateur.is_active || !(await bcrypt.compare(password, utilisateur.password_hash))) {
      return res.status(401).json({ message: 'E-mail ou mot de passe incorrect.' });
    }
    return res.json({ utilisateur: reponseUtilisateur(utilisateur), ...creerTokens(utilisateur) });
  } catch (erreur) { return next(erreur); }
}

async function renouveler(req, res) {
  try {
    const chargeUtile = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET);
    const [lignes] = await pool.execute('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [chargeUtile.id]);
    if (!lignes[0] || !lignes[0].is_active) return res.status(401).json({ message: 'Compte invalide ou désactivé.' });
    return res.json(creerTokens(lignes[0]));
  } catch (erreur) { return res.status(401).json({ message: 'Refresh token invalide ou expiré.' }); }
}

module.exports = { inscrire, connexion, renouveler };
