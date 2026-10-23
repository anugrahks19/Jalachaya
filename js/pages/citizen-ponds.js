'use strict';
// Shared pond browser retains the navigation and permissions of each portal.
const pondPortalRole = ROLES[document.body.dataset.portalRole || 'CITIZEN'];
const session = Auth.requireRole(pondPortalRole);
if (session) {
  UI.initDashboard(session);
  loadCitizenPonds();
  Live.start(loadCitizenPonds, { statusId: 'pondLiveStatus' });
}
async function loadCitizenPonds() {
  const rows = document.getElementById('citizenPondRows');
  try {
    const ponds = await API.getPublicPonds();
    document.getElementById('pondCount').textContent = ponds.length;
    document.getElementById('pondOpenCount').textContent = ponds.reduce((sum, pond) => sum + pond.activeComplaints, 0);
    document.getElementById('pondVerifiedCount').textContent = ponds.reduce((sum, pond) => sum + pond.resolvedComplaints, 0);
    rows.innerHTML = ponds.length ? ponds.map(function (pond) {
      const image = pond.imageUrl ? '<img src="' + UI.escape(UI.imageSrc(pond.imageUrl)) + '" alt="" loading="lazy">' : '';
      return '<tr><td><span class="pond-cell">' + image + '<strong>' + UI.escape(pond.name) + '</strong></span></td><td>' +
        UI.escape(pond.ward) + (pond.village ? ', ' + UI.escape(pond.village) : '') + '</td><td>' + pond.activeComplaints +
        '</td><td>' + pond.resolvedComplaints + '</td><td>' + UI.meter(pond.recoveryPercent) +
        '</td><td><button class="btn btn-small btn-outline" data-pond-id="' + pond.id + '">View details</button></td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="6">No ponds registered yet.</td></tr>';
    rows.querySelectorAll('[data-pond-id]').forEach(function (button) {
      button.addEventListener('click', () => openCitizenPond(button.dataset.pondId));
    });
  } catch (error) {
    rows.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load ponds. Please try again.</td></tr>';
    UI.showError(error);
  }
}
async function openCitizenPond(id) {
  document.getElementById('pondStatusTitle').textContent = 'Pond details';
  const body = document.getElementById('pondStatusBody');
  body.textContent = 'Loading pond details...';
  UI.openDialog('pondStatusDialog');
  try {
    const pond = await API.getPublicPond(id);
    document.getElementById('pondStatusTitle').textContent = pond.name;
    const timeline = (pond.timeline || []).map(item => '<tr><td>' + UI.escape(item.code) + '</td><td>' +
      UI.escape(UI.categoryLabel(item.category)) + '</td><td>' + UI.statusBadge(item.status) + '</td><td>' + UI.formatDate(item.updatedAt) + '</td></tr>').join('');
    body.innerHTML = (pond.imageUrl ? '<img class="citizen-pond-photo" src="' + UI.escape(UI.imageSrc(pond.imageUrl)) + '" alt="' + UI.escape(pond.name) + '">' : '') +
      '<p class="muted">' + UI.escape(pond.ward) + (pond.village ? ', ' + UI.escape(pond.village) : '') + '</p>' +
      '<p>' + UI.escape(pond.description || 'No description added yet.') + '</p><div class="mb-2">' + UI.meter(pond.recoveryPercent) + '</div>' +
      (pondPortalRole === ROLES.CITIZEN ? '<a class="btn mb-2" href="report.html?pond=' + pond.id + '">Report a problem here</a>' : '') + '<h3>Complaint timeline</h3>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Complaint</th><th>Category</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
      (timeline || '<tr class="empty-row"><td colspan="4">No complaints reported for this pond.</td></tr>') + '</tbody></table></div>';
  } catch (error) { body.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>'; }
}
