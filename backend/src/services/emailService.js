async function envoyerEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY n’est pas configurée.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL || 'Barber Booking <onboarding@resend.dev>',
      to: [to], subject, text,
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

module.exports = { envoyerEmail, urlApplication };
