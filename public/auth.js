const form = document.querySelector('#login-form, #register-form');
const message = document.querySelector('#auth-message');

if (localStorage.getItem('accessToken')) window.location.replace('/');

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
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.utilisateur));
    window.location.assign('/');
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});
