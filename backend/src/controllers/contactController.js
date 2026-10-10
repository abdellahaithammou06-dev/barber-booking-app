const { envoyerEmail, emailConfigure } = require('../services/emailService');

async function envoyer(req, res) {
  const { name, email, role, shop = '', subject, message } = req.body;
  if (!emailConfigure()) {
    return res.status(503).json({ message: 'L’envoi des e-mails n’est pas encore configuré sur le serveur.' });
  }

  const profile = role === 'barber' ? 'Barbier' : 'Client';
  const text = [
    `Profil : ${profile}`,
    `Nom : ${name.trim()}`,
    `E-mail : ${email.trim()}`,
    shop.trim() ? `Salon : ${shop.trim()}` : null,
    '',
    message.trim(),
  ].filter((line) => line !== null).join('\n');

  try {
    await envoyerEmail({
      to: process.env.CONTACT_EMAIL || 'abdellahaithammou06@gmail.com',
      replyTo: email.trim(),
      subject: `[Barber Booking] ${subject}`,
      text,
    });
    return res.status(200).json({ message: 'Votre message a bien été envoyé.' });
  } catch (error) {
    console.error('Service e-mail momentanément indisponible :', error.message);
    return res.status(502).json({ message: 'Le service e-mail est momentanément indisponible. Réessayez plus tard.' });
  }
}

module.exports = { envoyer };
