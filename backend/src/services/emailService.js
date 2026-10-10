function emailConfigure() {
  if (process.env.BREVO_API_KEY) return Boolean(process.env.MAIL_FROM);
  return Boolean(process.env.RESEND_API_KEY);
}

async function envoyerEmail({ to, subject, text, replyTo }) {
  if (process.env.BREVO_API_KEY) {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('MAIL_FROM doit contenir une adresse expéditrice vérifiée dans Brevo.');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Barber Booking', email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      }),
    });
    if (!response.ok) {
      console.error('Échec Brevo, statut :', response.status);
      throw new Error('Le fournisseur e-mail a refusé le message.');
    }
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Aucun fournisseur e-mail n’est configuré.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL || 'Barber Booking <onboarding@resend.dev>',
      to: [to], subject, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!response.ok) {
    console.error('Échec Resend (compte), statut :', response.status);
    throw new Error('Le fournisseur e-mail a refusé le message.');
  }
}

function urlApplication(path) {
  const origin = (process.env.PUBLIC_APP_URL || 'https://barber-booking-app-production.up.railway.app').replace(/\/$/, '');
  return `${origin}${path}`;
}

module.exports = { envoyerEmail, urlApplication, emailConfigure };
