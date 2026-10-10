const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../config/database');
const { creerTokens } = require('../config/tokens');
const { envoyerEmail, urlApplication, emailConfigure } = require('../services/emailService');

const googleClient = new OAuth2Client();

function reponseUtilisateur(utilisateur) {
  return { id: utilisateur.id, name: utilisateur.name, email: utilisateur.email, role: utilisateur.role };
}

async function inscrire(req, res, next) {
  const { name, email, password, role = 'client' } = req.body;
  try {
    const verificationRequise = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    if (verificationRequise && !emailConfigure()) return res.status(503).json({ message: 'La vérification des e-mails doit être configurée avant les nouvelles inscriptions.' });
    const [existants] = await pool.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existants.length) return res.status(409).json({ message: 'Cette adresse e-mail est déjà utilisée.' });
    const hash = await bcrypt.hash(password, 12);
    const [resultat] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase(), hash, role, !verificationRequise],
    );
    const utilisateur = { id: resultat.insertId, name: name.trim(), email: email.toLowerCase(), role, auth_version: 0 };
    if (verificationRequise) {
      try { await envoyerActionEmail(utilisateur, 'verify_email'); }
      catch (erreur) { console.error('Échec de l’e-mail de vérification :', erreur.message); }
      return res.status(201).json({ message: 'Compte créé. Consultez votre boîte e-mail pour vérifier votre adresse avant de vous connecter.' });
    }
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
    if (!utilisateur.email_verified) return res.status(403).json({ message: 'Vérifiez votre adresse e-mail avant de vous connecter.' });
    return res.json({ utilisateur: reponseUtilisateur(utilisateur), ...creerTokens(utilisateur) });
  } catch (erreur) { return next(erreur); }
}

async function renouveler(req, res) {
  try {
    const chargeUtile = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET);
    const [lignes] = await pool.execute('SELECT id, name, email, role, is_active, auth_version FROM users WHERE id = ?', [chargeUtile.id]);
    if (!lignes[0] || !lignes[0].is_active) return res.status(401).json({ message: 'Compte invalide ou désactivé.' });
    if (Number(chargeUtile.auth_version || 0) !== Number(lignes[0].auth_version || 0)) return res.status(401).json({ message: 'Session révoquée. Connectez-vous de nouveau.' });
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
      'SELECT id, name, email, role, is_active, email_verified, google_sub, auth_version FROM users WHERE google_sub = ? OR email = ? FOR UPDATE',
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
      await connexionBDD.execute('UPDATE users SET email_verified = TRUE WHERE id = ?', [utilisateur.id]);
      utilisateur.email_verified = true;
      if (!utilisateur.google_sub) {
        await connexionBDD.execute('UPDATE users SET google_sub = ?, email_verified = TRUE WHERE id = ?', [payload.sub, utilisateur.id]);
        utilisateur.email_verified = true;
      }
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
      const [resultat] = await connexionBDD.execute(
        'INSERT INTO users (name, email, password_hash, role, google_sub, email_verified) VALUES (?, ?, ?, \'client\', ?, TRUE)',
        [name, email, passwordHash, payload.sub],
      );
      utilisateur = { id: resultat.insertId, name, email, role: 'client', auth_version: 0 };
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

async function envoyerActionEmail(utilisateur, purpose) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const duree = purpose === 'verify_email' ? 24 : 1;
  await pool.execute('UPDATE email_action_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [utilisateur.id, purpose]);
  await pool.execute('INSERT INTO email_action_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR))', [utilisateur.id, purpose, tokenHash, duree]);
  const path = purpose === 'verify_email' ? `/verification.html?token=${token}` : `/reinitialiser-mot-de-passe.html?token=${token}`;
  const subject = purpose === 'verify_email' ? 'Vérifiez votre adresse e-mail — Barber Booking' : 'Réinitialisez votre mot de passe — Barber Booking';
  const instruction = purpose === 'verify_email' ? 'Pour vérifier votre adresse e-mail, ouvrez ce lien :' : 'Pour choisir un nouveau mot de passe, ouvrez ce lien :';
  await envoyerEmail({ to: utilisateur.email, subject, text: `Bonjour ${utilisateur.name},\n\n${instruction}\n${urlApplication(path)}\n\nCe lien expire dans ${duree} h. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.` });
}

async function verifierEmail(req, res, next) {
  const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
  let connexionBDD;
  try {
    connexionBDD = await pool.getConnection();
    await connexionBDD.beginTransaction();
    const [[action]] = await connexionBDD.execute("SELECT id, user_id FROM email_action_tokens WHERE token_hash = ? AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP FOR UPDATE", [tokenHash]);
    if (!action) { await connexionBDD.rollback(); return res.status(400).json({ message: 'Ce lien est invalide ou expiré. Demandez un nouveau lien.' }); }
    await connexionBDD.execute('UPDATE users SET email_verified = TRUE WHERE id = ?', [action.user_id]);
    await connexionBDD.execute('UPDATE email_action_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [action.id]);
    await connexionBDD.commit();
    return res.json({ message: 'Adresse e-mail vérifiée. Vous pouvez vous connecter.' });
  } catch (erreur) { if (connexionBDD) await connexionBDD.rollback(); return next(erreur); }
  finally { connexionBDD?.release(); }
}

async function renvoyerVerification(req, res, next) {
  if (!emailConfigure()) return res.status(503).json({ message: 'L’envoi des e-mails n’est pas configuré sur ce serveur. Contactez l’administrateur.' });
  try {
    const [[utilisateur]] = await pool.execute('SELECT id, name, email FROM users WHERE email = ? AND email_verified = FALSE', [req.body.email.toLowerCase()]);
    if (utilisateur) await envoyerActionEmail(utilisateur, 'verify_email');
    return res.json({ message: 'Si cette adresse attend une vérification, un nouveau lien lui a été envoyé.' });
  } catch (erreur) { return next(erreur); }
}

async function demanderReinitialisation(req, res, next) {
  if (!emailConfigure()) return res.status(503).json({ message: 'L’envoi des e-mails n’est pas configuré sur ce serveur. Contactez l’administrateur.' });
  try {
    const [[utilisateur]] = await pool.execute('SELECT id, name, email FROM users WHERE email = ?', [req.body.email.toLowerCase()]);
    if (utilisateur) {
      try { await envoyerActionEmail(utilisateur, 'reset_password'); }
      catch (erreur) { console.error('Échec de l’e-mail de réinitialisation :', erreur.message); }
    }
    return res.json({ message: 'Si un compte existe avec cette adresse, un lien de réinitialisation lui a été envoyé.' });
  } catch (erreur) { return next(erreur); }
}

async function reinitialiserMotDePasse(req, res, next) {
  const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
  let connexionBDD;
  try {
    connexionBDD = await pool.getConnection();
    await connexionBDD.beginTransaction();
    const [[action]] = await connexionBDD.execute("SELECT id, user_id FROM email_action_tokens WHERE token_hash = ? AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP FOR UPDATE", [tokenHash]);
    if (!action) { await connexionBDD.rollback(); return res.status(400).json({ message: 'Ce lien est invalide ou expiré. Demandez-en un nouveau.' }); }
    const hash = await bcrypt.hash(req.body.password, 12);
    await connexionBDD.execute('UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?', [hash, action.user_id]);
    await connexionBDD.execute('UPDATE email_action_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND purpose = \'reset_password\' AND consumed_at IS NULL', [action.user_id]);
    await connexionBDD.commit();
    return res.json({ message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.' });
  } catch (erreur) { if (connexionBDD) await connexionBDD.rollback(); return next(erreur); }
  finally { connexionBDD?.release(); }
}

module.exports = { inscrire, connexion, renouveler, configurationGoogle, connexionGoogle, verifierEmail, renvoyerVerification, demanderReinitialisation, reinitialiserMotDePasse };
