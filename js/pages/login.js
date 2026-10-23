/* JALACHAYA - Login page */

UI.initPublicPage();

const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const messageBox = document.getElementById('loginMessage');
function updateTeamSelection() {
  const worker = document.getElementById('loginRole').value === ROLES.WORKER;
  document.getElementById('workerTeamGroup').classList.toggle('hidden', !worker);
  document.getElementById('loginRoleFields').classList.toggle('has-worker-team', worker);
  document.getElementById('loginTeam').disabled = !worker;
  document.getElementById('loginTeam').required = worker;
}
document.getElementById('loginRole').addEventListener('change', updateTeamSelection);
updateTeamSelection();

// Already logged in? Go straight to the dashboard.
const existingSession = Auth.getSession();
if (existingSession) {
  window.location.replace(Auth.homeFor(existingSession.role));
}

// Messages passed in the URL
if (UI.queryParam('loggedOut')) {
  messageBox.innerHTML = '<div class="alert alert-success">You have been logged out.</div>';
} else if (UI.queryParam('next')) {
  messageBox.innerHTML = '<div class="alert alert-info">Please log in to continue.</div>';
}

// Accounts are published only when the Java installation explicitly enables judge demos.
http('GET', '/api/public/demo-accounts').then(function (data) {
  if (!data.enabled || !data.accounts.length) return;
  const container = document.getElementById('judgeAccountButtons');
  data.accounts.forEach(function (account) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-small btn-secondary';
    button.textContent = account.label;
    button.addEventListener('click', function () {
      document.getElementById('loginRole').value = account.role;
      document.getElementById('loginTeam').value = 'Team 1';
      updateTeamSelection();
      document.getElementById('email').value = account.email;
      document.getElementById('password').value = account.password;
      document.getElementById('loginButton').focus();
    });
    container.appendChild(button);
  });
  document.getElementById('demoAccounts').classList.remove('hidden');
}).catch(function () { /* Ordinary login remains available when the API is unreachable. */ });

loginForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  UI.clearFieldErrors(loginForm);
  messageBox.innerHTML = '';

  const emailInput = document.getElementById('email');
  const roleInput = document.getElementById('loginRole');
  const passwordInput = document.getElementById('password');
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let valid = true;
  if (!roleInput.value) { UI.showFieldError(roleInput, 'Choose your login role.'); valid = false; }
  if (!email) { UI.showFieldError(emailInput, 'Email is required.'); valid = false; }
  if (!password) { UI.showFieldError(passwordInput, 'Password is required.'); valid = false; }
  if (!valid) return;

  UI.setLoading(loginButton, true, 'Logging in...');
  try {
    const session = await API.login(email, password, roleInput.value, roleInput.value === ROLES.WORKER ? document.getElementById('loginTeam').value : undefined);
    Auth.save(session);
    window.location.href = redirectTarget(session.role);
  } catch (error) {
    messageBox.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
    UI.setLoading(loginButton, false);
  }
});

// Return to the page the user was trying to open, if it belongs to their role
function redirectTarget(role) {
  const next = UI.queryParam('next');
  const roleFolder = ROLE_HOME[role].split('/')[0] + '/';
  if (next && /^[a-z]+\/[a-z-]+\.html(\?[\w=&%-]*)?$/.test(next) && next.indexOf(roleFolder) === 0) {
    return next;
  }
  return ROLE_HOME[role];
}
