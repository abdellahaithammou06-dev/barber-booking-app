const crypto = require('crypto');
const { pool } = require('../config/database');
const { normaliserNumeroWhatsApp } = require('../utils/phone');
const {
  configurationWhatsApp,
  envoyerTexteWhatsApp,
  dateLocaleMaroc,
  instantRendezVous,
} = require('../services/appointmentReminderService');

function memeSecret(a, b) {
  const valeurA = Buffer.from(String(a));
  const valeurB = Buffer.from(String(b));
  return valeurA.length === valeurB.length && crypto.timingSafeEqual(valeurA, valeurB);
}

function verifierWebhook(req, res) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) return res.status(503).send('Webhook WhatsApp non configuré.');
  const { 'hub.mode': mode, 'hub.verify_token': tokenRecu, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && challenge && memeSecret(tokenRecu, token)) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

function verifierSignatureWebhook(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.get('x-hub-signature-256') || '';
  if (!secret || !req.rawBody || !signature.startsWith('sha256=')) return false;
  const attendue = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  return memeSecret(signature, attendue);
}

function decalageJour(date, nombre) {
  const [annee, mois, jour] = date.split('-').map(Number);
  const valeur = new Date(Date.UTC(annee, mois - 1, jour + nombre, 12));
  return `${valeur.getUTCFullYear()}-${String(valeur.getUTCMonth() + 1).padStart(2, '0')}-${String(valeur.getUTCDate()).padStart(2, '0')}`;
}

function texteMessage(message) {
  const direct = message.text?.body;
  const bouton = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
  return String(direct || bouton || '').trim();
}

function reponseDuBot(texte, rendezVous) {
  const cle = texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/adresse|ou se trouve|localisation|position/.test(cle)) {
    return rendezVous.address
      ? `Le salon ${rendezVous.shop_name} se trouve à : ${rendezVous.address}${rendezVous.barber_phone ? `\nTéléphone : ${rendezVous.barber_phone}` : ''}`
      : `L’adresse du salon ${rendezVous.shop_name} n’a pas été renseignée. Vous pouvez contacter le barbier${rendezVous.barber_phone ? ` au ${rendezVous.barber_phone}` : ''}.`;
  }
  if (/heure|quand|detail|rdv|rendez vous|horaire/.test(cle)) {
    return `Votre rendez-vous : ${rendezVous.service_name} chez ${rendezVous.shop_name}, le ${rendezVous.date} à ${String(rendezVous.time).slice(0, 5)}.`;
  }
  if (/annul/.test(cle)) {
    return 'Pour annuler, connectez-vous à Barber Booking et ouvrez « Mes réservations ». Les conditions d’annulation s’appliquent.';
  }
  if (/humain|barbier|contact|appeler|telephone/.test(cle)) {
    return rendezVous.barber_phone
      ? `Vous pouvez joindre le salon ${rendezVous.shop_name} au ${rendezVous.barber_phone}.`
      : `Le salon ${rendezVous.shop_name} n’a pas renseigné de numéro de téléphone.`;
  }
  return `Bonjour ! Je peux vous aider pour ${rendezVous.shop_name}. Écrivez « adresse », « détails » ou « contact » pour continuer.`;
}

async function traiterMessage(whatsapp, message) {
  const telephone = normaliserNumeroWhatsApp(`+${message.from || ''}`);
  const texte = texteMessage(message);
  if (!telephone || !texte) return;
  const aujourdHui = dateLocaleMaroc();
  const debut = decalageJour(aujourdHui, -1);
  const fin = decalageJour(aujourdHui, 30);
  const [rendezVous] = await pool.execute(
    `SELECT a.date, a.time, s.name AS service_name, b.shop_name,
            b.address, b.phone AS barber_phone
       FROM appointments a
       JOIN barbers b ON b.id = a.barber_id
       JOIN services s ON s.id = a.service_id
      WHERE a.client_phone = ? AND a.whatsapp_opt_in = TRUE
        AND a.status = 'confirmed' AND a.date BETWEEN ? AND ?
      ORDER BY a.date, a.time`,
    [telephone, debut, fin],
  );
  const maintenant = Date.now();
  const proche = rendezVous
    .map((rdv) => ({ ...rdv, instant: instantRendezVous(rdv.date, rdv.time) }))
    .filter((rdv) => rdv.instant >= maintenant - 24 * 60 * 60 * 1000 && rdv.instant <= maintenant + 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => Math.abs(a.instant - maintenant) - Math.abs(b.instant - maintenant))[0];
  if (!proche) return;

  const dateAffichee = new Intl.DateTimeFormat('fr-MA', {
    timeZone: 'Africa/Casablanca', dateStyle: 'long',
  }).format(new Date(proche.instant));
  await envoyerTexteWhatsApp(whatsapp, telephone, reponseDuBot(texte, { ...proche, date: dateAffichee }));
}

function recevoirWebhook(req, res) {
  if (!verifierSignatureWebhook(req)) return res.sendStatus(401);
  res.sendStatus(200);
  const whatsapp = configurationWhatsApp();
  if (!whatsapp) return;
  const messages = (req.body.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || []);
  void messages.reduce((chain, message) => chain.then(() => traiterMessage(whatsapp, message)), Promise.resolve())
    .catch((erreur) => console.error('Échec du traitement d’un message WhatsApp :', erreur.message));
}

module.exports = { verifierWebhook, recevoirWebhook };
