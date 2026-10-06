const subjectsByRole = {
  client: ['Question sur une réservation', 'Modifier ou annuler un rendez-vous', 'Problème avec mon compte', 'Autre demande'],
  barber: ['Créer ou gérer mon profil barbier', 'Mes prestations et horaires', 'Mes rendez-vous clients', 'Autre demande'],
};

const contactForm = document.querySelector('#contact-form');
const roleInput = contactForm.elements.role;
const subjectSelect = contactForm.elements.subject;
const statusText = document.querySelector('#contact-status');

function updateSubjects(role) {
  const selectedSubject = subjectSelect.value;
  const options = [new Option('Choisir un sujet', '')];
  subjectsByRole[role].forEach((subject) => options.push(new Option(subject, subject)));
  subjectSelect.replaceChildren(...options);
  if (subjectsByRole[role].includes(selectedSubject)) subjectSelect.value = selectedSubject;
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
  const data = new FormData(contactForm);
  const bouton = contactForm.querySelector('[type="submit"]');
  bouton.disabled = true;
  statusText.textContent = 'Envoi de votre message…';
  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Le message n’a pas pu être envoyé.');
    statusText.textContent = result.message || 'Votre message a bien été envoyé.';
    contactForm.reset();
    roleInput.value = fixedRole || roleInput.value;
  } catch (error) {
    statusText.textContent = error.message || 'Erreur d’envoi. Réessayez plus tard.';
    statusText.classList.add('is-error');
  } finally {
    bouton.disabled = false;
  }
});

const fixedRole = document.body.dataset.contactRole;
if (fixedRole) {
  roleInput.value = fixedRole;
} else {
  contactForm.hidden = true;
  document.querySelector('.contact-layout').hidden = true;
  document.querySelector('.account-help').hidden = true;
}
