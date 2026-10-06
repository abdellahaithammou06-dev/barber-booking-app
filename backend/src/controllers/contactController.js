async function envoyer(req, res) {
  const { name, email, role, shop = '', subject, message } = req.body;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || 'Barber Booking <onboarding@resend.dev>',
        to: [process.env.CONTACT_EMAIL || 'abdellahaithammou06@gmail.com'],
        reply_to: email.trim(),
        subject: `[Barber Booking] ${subject}`,
        text,
      }),
    });

    if (!response.ok) {
      console.error('Échec du fournisseur e-mail (Resend), statut :', response.status);
      return res.status(502).json({ message: 'Le message n’a pas pu être envoyé. Réessayez plus tard.' });
    }
    return res.status(200).json({ message: 'Votre message a bien été envoyé.' });
  } catch (error) {
    console.error('Service e-mail momentanément indisponible :', error.message);
    return res.status(502).json({ message: 'Le service e-mail est momentanément indisponible. Réessayez plus tard.' });
  }
}

module.exports = { envoyer };
