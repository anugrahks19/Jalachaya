'use strict';
const resetToken = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
const resetForm = document.getElementById('resetForm');
const resetMessage = document.getElementById('resetMessage');
if (resetToken) {
  resetForm.classList.remove('hidden');
  document.getElementById('recoveryHelp').textContent = 'Choose a password of at least 12 characters. Your other sessions will be logged out.';
}
resetForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const password = document.getElementById('newPassword').value;
  if (password !== document.getElementById('confirmPassword').value) {
    resetMessage.textContent = 'Passwords do not match.';
    return;
  }
  const button = document.getElementById('resetButton');
  UI.setLoading(button, true, 'Changing password...');
  try {
    const result = await http('POST', '/api/auth/reset-password', { token: resetToken, password: password });
    Auth.logout();
    resetMessage.textContent = result.message;
    resetForm.reset();
    resetForm.classList.add('hidden');
  } catch (error) { resetMessage.textContent = error.message; }
  finally { UI.setLoading(button, false); }
});
