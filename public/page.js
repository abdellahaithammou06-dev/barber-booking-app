const token = localStorage.getItem('accessToken');
const login = document.querySelector('#login-link');
const register = document.querySelector('#register-link');
const logout = document.querySelector('#logout');

function updateNavigation(connected) {
  login.hidden = connected;
  register.hidden = connected;
  logout.hidden = !connected;
  login.style.display = connected ? 'none' : '';
  register.style.display = connected ? 'none' : '';
  logout.style.display = connected ? 'inline-block' : 'none';
}

logout.addEventListener('click', () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  updateNavigation(false);
  window.location.assign('/');
});

updateNavigation(Boolean(token));

const appointmentList = document.querySelector('#appointment-list');
if (appointmentList && token) {
  fetch('/appointments/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Impossible de charger les réservations.');
      return data;
    })
    .then((appointments) => {
      appointmentList.innerHTML = appointments.length
        ? appointments.map((appointment) => `<article class="appointment"><strong>${escapeHtml(appointment.shop_name || appointment.client_name)}</strong> — ${escapeHtml(appointment.service_name)}<br>${String(appointment.date).slice(0, 10)} à ${String(appointment.time).slice(0, 5)} · ${escapeHtml(appointment.status)}</article>`).join('')
        : '<p>Aucun rendez-vous.</p>';
    })
    .catch((error) => { appointmentList.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`; });
} else if (appointmentList) {
  appointmentList.innerHTML = '<p class="hint">Connectez-vous pour consulter vos rendez-vous.</p>';
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value || '';
  return element.innerHTML;
}
