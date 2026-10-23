'use strict';
const notificationSession = Auth.getSession();
if (!notificationSession) location.replace('login.html');
else {
  document.getElementById('backToDashboard').href = Auth.homeFor(notificationSession.role);
  loadNotifications();
  setInterval(function () { if (!document.hidden) loadNotifications(); }, 20000);
}
async function loadNotifications() {
  const status = document.getElementById('notificationStatus');
  try {
    const inbox = await http('GET', '/api/notifications');
    status.textContent = inbox.unreadCount + ' unread';
    const list = document.getElementById('notificationList');
    list.innerHTML = inbox.items.length ? inbox.items.map(function (item) {
      return '<article class="card mb-2"><p>' + UI.escape(item.message) + '</p><p class="small muted">' +
        UI.escape(UI.formatDate(item.createdAt)) + '</p>' + (item.read ? '<span>Read</span>' :
          '<button class="btn btn-small" data-read="' + item.id + '">Mark as read</button>') + '</article>';
    }).join('') : '<p>No notifications yet.</p>';
    list.querySelectorAll('[data-read]').forEach(function (button) {
      button.addEventListener('click', async function () {
        button.disabled = true;
        try { await http('POST', '/api/notifications/' + button.dataset.read + '/read'); await loadNotifications(); }
        catch (error) { status.textContent = error.message; button.disabled = false; }
      });
    });
  } catch (error) { status.textContent = error.message; }
}
