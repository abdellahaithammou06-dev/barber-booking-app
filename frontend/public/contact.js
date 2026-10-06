const subjectsByRole = {
  client: ['Question sur une réservation', 'Modifier ou annuler un rendez-vous', 'Problème avec mon compte', 'Autre demande'],
  barber: ['Créer ou gérer mon profil barbier', 'Mes prestations et horaires', 'Mes rendez-vous clients', 'Autre demande'],
};

const contactForm = document.querySelector('#contact-form');
const roleInput = contactForm.elements.role;
const subjectSelect = contactForm.elements.subject;
const statusText = document.querySelector('#contact-status');

function updateSubjects(role) {
  subjectSelect.replaceChildren(new Option('Choisir un sujet', ''));
  subjectsByRole[role].forEach((subject) => subjectSelect.add(new Option(subject, subject)));
  roleInput.value = role;
}

document.querySelectorAll('[data-contact-role]').forEach((button) => {
  button.addEventListener('click', () => {
    const role = button.dataset.contactRole;
    document.querySelectorAll('[data-contact-role]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    updateSubjects(role);
  });
});

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusText.classList.remove('is-error');
  if (!contactForm.reportValidity()) return;

  let supportEmail = '';
  try {
    const response = await fetch('/api/public-config');
    if (response.ok) supportEmail = (await response.json()).contactEmail?.trim() || '';
  } catch {
    // Le message ci-dessous indique comment terminer la configuration.
  }
  if (!supportEmail) {
    statusText.textContent = 'Le formulaire est prêt, mais l’adresse e-mail de support doit être configurée par le propriétaire du site avant l’envoi.';
    statusText.classList.add('is-error');
    return;
  }

  const data = new FormData(contactForm);
  const roleLabel = data.get('role') === 'barber' ? 'Barbier' : 'Client';
  const shop = data.get('shop');
  const body = `Profil : ${roleLabel}\nNom : ${data.get('name')}\nE-mail : ${data.get('email')}${shop ? `\nSalon : ${shop}` : ''}\n\n${data.get('message')}`;
  const mailto = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(`[Barber Booking] ${data.get('subject')}`)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
  statusText.textContent = 'Votre application e-mail va s’ouvrir avec votre message. Vérifiez-le puis envoyez-le.';
});

const fixedRole = document.body.dataset.contactRole;
if (fixedRole) {
  updateSubjects(fixedRole);
} else {
  contactForm.hidden = true;
  document.querySelector('.contact-layout').hidden = true;
  document.querySelector('.account-help').hidden = true;
}
