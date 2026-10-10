const form = document.querySelector('#login-form, #register-form');
const message = document.querySelector('#auth-message');
const googleButton = document.querySelector('#google-signin');
const googleDivider = document.querySelector('.auth-divider');
const googleHint = document.querySelector('.google-hint');
const requestedRole = new URLSearchParams(window.location.search).get('role');

function afficherOptionGoogle(visible) {
  [googleDivider, googleButton, googleHint].forEach((element) => {
    if (element) element.hidden = !visible;
  });
}

if (form?.id === 'register-form' && ['client', 'barber'].includes(requestedRole)) {
  form.elements.role.value = requestedRole;
}

if (form?.id === 'register-form') {
  const updateRegisterIntro = () => {
    const isBarber = form.elements.role.value === 'barber';
    document.querySelector('.auth-card h1').textContent = isBarber ? 'Créer un compte barbier' : 'Créer un compte';
    document.querySelector('.auth-card > p:not(.eyebrow):not(.auth-switch)').textContent = isBarber
      ? 'Présentez votre salon et gérez vos rendez-vous sur Barber Booking.'
      : 'Inscrivez-vous pour réserver votre prochain rendez-vous.';
  };
  form.elements.role.addEventListener('change', updateRegisterIntro);
  updateRegisterIntro();
}

function destinationFor(user) {
  return user?.role === 'barber' ? '/espace-barbier.html' : '/#recherche';
}

function ouvrirSession(data) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('user', JSON.stringify(data.utilisateur));
  window.location.assign(destinationFor(data.utilisateur));
}

if (localStorage.getItem('accessToken')) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const creatingBarberAccount = form?.id === 'register-form' && requestedRole === 'barber';
    const clientCreatingSeparateBarberAccount = creatingBarberAccount && currentUser?.role === 'client';
    if (clientCreatingSeparateBarberAccount) {
      message.textContent = 'Vous êtes déjà connecté avec un compte client. Pour créer un compte barbier distinct, utilisez une autre adresse e-mail. Votre session client restera active jusqu’à la création du nouveau compte.';
    } else {
      window.location.replace(destinationFor(currentUser));
    }
  } catch { window.location.replace('/'); }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const isRegister = form.id === 'register-form';
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = '';
  message.classList.remove('is-error');

  try {
    const response = await fetch(isRegister ? '/auth/register' : '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Une erreur est survenue.');
    if (data.message && !data.accessToken) {
      message.textContent = data.message;
      button.disabled = false;
      message.tabIndex = -1;
      message.focus();
      return;
    }
    ouvrirSession(data);
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
    message.tabIndex = -1;
    message.focus();
    button.disabled = false;
  }
});

async function initialiserConnexionGoogle() {
  if (!googleButton) return;
  afficherOptionGoogle(false);
  try {
    const configResponse = await fetch('/auth/google/config');
    const config = await configResponse.json();
    if (!configResponse.ok || !config.clientId) return;

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
    afficherOptionGoogle(true);
  } catch {
    afficherOptionGoogle(false);
    message.textContent = 'Impossible de charger la connexion Google. Réessayez plus tard.';
  }
}

initialiserConnexionGoogle();
