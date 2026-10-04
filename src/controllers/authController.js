const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../config/database');
const { creerTokens } = require('../config/tokens');

const googleClient = new OAuth2Client();

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

function configurationGoogle(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
}

async function connexionGoogle(req, res, next) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ message: 'La connexion Google n’est pas configurée.' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'Le jeton Google est invalide ou expiré.' });
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return res.status(401).json({ message: 'Google n’a pas confirmé cette adresse e-mail.' });
  }

  const email = payload.email.toLowerCase();
  const name = (payload.name || email.split('@')[0]).trim().slice(0, 100);
  const connexionBDD = await pool.getConnection();
  try {
    await connexionBDD.beginTransaction();
    const [comptes] = await connexionBDD.execute(
      'SELECT id, name, email, role, is_active, google_sub FROM users WHERE google_sub = ? OR email = ? FOR UPDATE',
      [payload.sub, email],
    );
    const compteGoogle = comptes.find((compte) => compte.google_sub === payload.sub);
    const compteEmail = comptes.find((compte) => compte.email.toLowerCase() === email);
    if (compteGoogle && compteEmail && compteGoogle.id !== compteEmail.id) {
      await connexionBDD.rollback();
      return res.status(409).json({ message: 'Ce compte Google est déjà associé à un autre profil.' });
    }

    let utilisateur = compteGoogle || compteEmail;
    if (utilisateur) {
      if (!utilisateur.is_active) {
        await connexionBDD.rollback();
        return res.status(403).json({ message: 'Ce compte est désactivé.' });
      }
      if (utilisateur.google_sub && utilisateur.google_sub !== payload.sub) {
        await connexionBDD.rollback();
        return res.status(409).json({ message: 'Cette adresse e-mail est associée à un autre compte Google.' });
      }
      if (!utilisateur.google_sub) {
        await connexionBDD.execute('UPDATE users SET google_sub = ? WHERE id = ?', [payload.sub, utilisateur.id]);
      }
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
      const [resultat] = await connexionBDD.execute(
        'INSERT INTO users (name, email, password_hash, role, google_sub) VALUES (?, ?, ?, \'client\', ?)',
        [name, email, passwordHash, payload.sub],
      );
      utilisateur = { id: resultat.insertId, name, email, role: 'client' };
    }

    await connexionBDD.commit();
    return res.json({ utilisateur: reponseUtilisateur(utilisateur), ...creerTokens(utilisateur) });
  } catch (erreur) {
    await connexionBDD.rollback();
    if (erreur.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Un compte utilise déjà cette adresse e-mail. Réessayez la connexion Google.' });
    }
    return next(erreur);
  } finally { connexionBDD.release(); }
}

module.exports = { inscrire, connexion, renouveler, configurationGoogle, connexionGoogle };
