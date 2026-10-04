const form = document.querySelector('#login-form, #register-form');
const message = document.querySelector('#auth-message');
const googleButton = document.querySelector('#google-signin');

function destinationFor(user) {
  return user?.role === 'barber' ? '/espace-barbier.html' : '/#recherche';
}

function ouvrirSession(data) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('user', JSON.stringify(data.utilisateur));
  window.location.assign(destinationFor(data.utilisateur));
}

if (localStorage.getItem('accessToken')) {
  try { window.location.replace(destinationFor(JSON.parse(localStorage.getItem('user')))); } catch { window.location.replace('/'); }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const isRegister = form.id === 'register-form';
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = '';

  try {
    const response = await fetch(isRegister ? '/auth/register' : '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Une erreur est survenue.');
    ouvrirSession(data);
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

async function initialiserConnexionGoogle() {
  if (!googleButton) return;
  try {
    const configResponse = await fetch('/auth/google/config');
    const config = await configResponse.json();
    if (!config.clientId) {
      message.textContent = 'La connexion Google n’est pas encore configurée.';
      return;
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client?hl=fr';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });

    google.accounts.id.initialize({
      client_id: config.clientId,
      callback: async ({ credential }) => {
        message.textContent = 'Connexion Google en cours…';
        try {
          const response = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'La connexion Google a échoué.');
          ouvrirSession(data);
        } catch (error) {
          message.textContent = error.message;
        }
      },
    });
    google.accounts.id.renderButton(googleButton, {
      type: 'standard', shape: 'rectangular', theme: 'outline', size: 'large',
      text: 'continue_with', locale: 'fr', width: 320,
    });
  } catch {
    message.textContent = 'Impossible de charger la connexion Google. Réessayez plus tard.';
  }
}

initialiserConnexionGoogle();
