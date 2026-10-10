const form = document.querySelector('[data-account-action]');
const message = document.querySelector('#account-action-message');
const token = new URLSearchParams(location.search).get('token');
const action = form?.dataset.accountAction;

async function send(path, body) {
  const response = await fetch(`/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Une erreur est survenue.');
  return data;
}

if (action === 'verify') {
  form.hidden = true;
  if (token) send('verify-email', { token }).then((data) => { message.textContent = data.message; })
    .catch((error) => { message.textContent = error.message; message.classList.add('is-error'); });
  else form.hidden = false;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = '';
  message.classList.remove('is-error');
  try {
    const values = Object.fromEntries(new FormData(form));
    const path = { forgot: 'forgot-password', resend: 'resend-verification', reset: 'reset-password', verify: 'resend-verification' }[action];
    const data = await send(path, action === 'reset' ? { ...values, token } : values);
    message.textContent = data.message;
    if (action === 'reset') form.reset();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  } finally { button.disabled = false; }
});
