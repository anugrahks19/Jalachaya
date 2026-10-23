/* Citizen registration: details, then password, with preserved input on Back. */
UI.initPublicPage();
const registerForm = document.getElementById('registerForm');
const registerButton = document.getElementById('registerButton');
const wardSelect = document.getElementById('ward');
const fields = Object.fromEntries(['name', 'email', 'phone', 'password', 'confirmPassword'].map(id => [id, document.getElementById(id)]));
let registrationStep = 1;
for (let i = 1; i <= 12; i++) {
  const option = document.createElement('option');
  option.value = option.textContent = 'Ward ' + i;
  wardSelect.appendChild(option);
}
function showRegistrationStep(step) {
  registrationStep = step;
  document.getElementById('registerTrack').dataset.step = String(step);
  ['detailsStep', 'securityStep'].forEach(function (id, index) {
    const element = document.getElementById(id);
    const active = index + 1 === step;
    element.disabled = !active;
    element.inert = !active;
    element.setAttribute('aria-hidden', String(!active));
  });
  ['detailsProgress', 'securityProgress'].forEach(function (id, index) {
    const element = document.getElementById(id);
    if (index + 1 === step) element.setAttribute('aria-current', 'step');
    else element.removeAttribute('aria-current');
  });
  document.getElementById('registrationSummary').textContent = fields.name.value.trim() + ' · ' + fields.email.value.trim();
  (step === 1 ? fields.name : fields.password).focus({ preventScroll: true });
}
function validateDetails() {
  let valid = true;
  if (fields.name.value.trim().length < 3) { UI.showFieldError(fields.name, 'Please enter your full name.'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) { UI.showFieldError(fields.email, 'Please enter a valid email address.'); valid = false; }
  if (fields.phone.value.trim() && !/^[0-9]{10}$/.test(fields.phone.value.trim())) { UI.showFieldError(fields.phone, 'Mobile number must be 10 digits.'); valid = false; }
  return valid;
}
document.getElementById('registerBackButton').addEventListener('click', function () {
  UI.clearFieldErrors(registerForm);
  document.getElementById('registerMessage').textContent = '';
  showRegistrationStep(1);
});
registerForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  UI.clearFieldErrors(registerForm);
  const message = document.getElementById('registerMessage');
  message.textContent = '';
  if (!validateDetails()) { showRegistrationStep(1); return; }
  if (registrationStep === 1) { showRegistrationStep(2); return; }
  let valid = true;
  if (fields.password.value.length < 6 || new TextEncoder().encode(fields.password.value).length > 72) {
    UI.showFieldError(fields.password, 'Use at least 6 characters and at most 72 UTF-8 bytes.'); valid = false;
  }
  if (fields.password.value !== fields.confirmPassword.value) { UI.showFieldError(fields.confirmPassword, 'Passwords do not match.'); valid = false; }
  if (!valid) return;
  UI.setLoading(registerButton, true, 'Creating account...');
  document.getElementById('registerBackButton').disabled = true;
  try {
    const session = await API.register({ name: fields.name.value.trim(), email: fields.email.value.trim(),
      phone: fields.phone.value.trim(), ward: wardSelect.value, password: fields.password.value });
    Auth.save(session);
    window.location.href = Auth.homeFor(session.role) + '?welcome=1';
  } catch (error) {
    message.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
    if (error.status === 409) showRegistrationStep(1);
    UI.setLoading(registerButton, false);
    document.getElementById('registerBackButton').disabled = false;
  }
});
