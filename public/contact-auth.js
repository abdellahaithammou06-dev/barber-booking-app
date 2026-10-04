const contactToken = localStorage.getItem('accessToken');
let contactUser = null;
try { contactUser = JSON.parse(localStorage.getItem('user')); } catch { /* Ignore malformed session data. */ }

const contactSignedIn = Boolean(contactToken && contactUser?.role);
document.querySelector('#login-link')?.toggleAttribute('hidden', contactSignedIn);
document.querySelector('#register-link')?.toggleAttribute('hidden', contactSignedIn);
document.querySelector('#logout')?.toggleAttribute('hidden', !contactSignedIn);

document.querySelectorAll('[data-role-link]').forEach((link) => {
  link.hidden = !contactUser?.role || !link.dataset.roleLink.split(' ').includes(contactUser.role);
});

document.querySelector('#logout')?.addEventListener('click', () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  window.location.assign('/');
});
