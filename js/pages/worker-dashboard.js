/* JALACHAYA - Field worker: view assigned tasks and update them.
   The backend only returns tasks assigned to the logged-in worker. */

const session = Auth.requireRole(ROLES.WORKER);
let tasks = [];
let activeTab = 'open';
let selectedTask = null;           // task used by the note / completion dialogs
const pickers = {};                // photo pickers in the dialogs
let newIds = [];                   // tasks that arrived through a live update

// Which tasks appear under each tab
const TAB_FILTERS = {
  open: function (t) { return t.active && ACTIVE_WORK_STATUSES.indexOf(t.stage) !== -1; },
  overdue: function (t) { return t.overdue; },
  submitted: function (t) { return t.stage === 'COMPLETION_CLAIMED' || t.stage === 'COMMUNITY_VERIFICATION'; },
  closed: function (t) { return t.stage === 'VERIFIED' || t.stage === 'CLOSED'; },
  all: function () { return true; }
};

if (session) {
  UI.initDashboard(session);
  setupTabs();
  setupDialogs();
  loadTasks();
  Live.start(loadTasks, { statusId: 'liveStatus' });
}

function setupTabs() {
  document.querySelectorAll('#taskTabs .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#taskTabs .tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderTasks();
    });
  });
}

async function loadTasks() {
  try {
    tasks = await API.getMyTasks();
    newIds = Live.diff('tasks', tasks.map(function (t) { return t.id; }));
    newIds.forEach(function (id) {
      const t = tasks.find(function (x) { return x.id === id; });
      UI.toast('New task assigned: ' + t.problem.code + ' at ' + t.pondName);
    });
    updateCounts();
    renderTasks();
    newIds = []; // highlight only once
  } catch (error) {
    document.getElementById('taskList').innerHTML = '<div class="alert alert-error">Could not load your tasks.</div>';
    UI.showError(error);
  }
}

function countWhere(fn) {
  return tasks.filter(fn).length;
}

function updateCounts() {
  Motion.countTo(document.getElementById('statNew'), countWhere(function (t) { return t.stage === 'ASSIGNED'; }));
  Motion.countTo(document.getElementById('statProgress'), countWhere(function (t) { return t.stage === 'IN_PROGRESS'; }));
  Motion.countTo(document.getElementById('statOverdue'), countWhere(TAB_FILTERS.overdue));
  Motion.countTo(document.getElementById('statSubmitted'), countWhere(TAB_FILTERS.submitted));
  Motion.countTo(document.getElementById('statDone'), countWhere(function (t) { return t.stage === 'VERIFIED'; }));

  document.getElementById('countOpen').textContent = '(' + countWhere(TAB_FILTERS.open) + ')';
  document.getElementById('countOverdue').textContent = '(' + countWhere(TAB_FILTERS.overdue) + ')';
  document.getElementById('countSubmitted').textContent = '(' + countWhere(TAB_FILTERS.submitted) + ')';
  document.getElementById('countClosed').textContent = '(' + countWhere(TAB_FILTERS.closed) + ')';
  document.getElementById('countAll').textContent = '(' + tasks.length + ')';
}

function stageBadge(t) {
  if (t.stage === 'CLOSED') return '<span class="badge badge-REJECTED">Closed - reopened by community</span>';
  return UI.statusBadge(t.stage);
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const visible = tasks.filter(TAB_FILTERS[activeTab]);

  if (visible.length === 0) {
    list.innerHTML = '<div class="card">' + UI.emptyState('No tasks in this list.') + '</div>';
    return;
  }

  list.innerHTML = visible.map(function (t) {
    const p = t.problem;

    let notice = '';
    if (t.active && t.review && t.review.decision === 'RETURN' && t.stage === 'IN_PROGRESS') {
      notice = '<div class="alert alert-warning small">Returned by Panchayat: ' + UI.escape(t.review.comment) + '</div>';
    }
    if (t.overdue) {
      notice += '<div class="alert alert-error small">This task is past its deadline' +
        (t.escalationLevel ? ' and has been escalated to ' + UI.escape(ESCALATION_LEVELS[t.escalationLevel]) : '') + '.</div>';
    }

    let actions = '';
    if (t.stage === 'ASSIGNED') {
      actions = '<button type="button" class="btn btn-small" data-action="start" data-id="' + t.id + '">Start inspection</button>' +
        '<button type="button" class="btn btn-small btn-outline" data-action="note" data-id="' + t.id + '">Add note</button>';
    } else if (t.stage === 'IN_PROGRESS') {
      actions = '<button type="button" class="btn btn-small" data-action="complete" data-id="' + t.id + '">Submit completed work</button>' +
        '<button type="button" class="btn btn-small btn-outline" data-action="note" data-id="' + t.id + '">Add note</button>';
    } else if (t.stage === 'COMPLETION_CLAIMED') {
      actions = '<span class="muted small">Submitted ' + UI.formatDate(t.evidence.submittedAt) + '. Waiting for Panchayat review.</span>';
    } else if (t.stage === 'COMMUNITY_VERIFICATION') {
      actions = '<span class="muted small">Approved by Panchayat. Waiting for community verification.</span>';
    } else if (t.stage === 'VERIFIED') {
      actions = '<span class="muted small">Verified by the community. No further action needed.</span>';
    } else {
      actions = '<span class="muted small">The community disputed this work. The Panchayat may assign a new task.</span>';
    }

    const notes = t.notes.length
      ? '<p class="small mb-0 mt-1"><strong>My notes</strong></p><ul class="note-list">' + t.notes.map(function (n) {
          return '<li>' + UI.escape(n.text) + ' <span class="muted">(' + UI.formatDateTime(n.at) + ')</span>' +
            (n.imageUrl ? '<br><img class="note-photo" src="' + UI.escape(UI.imageSrc(n.imageUrl)) + '" alt="Note photo" data-zoom data-caption="' + UI.escape(n.text) + '">' : '') +
            '</li>';
        }).join('') + '</ul>'
      : '';

    // Citizen photos: show the first one large, the count if there are more
    const images = p.images || [];
    const photoBlock = images.length
      ? UI.photo(images[0].url, images.length > 1 ? 'Photo 1 of ' + images.length + ' from citizen' : 'Photo from citizen') +
        (images.length > 1 ? '<div class="gallery mt-1">' + images.slice(1).map(function (img) {
          return '<figure><img src="' + UI.escape(UI.imageSrc(img.url)) + '" alt="' + UI.escape(img.caption) + '" data-zoom data-caption="' + UI.escape(img.caption) + '"></figure>';
        }).join('') + '</div>' : '')
      : UI.photo(null, null, 'No photo from citizen');

    return '<article class="task-card' + (t.overdue ? ' is-overdue' : '') + (newIds.indexOf(t.id) !== -1 ? ' is-new' : '') + '">' +
      '<div class="task-card-head">' +
        '<div><h3>' + UI.escape(t.pondName) + ' &middot; ' + UI.escape(UI.categoryLabel(p.category)) + '</h3>' +
        '<div class="muted small">' + UI.escape(p.code) + '</div></div>' +
        '<div class="flex">' + UI.priorityBadge(t.priority) + stageBadge(t) + (t.overdue ? UI.overdueBadge() : '') + '</div>' +
      '</div>' +
      '<div class="task-meta">' +
        '<span>Deadline: <strong>' + UI.formatDateTime(t.deadline) + '</strong></span>' +
        '<span>Assigned: ' + UI.formatDate(t.createdAt) + '</span>' +
        (p.landmark ? '<span>Spot: ' + UI.escape(p.landmark) + '</span>' : '') +
        '<span><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + p.latitude + '&mlon=' + p.longitude +
          '#map=18/' + p.latitude + '/' + p.longitude + '">Open location in map</a></span>' +
      '</div>' +
      notice +
      '<div class="task-body">' +
        '<div>' +
          '<p class="small mb-0"><strong>Reported problem:</strong> ' + UI.escape(p.description) + '</p>' +
          '<p class="small mt-1 mb-0"><strong>Instructions:</strong> ' + UI.escape(t.instructions || 'No special instructions.') + '</p>' +
          notes +
        '</div>' +
        '<div>' + photoBlock + '</div>' +
      '</div>' +
      '<div class="task-actions">' + actions + '</div>' +
      '</article>';
  }).join('');

  list.querySelectorAll('[data-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      const task = tasks.find(function (t) { return t.id === Number(button.dataset.id); });
      if (button.dataset.action === 'start') startTask(task, button);
      if (button.dataset.action === 'note') openNoteDialog(task);
      if (button.dataset.action === 'complete') openCompletionDialog(task);
    });
  });
}

/* ---------- Actions ---------- */
async function startTask(task, button) {
  UI.setLoading(button, true, 'Starting...');
  try {
    await API.startTask(task.id);
    UI.toast('Inspection started for ' + task.problem.code + '.');
    loadTasks();
  } catch (error) {
    UI.showError(error);
    UI.setLoading(button, false);
  }
}

function openNoteDialog(task) {
  selectedTask = task;
  document.getElementById('noteText').value = '';
  pickers.note.clear();
  UI.clearFieldErrors(document.getElementById('noteForm'));
  document.getElementById('noteDialogTitle').textContent = 'Add note - ' + task.problem.code;
  UI.openDialog('noteDialog');
}

function openCompletionDialog(task) {
  selectedTask = task;
  const form = document.getElementById('completionForm');
  form.reset();
  UI.clearFieldErrors(form);
  pickers.before.clear();
  pickers.after.clear();
  document.getElementById('completionTaskInfo').textContent =
    task.problem.code + ' - ' + task.pondName + ' - ' + UI.categoryLabel(task.problem.category);
  UI.openDialog('completionDialog');
}

function setupDialogs() {
  pickers.note = UI.photoPicker(document.getElementById('notePhoto'), { max: 1 });
  pickers.before = UI.photoPicker(document.getElementById('beforePhoto'), { max: 1, label: 'Add before photo' });
  pickers.after = UI.photoPicker(document.getElementById('afterPhoto'), { max: 1, label: 'Add after photo' });

  // Save note
  document.getElementById('noteForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    const input = document.getElementById('noteText');
    UI.clearFieldErrors(event.target);
    if (input.value.trim().length < 3) {
      UI.showFieldError(input, 'Please write a short note.');
      return;
    }
    const button = document.getElementById('noteSaveBtn');
    UI.setLoading(button, true, 'Saving...');
    try {
      const formData = new FormData();
      formData.append('text', input.value.trim());
      const notePhotos = pickers.note.getPhotos();
      if (notePhotos.length) formData.append('image', notePhotos[0].blob, 'note-photo.jpg');
      await API.addTaskNote(selectedTask.id, formData);
      UI.closeDialog('noteDialog');
      UI.toast('Note saved.');
      loadTasks();
    } catch (error) {
      UI.showError(error);
    } finally {
      UI.setLoading(button, false);
    }
  });

  // Demo helper: fill before/after with the two sample photos
  document.getElementById('useSampleEvidence').addEventListener('click', async function () {
    pickers.before.clear();
    pickers.after.clear();
    // a polluted photo as "before" and a clean pond photo as "after"
    const n = selectedTask.id % 3;
    await pickers.before.addFromUrl(CONFIG.SAMPLE_IMAGES.polluted[n].url, 'sample-before.jpg');
    await pickers.after.addFromUrl(CONFIG.SAMPLE_IMAGES.clean[n].url, 'sample-after.jpg');
  });

  // Submit completion
  document.getElementById('completionForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.target;
    UI.clearFieldErrors(form);
    const remarks = document.getElementById('completionRemarks');

    let valid = true;
    const before = pickers.before.getPhotos()[0];
    const after = pickers.after.getPhotos()[0];
    if (!before) { UI.showFieldError(document.getElementById('beforePhoto'), 'Before photo is required.'); valid = false; }
    if (!after) { UI.showFieldError(document.getElementById('afterPhoto'), 'After photo is required.'); valid = false; }
    if (remarks.value.trim().length < 10) { UI.showFieldError(remarks, 'Describe the work done (at least 10 characters).'); valid = false; }
    if (!valid) return;

    const formData = new FormData();
    formData.append('beforeImage', before.blob, 'before.jpg');
    formData.append('afterImage', after.blob, 'after.jpg');
    formData.append('remarks', remarks.value.trim());

    const button = document.getElementById('completionSubmitBtn');
    UI.setLoading(button, true, 'Uploading evidence...');
    try {
      await API.submitCompletion(selectedTask.id, formData);
      UI.closeDialog('completionDialog');
      UI.toast(selectedTask.problem.code + ' submitted for review.');
      loadTasks();
    } catch (error) {
      UI.showError(error);
    } finally {
      UI.setLoading(button, false);
    }
  });
}
