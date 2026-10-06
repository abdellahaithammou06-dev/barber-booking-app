const { pool } = require('../config/database');

const ZONE = 'Africa/Casablanca';
const INTERVAL_MS = 60 * 1000;

function delaiRappelMinutes() {
  const valeur = Number(process.env.APPOINTMENT_REMINDER_MINUTES || 60);
  return Number.isInteger(valeur) && valeur > 0 && valeur <= 10080 ? valeur : 60;
}

function dateLocaleMaroc(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function instantRendezVous(date, time) {
  const dateTexte = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const estimationUtc = Date.parse(`${dateTexte}T${String(time).slice(0, 5)}:00Z`);
  const parties = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(estimationUtc));
  const valeurs = Object.fromEntries(parties.map((partie) => [partie.type, partie.value]));
  const localeCommeUtc = Date.UTC(Number(valeurs.year), Number(valeurs.month) - 1,
    Number(valeurs.day), Number(valeurs.hour), Number(valeurs.minute), Number(valeurs.second));
  return estimationUtc - (localeCommeUtc - estimationUtc);
}

function configurationWhatsApp() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0',
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'appointment_reminder',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr',
  };
}

function formatDate(date, time) {
  const dateTexte = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const [year, month, day] = dateTexte.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-MA', {
    timeZone: ZONE, dateStyle: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day, 12))) + ` à ${String(time).slice(0, 5)}`;
}

async function envoyerModeleWhatsApp(whatsapp, numero, nomModele, langue, parametres) {
  const version = whatsapp.apiVersion.replace(/^v/i, 'v');
  const response = await fetch(`https://graph.facebook.com/${version}/${whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numero.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: nomModele,
        language: { code: langue },
        components: [{
          type: 'body',
          parameters: parametres.map((text) => ({ type: 'text', text: String(text) })),
        }],
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp API a répondu ${response.status}.`);
  return data.messages?.[0]?.id || null;
}

async function envoyerTexteWhatsApp(whatsapp, numero, texte) {
  const version = whatsapp.apiVersion.replace(/^v/i, 'v');
  const response = await fetch(`https://graph.facebook.com/${version}/${whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numero.replace(/^\+/, ''),
      type: 'text',
      text: { preview_url: false, body: texte },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp API a répondu ${response.status}.`);
  return data.messages?.[0]?.id || null;
}

async function envoyerRappelsDus(whatsapp) {
  const maintenant = Date.now();
  const delaiMinutes = delaiRappelMinutes();
  const dateDebut = dateLocaleMaroc(new Date(maintenant));
  const joursRecherche = Math.ceil(delaiMinutes / 1440) + 1;
  const dateFin = dateLocaleMaroc(new Date(maintenant + joursRecherche * 24 * 60 * 60 * 1000));
  const [appointments] = await pool.execute(
    `SELECT a.id, a.client_id, a.client_phone, a.date, a.time, u.name AS client_name,
            b.shop_name, b.address, s.name AS service_name
       FROM appointments a
       JOIN users u ON u.id = a.client_id
       JOIN barbers b ON b.id = a.barber_id
       JOIN services s ON s.id = a.service_id
       LEFT JOIN notifications n ON n.appointment_id = a.id AND n.type = 'reminder'
         AND n.channel = 'whatsapp' AND n.status = 'sent'
      WHERE a.status = 'confirmed' AND a.whatsapp_opt_in = TRUE
        AND a.client_phone IS NOT NULL AND a.date BETWEEN ? AND ? AND n.id IS NULL`,
    [dateDebut, dateFin],
  );

  for (const appointment of appointments) {
    const cible = instantRendezVous(appointment.date, appointment.time);
    if (cible <= maintenant || cible > maintenant + delaiMinutes * 60 * 1000) continue;

    let notificationId;
    let connexion = await pool.getConnection();
    try {
      await connexion.execute(
        `INSERT INTO notifications (user_id, appointment_id, type, channel, status)
         VALUES (?, ?, 'reminder', 'whatsapp', 'pending')
         ON DUPLICATE KEY UPDATE status = IF(status = 'failed', 'pending', status)`,
        [appointment.client_id, appointment.id],
      );
      const [[notification]] = await connexion.execute(
        "SELECT id FROM notifications WHERE appointment_id = ? AND type = 'reminder' AND channel = 'whatsapp'",
        [appointment.id],
      );
      if (!notification) continue;
      notificationId = notification.id;
      const [prise] = await connexion.execute(
        `UPDATE notifications SET status = 'sending', sent_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (status IN ('pending', 'failed')
            OR (status = 'sending' AND sent_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)))`,
        [notificationId],
      );
      if (!prise.affectedRows) continue;
      connexion.release();
      connexion = null;
      const dateHeure = formatDate(appointment.date, appointment.time);
      await envoyerModeleWhatsApp(whatsapp, appointment.client_phone,
        whatsapp.templateName, whatsapp.templateLanguage,
        [appointment.client_name, appointment.shop_name, dateHeure, appointment.service_name]);
      await pool.execute("UPDATE notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?", [notificationId]);
      console.log(`Rappel WhatsApp envoyé pour le rendez-vous ${appointment.id}.`);
    } catch (erreur) {
      if (notificationId) await pool.execute("UPDATE notifications SET status = 'failed' WHERE id = ?", [notificationId]).catch(() => {});
      console.error(`Échec du rappel WhatsApp pour le rendez-vous ${appointment.id} :`, erreur.message);
    } finally {
      if (connexion) connexion.release();
    }
  }
}

function demarrerRappelsRendezVous() {
  const whatsapp = configurationWhatsApp();
  if (!whatsapp) {
    console.warn('Rappels WhatsApp désactivés : configurez WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID.');
    return null;
  }
  const cycle = () => envoyerRappelsDus(whatsapp).catch((erreur) => {
    console.error('Impossible de vérifier les rappels WhatsApp :', erreur.message);
  });
  void cycle();
  const timer = setInterval(cycle, INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  demarrerRappelsRendezVous,
  envoyerModeleWhatsApp,
  envoyerTexteWhatsApp,
  instantRendezVous,
  dateLocaleMaroc,
  configurationWhatsApp,
};
