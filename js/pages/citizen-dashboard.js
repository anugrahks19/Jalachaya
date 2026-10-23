/* JALACHAYA - Citizen dashboard: list and track my complaints */

const session = Auth.requireRole(ROLES.CITIZEN);
let myComplaints = [];
let lastStatuses = null;   // complaint id -> status, to spot live changes
let changedIds = [];       // rows to highlight after a live update

if (session) {
  UI.initDashboard(session);
  showUrlMessages();
  fillStatusFilter();
  document.getElementById('statusFilter').addEventListener('change', renderTable);
  document.getElementById('searchInput').addEventListener('input', renderTable);
  loadComplaints().then(function () {
    // Opened from a link such as dashboard.html?open=12
    const openId = UI.queryParam('open');
    if (openId) openComplaint(openId);
  });
  Live.start(loadComplaints, { statusId: 'liveStatus' });
}

function showUrlMessages() {
  const alertBox = document.getElementById('pageAlert');
  if (UI.queryParam('welcome')) {
    alertBox.innerHTML = '<div class="alert alert-success">Welcome to JALACHAYA, ' + UI.escape(session.name) +
      '. You can now report problems at any registered pond.</div>';
  }
}

function fillStatusFilter() {
  const select = document.getElementById('statusFilter');
  Object.keys(STATUS_LABELS).forEach(function (key) {
    select.insertAdjacentHTML('beforeend', '<option value="' + key + '">' + STATUS_LABELS[key] + '</option>');
  });
}

async function loadComplaints() {
  try {
    // Both requests run at the same time
    const results = await Promise.all([API.getMyProblems(), API.getPendingVerifications()]);
    myComplaints = results[0];
    const pending = results[1].filter(function (v) { return !v.myResponse; });

    Motion.countTo(document.getElementById('statTotal'), myComplaints.length);
    Motion.countTo(document.getElementById('statOpen'), myComplaints.filter(function (c) {
      return ['ASSIGNED', 'IN_PROGRESS', 'COMPLETION_CLAIMED', 'COMMUNITY_VERIFICATION'].indexOf(c.status) !== -1;
    }).length);
    Motion.countTo(document.getElementById('statResolved'), myComplaints.filter(function (c) { return c.status === 'VERIFIED'; }).length);
    Motion.countTo(document.getElementById('statVerify'), pending.length);

    announceChanges();
    renderTable();
  } catch (error) {
    document.getElementById('complaintTableBody').innerHTML =
      '<tr class="empty-row"><td colspan="6">Could not load complaints.</td></tr>';
    UI.showError(error);
  }
}

// After a live refresh: tell the citizen which complaints moved forward
function announceChanges() {
  const now = {};
  changedIds = [];
  myComplaints.forEach(function (c) {
    now[c.id] = c.status;
    if (lastStatuses && lastStatuses[c.id] && lastStatuses[c.id] !== c.status) {
      changedIds.push(c.id);
      UI.toast(c.code + ' is now: ' + STATUS_LABELS[c.status]);
    }
  });
  lastStatuses = now;
}

function renderTable() {
  const status = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const tbody = document.getElementById('complaintTableBody');

  const rows = myComplaints.filter(function (c) {
    if (status && c.status !== status) return false;
    if (search) {
      const text = (c.code + ' ' + c.pondName + ' ' + c.description).toLowerCase();
      if (text.indexOf(search) === -1) return false;
    }
    return true;
  });

  if (myComplaints.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">You have not reported any problems yet. ' +
      '<a href="report.html">Report your first problem</a>.</td></tr>';
    return;
  }
  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No complaints match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (c) {
    return '<tr class="' + (changedIds.indexOf(c.id) !== -1 ? 'is-new' : '') + '">' +
      '<td><strong>' + UI.escape(c.code) + '</strong></td>' +
      '<td>' + UI.escape(c.pondName) + '</td>' +
      '<td>' + UI.escape(UI.categoryLabel(c.category)) + '</td>' +
      '<td>' + UI.formatDate(c.createdAt) + '</td>' +
      '<td>' + UI.statusBadge(c.status) + '</td>' +
      '<td class="text-right"><button type="button" class="btn btn-small btn-outline" data-open="' + c.id + '">View</button></td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-open]').forEach(function (button) {
    button.addEventListener('click', function () { openComplaint(button.dataset.open); });
  });
}

async function openComplaint(id) {
  const body = document.getElementById('complaintDialogBody');
  body.innerHTML = '<p class="muted">Loading...</p>';
  UI.openDialog('complaintDialog');

  try {
    const c = await API.getProblem(id);
    document.getElementById('complaintDialogTitle').textContent = 'Complaint ' + c.code;

    let extra = '';
    if (c.status === 'REJECTED' && c.rejectionReason) {
      extra += '<div class="alert alert-error"><strong>Rejected:</strong> ' + UI.escape(c.rejectionReason) + '</div>';
    }
    if (c.status === 'COMMUNITY_VERIFICATION') {
      extra += '<div class="alert alert-info">The work has been completed. Please <a href="verify.html">check and verify it</a>.</div>';
    }
    if (c.status === 'REOPENED') {
      extra += '<div class="alert alert-warning">The community reported the problem is not solved. The Panchayat will reassign it.</div>';
    }

    let evidence = '';
    if (c.task && c.task.evidence) {
      evidence = '<div class="section-label">Work evidence</div>' +
        '<div class="evidence-grid">' +
          UI.photo(c.task.evidence.beforeImageUrl, 'Before work', 'No before photo') +
          UI.photo(c.task.evidence.afterImageUrl, 'After work', 'No after photo') +
        '</div>' +
        '<p class="small mt-1"><strong>Field team remarks:</strong> ' + UI.escape(c.task.evidence.remarks) + '</p>';
    }

    body.innerHTML =
      UI.stepper(c.status) + extra +
      '<div class="section-label">Details</div>' +
      '<dl class="detail-grid">' +
        '<dt>Pond</dt><dd>' + UI.escape(c.pondName) + '</dd>' +
        '<dt>Category</dt><dd>' + UI.escape(UI.categoryLabel(c.category)) + '</dd>' +
        '<dt>Description</dt><dd>' + UI.escape(c.description) + '</dd>' +
        '<dt>Landmark</dt><dd>' + UI.escape(c.landmark || '-') + '</dd>' +
        '<dt>Location</dt><dd>' + Number(c.latitude).toFixed(5) + ', ' + Number(c.longitude).toFixed(5) + '</dd>' +
        '<dt>Reported on</dt><dd>' + UI.formatDateTime(c.createdAt) + '</dd>' +
        (c.task ? '<dt>Target date</dt><dd>' + UI.formatDateTime(c.task.deadline) + '</dd>' : '') +
      '</dl>' +
      '<div class="section-label">Photos (' + c.images.length + ')</div>' +
      UI.gallery(c.images, 'No photos attached to this complaint yet') +
      addPhotoForm(c) +
      evidence +
      '<div class="section-label">History</div>' +
      UI.timeline(c.history);

    setupAddPhoto(c);
  } catch (error) {
    body.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
  }
}

/* ---------- Add a photo to an open complaint ---------- */
let addPhotoPicker = null;

function canAddPhoto(c) {
  return c.status !== 'VERIFIED' && c.status !== 'REJECTED' && c.images.length < CONFIG.MAX_COMPLAINT_PHOTOS;
}

function addPhotoForm(c) {
  if (!canAddPhoto(c)) return '';
  return '<details class="mt-2" id="addPhotoDetails"><summary class="small">Add another photo</summary>' +
    '<form id="addPhotoForm" class="mt-1" novalidate>' +
      '<div id="addPhotoPicker"></div>' +
      '<div class="form-group mt-1"><label for="addPhotoCaption">Caption <span class="optional">(optional)</span></label>' +
        '<input type="text" id="addPhotoCaption" maxlength="80" placeholder="e.g. Taken this evening, problem has spread"></div>' +
      '<button type="submit" class="btn btn-small" id="addPhotoBtn">Upload photo</button>' +
    '</form></details>';
}

function setupAddPhoto(c) {
  const form = document.getElementById('addPhotoForm');
  if (!form) return;
  addPhotoPicker = UI.photoPicker(document.getElementById('addPhotoPicker'), { max: 1 });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    UI.clearFieldErrors(form);
    const photos = addPhotoPicker.getPhotos();
    if (photos.length === 0) {
      UI.showFieldError(document.getElementById('addPhotoPicker'), 'Please choose a photo.');
      return;
    }
    const formData = new FormData();
    formData.append('image', photos[0].blob, 'extra-photo.jpg');
    formData.append('caption', document.getElementById('addPhotoCaption').value.trim());

    const button = document.getElementById('addPhotoBtn');
    UI.setLoading(button, true, 'Uploading...');
    try {
      await API.addProblemImage(c.id, formData);
      UI.toast('Photo added to ' + c.code + '.');
      openComplaint(c.id); // refresh the dialog
    } catch (error) {
      UI.showError(error);
      UI.setLoading(button, false);
    }
  });
}
