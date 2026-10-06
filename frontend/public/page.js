const token = localStorage.getItem('accessToken');
let user = null;
try { user = JSON.parse(localStorage.getItem('user')); } catch { /* Session locale invalide. */ }
const role = user?.role;
const roleHome = { client: '/#recherche', barber: '/espace-barbier.html', admin: '/administration.html' };
const requiredRole = document.body.dataset.pageAccess;
if (!token || !role) window.location.replace('/connexion.html');
else if (requiredRole && role !== requiredRole) window.location.replace(roleHome[role] || '/');

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; };
const formatDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const chatPanel = $('#appointment-chat');
const chatLauncher = $('#chat-launcher');
let chatAppointment = null;
let chatOpenedFor = null;
function appointmentInstant(appointment) {
  const date = formatDate(appointment.date);
  const utcGuess = Date.parse(`${date}T${String(appointment.time).slice(0, 5)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utcGuess));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return utcGuess - (Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second)) - utcGuess);
}
function addChatMessage(message, fromClient = false) {
  const node = document.createElement('p');
  node.className = `chat-message${fromClient ? ' is-client' : ''}`;
  node.textContent = message;
  $('#chat-messages')?.append(node);
  $('#chat-messages')?.scrollTo(0, $('#chat-messages').scrollHeight);
}
function chatOptions(options) {
  const replies = $('#chat-replies');
  if (!replies) return;
  replies.innerHTML = options.map((option, index) => `<button type="button" class="${index ? 'button-secondary' : ''}" data-chat-option="${index}">${escapeHtml(option)}</button>`).join('');
}
function openAppointmentChat(appointment, automatic = false) {
  if (!chatPanel) return;
  chatAppointment = appointment;
  chatPanel.hidden = false;
  chatLauncher.hidden = true;
  if (chatOpenedFor !== String(appointment.id)) {
    chatOpenedFor = String(appointment.id);
    $('#chat-messages').replaceChildren();
    const heure = String(appointment.time).slice(0, 5);
    addChatMessage(automatic
      ? `Bonjour ! C’est l’heure de votre rendez-vous au salon ${appointment.shop_name}. Votre prestation : ${appointment.service_name}, à ${heure}. Puis-je vous aider ?`
      : `Bonjour ! Je peux vous aider avec votre rendez-vous chez ${appointment.shop_name}.`);
    chatOptions(['Voir l’adresse', 'Voir les détails', 'Tout va bien']);
  }
}
if (chatLauncher) chatLauncher.hidden = false;
chatLauncher?.addEventListener('click', () => {
  const next = window.currentAppointments?.find((appointment) => appointment.status === 'confirmed');
  if (next) openAppointmentChat(next);
  else {
    chatPanel.hidden = false;
    chatLauncher.hidden = true;
    addChatMessage('Bonjour ! Je suis votre assistant rendez-vous. Un rappel apparaîtra ici à l’heure de votre prochain rendez-vous confirmé.');
    chatOptions(['Compris']);
  }
});
$('.chat-close')?.addEventListener('click', () => { chatPanel.hidden = true; chatLauncher.hidden = false; });
$('#chat-replies')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chat-option]');
  if (!button) return;
  const choice = button.textContent;
  addChatMessage(choice, true);
  if (choice === 'Voir l’adresse') {
    addChatMessage(chatAppointment?.shop_address || 'L’adresse du salon n’a pas été renseignée. Consultez le profil du barbier pour ses coordonnées.');
    if (chatAppointment?.shop_phone) addChatMessage(`Téléphone : ${chatAppointment.shop_phone}`);
    chatOptions(['Voir les détails', 'Merci']);
  } else if (choice === 'Voir les détails') {
    addChatMessage(`${chatAppointment?.service_name || 'Rendez-vous'} · ${formatDate(chatAppointment?.date)} à ${String(chatAppointment?.time || '').slice(0, 5)} · ${chatAppointment?.status || ''}.`);
    chatOptions(['Voir l’adresse', 'Merci']);
  } else {
    addChatMessage('Parfait. Bon rendez-vous et à bientôt !');
    chatOptions([]);
  }
});
let locationMap;
let locationMarker;
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Une erreur est survenue.');
  return body;
}
function showMessage(selector, message, error = false) {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', error);
}
function initializeLocationPicker(profile) {
  const mapElement = $('#location-picker');
  if (!mapElement) return;
  if (!window.L) {
    $('#location-message').textContent = 'La carte ne peut pas être chargée. Vérifiez votre connexion internet.';
    return;
  }
  const latitude = Number(profile?.latitude);
  const longitude = Number(profile?.longitude);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 20 && latitude <= 36.5 && longitude >= -18 && longitude <= -0.5;
  const center = hasLocation ? [latitude, longitude] : [33.5731, -7.5898];
  locationMap = L.map(mapElement, { scrollWheelZoom: false }).setView(center, hasLocation ? 14 : 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(locationMap);
  const updateLocation = (point) => {
    $('#profile-form').elements.latitude.value = point.lat.toFixed(6);
    $('#profile-form').elements.longitude.value = point.lng.toFixed(6);
    $('#location-message').textContent = `Emplacement sélectionné : ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  };
  if (hasLocation) {
    locationMarker = L.marker(center, { draggable: true }).addTo(locationMap);
    locationMarker.on('dragend', (event) => updateLocation(event.target.getLatLng()));
    updateLocation({ lat: latitude, lng: longitude });
  } else {
    $('#location-message').textContent = 'Cliquez sur la carte pour choisir l’emplacement du salon.';
  }
  locationMap.on('click', (event) => {
    if (locationMarker) locationMarker.setLatLng(event.latlng);
    else locationMarker = L.marker(event.latlng, { draggable: true }).addTo(locationMap)
      .on('dragend', (dragEvent) => updateLocation(dragEvent.target.getLatLng()));
    updateLocation(event.latlng);
  });
  window.setTimeout(() => locationMap.invalidateSize(), 0);
}

$('#logout')?.addEventListener('click', () => { localStorage.removeItem('accessToken'); localStorage.removeItem('user'); window.location.assign('/'); });
const login = $('#login-link'); const register = $('#register-link'); const logout = $('#logout');
if (login) login.hidden = true;
if (register) register.hidden = true;
if (logout) logout.hidden = false;
document.querySelectorAll('[data-role-link]').forEach((link) => { const visible = link.dataset.roleLink.split(' ').includes(role); link.hidden = !visible; });

async function loadAppointments() {
  const list = $('#appointment-list') || $('#barber-appointment-list');
  if (!list) return;
  try {
    const appointments = await api('/appointments/me');
    window.currentAppointments = appointments;
    const now = Date.now();
    const due = appointments.find((appointment) => appointment.status === 'confirmed'
      && now >= appointmentInstant(appointment) && now < appointmentInstant(appointment) + 2 * 60 * 1000
      && sessionStorage.getItem(`appointment-reminder-${appointment.id}`) !== 'shown');
    if (due) {
      sessionStorage.setItem(`appointment-reminder-${due.id}`, 'shown');
      openAppointmentChat(due, true);
    }
    const visibleAppointments = appointments.filter((appointment) =>
      !['cancelled_by_client', 'cancelled_by_barber'].includes(appointment.status));
    list.innerHTML = visibleAppointments.length ? visibleAppointments.map((a) => {
      const isBarber = role === 'barber';
      const canCancel = ['pending', 'confirmed'].includes(a.status);
      const canConfirm = isBarber && a.status === 'pending';
      const canComplete = isBarber && a.status === 'confirmed';
      const actions = [
        canConfirm ? `<button data-status="confirmed" data-id="${a.id}">Confirmer</button>` : '',
        canComplete ? `<button data-status="completed" data-id="${a.id}">Terminé</button>` : '',
        canCancel ? `<button class="button-secondary" data-status="${isBarber ? 'cancelled_by_barber' : 'cancelled_by_client'}" data-id="${a.id}">Annuler</button>` : '',
        !isBarber && a.status === 'completed' ? `<button data-review="${a.id}" data-barber="${a.barber_id}">Laisser un avis</button>` : '',
      ].filter(Boolean).join('');
      const party = isBarber ? a.client_name : a.shop_name;
      const price = a.price_at_booking != null ? ` · ${Number(a.price_at_booking).toFixed(2)} MAD` : '';
      return `<article class="appointment"><div><strong>${escapeHtml(party || 'Rendez-vous')}</strong><span class="status-pill">${escapeHtml(a.status)}</span></div><p>${escapeHtml(a.service_name)}${price}</p><p>${formatDate(a.date)} à ${String(a.time).slice(0, 5)}</p>${actions ? `<div class="card-actions">${actions}</div>` : ''}</article>`;
    }).join('') : '<p class="hint">Aucun rendez-vous pour le moment.</p>';
  } catch (error) { list.innerHTML = `<p class="form-message is-error">${escapeHtml(error.message)}</p>`; }
}

document.addEventListener('click', async (event) => {
  const statusButton = event.target.closest('[data-status]');
  const reviewButton = event.target.closest('[data-review]');
  if (statusButton) {
    statusButton.disabled = true;
    try { await api(`/appointments/${statusButton.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: statusButton.dataset.status }) }); await loadAppointments(); }
    catch (error) { statusButton.disabled = false; window.alert(error.message); }
  }
  if (reviewButton) {
    const rating = window.prompt('Votre note sur 5 (de 1 à 5) :', '5');
    if (rating === null) return;
    const comment = window.prompt('Votre commentaire (facultatif) :', '') || '';
    try { await api('/reviews', { method: 'POST', body: JSON.stringify({ barberId: Number(reviewButton.dataset.barber), appointmentId: Number(reviewButton.dataset.review), rating: Number(rating), comment }) }); await loadAppointments(); }
    catch (error) { window.alert(error.message); }
  }
});

async function barberDashboard() {
  const form = $('#profile-form');
  if (!form) return;
  try {
    const [profile, catalog, hours] = await Promise.all([api('/barbers/me/profile'), api('/barbers/services/catalog'), api('/barbers/me/hours')]);
    if (profile) for (const [key, value] of Object.entries({ shopName: profile.shop_name, address: profile.address, phone: profile.phone, description: profile.description, latitude: profile.latitude, longitude: profile.longitude })) form.elements[key].value = value ?? '';
    initializeLocationPicker(profile);
    $('#service-form').elements.serviceId.innerHTML = '<option value="">Choisir une prestation</option>' + catalog.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    $('#hours-fields').innerHTML = days.map((day, dayOfWeek) => {
      const current = hours.find((item) => Number(item.day_of_week) === dayOfWeek);
      return `<div class="hours-row"><label class="day-toggle"><input type="checkbox" name="active-${dayOfWeek}" ${current ? 'checked' : ''}>${day}</label><label>De<input type="time" name="start-${dayOfWeek}" value="${current?.start_time?.slice(0, 5) || '09:00'}"></label><label>À<input type="time" name="end-${dayOfWeek}" value="${current?.end_time?.slice(0, 5) || '22:00'}"></label></div>`;
    }).join('');
    await loadServices();
  } catch (error) { showMessage('#profile-message', error.message, true); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const key of ['latitude', 'longitude']) values[key] = values[key] === '' ? null : Number(values[key]);
    try { await api('/barbers/me/profile', { method: 'PUT', body: JSON.stringify(values) }); showMessage('#profile-message', 'Profil enregistré.'); await loadServices(); }
    catch (error) { showMessage('#profile-message', error.message, true); }
  });
  $('#service-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const serviceForm = event.currentTarget;
    const values = Object.fromEntries(new FormData(serviceForm));
    try { await api(`/barbers/${(await api('/barbers/me/profile')).id}/services`, { method: 'POST', body: JSON.stringify({ serviceId: Number(values.serviceId), price: Number(values.price), durationMinutes: Number(values.durationMinutes) }) }); showMessage('#service-message', 'Prestation enregistrée.'); serviceForm.reset(); serviceForm.elements.durationMinutes.value = 30; await loadServices(); }
    catch (error) { showMessage('#service-message', error.message, true); }
  });
  $('#hours-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      active: data.has(`active-${dayOfWeek}`),
      startTime: data.get(`start-${dayOfWeek}`),
      endTime: data.get(`end-${dayOfWeek}`),
    }));
    try { await api('/barbers/me/hours', { method: 'PUT', body: JSON.stringify({ hours }) }); showMessage('#hours-message', 'Horaires enregistrés.'); }
    catch (error) { showMessage('#hours-message', error.message, true); }
  });
  $('#service-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-service]');
    if (!button || !window.confirm('Retirer cette prestation de votre salon ?')) return;
    try { const profile = await api('/barbers/me/profile'); await api(`/barbers/${profile.id}/services/${button.dataset.removeService}`, { method: 'DELETE' }); await loadServices(); }
    catch (error) { window.alert(error.message); }
  });
  await loadAppointments();
}

async function loadServices() {
  const profile = await api('/barbers/me/profile');
  const list = $('#service-list');
  const serviceForm = $('#service-form');
  if (!profile) {
    list.innerHTML = '<p class="hint">Enregistrez d’abord le profil de votre salon.</p>';
    serviceForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
    return;
  }
  serviceForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = false; });
  const services = await api(`/barbers/${profile.id}/services`);
  list.innerHTML = services.length ? services.map((s) => `<article class="service-row"><div><strong>${escapeHtml(s.name)}</strong><p>${Number(s.price).toFixed(2)} MAD · ${s.duration_minutes} min</p></div><button class="button-secondary" data-remove-service="${s.id}" type="button">Retirer</button></article>`).join('') : '<p class="hint">Aucune prestation ajoutée.</p>';
}

async function adminDashboard() {
  const usersBox = $('#admin-users'); const reviewsBox = $('#admin-reviews');
  async function loadUsers() {
    const users = await api('/admin/users');
    usersBox.innerHTML = `<table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.is_active ? 'Actif' : 'Suspendu'}</td><td><button data-toggle-user="${u.id}" data-active="${u.is_active ? 'false' : 'true'}">${u.is_active ? 'Suspendre' : 'Réactiver'}</button></td></tr>`).join('')}</tbody></table>`;
  }
  async function loadReviews() {
    const reviews = await api('/admin/reviews');
    reviewsBox.innerHTML = reviews.length ? `<table><thead><tr><th>Salon</th><th>Auteur</th><th>Avis</th><th>Modération</th><th></th></tr></thead><tbody>${reviews.map((r) => `<tr><td>${escapeHtml(r.shop_name)}</td><td>${escapeHtml(r.client_name)}</td><td>★ ${r.rating}<br>${escapeHtml(r.comment)}</td><td>${r.is_hidden ? 'Masqué' : 'Visible'}${r.is_flagged ? ' · Signalé' : ''}</td><td><button data-moderate-review="${r.id}" data-hidden="${r.is_hidden ? 'false' : 'true'}" data-flagged="false">${r.is_hidden ? 'Afficher' : 'Masquer'}</button></td></tr>`).join('')}</tbody></table>` : '<p class="hint">Aucun avis à modérer.</p>';
  }
  document.addEventListener('click', async (event) => {
    const reload = event.target.closest('[data-reload]'); const userButton = event.target.closest('[data-toggle-user]'); const reviewButton = event.target.closest('[data-moderate-review]');
    try {
      if (reload?.dataset.reload === 'users') await loadUsers();
      if (reload?.dataset.reload === 'reviews') await loadReviews();
      if (userButton) { await api(`/admin/users/${userButton.dataset.toggleUser}/active`, { method: 'PUT', body: JSON.stringify({ isActive: userButton.dataset.active === 'true' }) }); await loadUsers(); }
      if (reviewButton) { await api(`/admin/reviews/${reviewButton.dataset.moderateReview}/moderation`, { method: 'PUT', body: JSON.stringify({ isHidden: reviewButton.dataset.hidden === 'true', isFlagged: reviewButton.dataset.flagged === 'true' }) }); await loadReviews(); }
    } catch (error) { window.alert(error.message); }
  });
  try { await Promise.all([loadUsers(), loadReviews()]); } catch (error) { if (usersBox) usersBox.innerHTML = `<p class="form-message is-error">${escapeHtml(error.message)}</p>`; }
}

$('#refresh-appointments')?.addEventListener('click', loadAppointments);
if ($('#appointment-chat')) window.setInterval(loadAppointments, 15000);

if ($('#profile-form')) barberDashboard();
else if ($('#admin-users')) adminDashboard();
else loadAppointments();
