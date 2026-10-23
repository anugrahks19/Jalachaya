/* JALACHAYA - Panchayat: complaint management
   Filter complaints, open details, and act on them:
   assign / reject (new), escalate (overdue), forward / return (submitted work). */

const session = Auth.requireRole(ROLES.OFFICER);
let workers = [];
let newIds = [];   // ids that arrived through a live update (highlighted once)
let searchTimer = null;

const filterEls = {
  pondId: document.getElementById('filterPond'),
  category: document.getElementById('filterCategory'),
  priority: document.getElementById('filterPriority'),
  status: document.getElementById('filterStatus'),
  search: document.getElementById('filterSearch'),
  overdue: document.getElementById('filterOverdue')
};

if (session) {
  UI.initDashboard(session);
  init();
}

async function init() {
  fillOptions(filterEls.category, CATEGORIES);
  fillOptions(filterEls.priority, PRIORITIES);
  fillOptions(filterEls.status, STATUS_LABELS);

  // Filters passed from the overview page, e.g. complaints.html?status=SUBMITTED
  if (UI.queryParam('status')) filterEls.status.value = UI.queryParam('status');
  if (UI.queryParam('overdue')) filterEls.overdue.checked = true;

  ['pondId', 'category', 'priority', 'status', 'overdue'].forEach(function (key) {
    filterEls[key].addEventListener('change', loadComplaints);
  });
  filterEls.search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadComplaints, 300); // wait until typing pauses
  });
  document.getElementById('clearFiltersBtn').addEventListener('click', function () {
    document.getElementById('filterForm').reset();
    loadComplaints();
  });

  try {
    const results = await Promise.all([API.getPonds(), API.getWorkers()]);
    results[0].forEach(function (p) {
      filterEls.pondId.insertAdjacentHTML('beforeend', '<option value="' + p.id + '">' + UI.escape(p.name) + '</option>');
    });
    workers = results[1];
  } catch (error) {
    UI.showError(error);
  }

  await loadComplaints();
  const openId = UI.queryParam('open');
  if (openId) openDetail(openId);
  Live.start(liveRefresh, { statusId: 'liveStatus' });
}

/* ---------- Live updates ---------- */

async function liveRefresh() {
  const all = await API.getProblems({});
  newIds = Live.diff('problems', all.map(function (c) { return c.id; }));
  newIds.forEach(function (id) {
    const c = all.find(function (x) { return x.id === id; });
    UI.toast('New complaint ' + c.code + ' at ' + c.pondName);
  });
  await loadComplaints();
}

function fillOptions(select, map) {
  Object.keys(map).forEach(function (key) {
    select.insertAdjacentHTML('beforeend', '<option value="' + key + '">' + UI.escape(map[key]) + '</option>');
  });
}

/* ---------- Table ---------- */
async function loadComplaints() {
  const tbody = document.getElementById('complaintTableBody');
  const filters = {
    pondId: filterEls.pondId.value,
    category: filterEls.category.value,
    priority: filterEls.priority.value,
    status: filterEls.status.value,
    search: filterEls.search.value.trim(),
    overdue: filterEls.overdue.checked
  };

  try {
    const complaints = await API.getProblems(filters);
    if (!Live._seen || !Live._seen.problems) {
      // remember the ids shown at first load (only needed when no filter is set)
      Live.diff('problems', (await API.getProblems({})).map(function (c) { return c.id; }));
    }
    document.getElementById('resultCount').textContent =
      complaints.length + ' complaint' + (complaints.length === 1 ? '' : 's') + ' found';

    if (complaints.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No complaints match these filters.</td></tr>';
      return;
    }

    tbody.innerHTML = complaints.map(function (c) {
      const status = UI.statusBadge(c.status) +
        (c.overdue ? ' ' + UI.overdueBadge() : '') +
        (c.task && c.task.escalationLevel ? ' <span class="badge badge-HIGH">L' + c.task.escalationLevel + '</span>' : '');
      return '<tr class="' + (newIds.indexOf(c.id) !== -1 ? 'is-new' : '') + '">' +
        '<td><strong>' + UI.escape(c.code) + '</strong></td>' +
        '<td>' + UI.escape(c.pondName) + '</td>' +
        '<td>' + UI.escape(UI.categoryLabel(c.category)) + '</td>' +
        '<td>' + UI.priorityBadge(c.priority) + '</td>' +
        '<td>' + status + '</td>' +
        '<td>' + (c.task ? UI.escape(c.task.workerName) : '<span class="muted">-</span>') + '</td>' +
        '<td>' + (c.task ? UI.formatDate(c.task.deadline) : '<span class="muted">-</span>') + '</td>' +
        '<td class="opt">' + UI.formatDate(c.createdAt) + '</td>' +
        '<td class="text-right"><button type="button" class="btn btn-small btn-outline" data-open="' + c.id + '">Open</button></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-open]').forEach(function (button) {
      button.addEventListener('click', function () { openDetail(button.dataset.open); });
    });
    newIds = []; // highlight only once
  } catch (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Could not load complaints.</td></tr>';
    UI.showError(error);
  }
}

/* ---------- Detail dialog ---------- */
async function openDetail(id) {
  const body = document.getElementById('detailBody');
  body.innerHTML = '<p class="muted">Loading...</p>';
  UI.openDialog('detailDialog');

  try {
    const c = await API.getProblem(id);
    document.getElementById('detailTitle').textContent = 'Complaint ' + c.code;
    body.innerHTML = renderDetail(c);
    attachActionHandlers(c);
  } catch (error) {
    body.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
  }
}

function renderDetail(c) {
  let html = UI.stepper(c.status);

  if (c.overdue) {
    html += '<div class="alert alert-error"><strong>Overdue:</strong> deadline was ' + UI.formatDateTime(c.task.deadline) +
      (c.task.escalationLevel ? '. Currently escalated to level ' + c.task.escalationLevel +
        ' (' + UI.escape(ESCALATION_LEVELS[c.task.escalationLevel]) + ').' : '.') + '</div>';
  }
  if (c.status === 'REJECTED') {
    html += '<div class="alert alert-error"><strong>Rejected:</strong> ' + UI.escape(c.rejectionReason) + '</div>';
  }
  if (c.status === 'REOPENED') {
    html += '<div class="alert alert-warning">The community disputed the previous work. Assign the complaint again below.' +
      ' Earlier tasks kept on record: ' + c.previousTaskCount + '.</div>';
  }

  // Basic details
  html += '<div class="section-label">Complaint</div>' +
    '<dl class="detail-grid">' +
      '<dt>Pond</dt><dd>' + UI.escape(c.pondName) + '</dd>' +
      '<dt>Category</dt><dd>' + UI.escape(UI.categoryLabel(c.category)) + '</dd>' +
      '<dt>Priority</dt><dd>' + UI.priorityBadge(c.priority) + '</dd>' +
      '<dt>Reported by</dt><dd>' + UI.escape(c.reporterName) + (c.reporterPhone ? ' &middot; ' + UI.escape(c.reporterPhone) : '') + '</dd>' +
      '<dt>Reported on</dt><dd>' + UI.formatDateTime(c.createdAt) + '</dd>' +
      '<dt>Description</dt><dd>' + UI.escape(c.description) + '</dd>' +
      '<dt>Landmark</dt><dd>' + UI.escape(c.landmark || '-') + '</dd>' +
      '<dt>Location</dt><dd>' + Number(c.latitude).toFixed(5) + ', ' + Number(c.longitude).toFixed(5) +
        ' &middot; <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + c.latitude + '&mlon=' + c.longitude + '#map=18/' + c.latitude + '/' + c.longitude + '">map</a></dd>' +
    '</dl>' +
    '<div class="section-label">Photos (' + c.images.length + ')</div>' +
    UI.gallery(c.images, 'No photos attached by the citizen');

  html += renderAiResult('Image assessment', c.aiClassification, false);

  // Task details
  if (c.task) {
    const t = c.task;
    html += '<div class="section-label">Field task</div>' +
      '<dl class="detail-grid">' +
        '<dt>Assigned to</dt><dd>' + UI.escape(t.workerName) + ' (' + UI.escape(t.workerTeam) + ')</dd>' +
        '<dt>Deadline</dt><dd>' + UI.formatDateTime(t.deadline) + (c.overdue ? ' ' + UI.overdueBadge() : '') + '</dd>' +
        '<dt>Instructions</dt><dd>' + UI.escape(t.instructions || '-') + '</dd>' +
        '<dt>Started</dt><dd>' + (t.startedAt ? UI.formatDateTime(t.startedAt) : 'Not started') + '</dd>' +
      '</dl>';
    if (t.notes.length) {
      html += '<p class="small mb-0"><strong>Inspection notes</strong></p><ul class="note-list">' + t.notes.map(function (n) {
        return '<li>' + UI.escape(n.text) + ' <span class="muted">(' + UI.formatDateTime(n.at) + ')</span>' +
          (n.imageUrl ? '<br><img class="note-photo" src="' + UI.escape(UI.imageSrc(n.imageUrl)) + '" alt="Note photo" data-zoom data-caption="' + UI.escape(n.text) + '">' : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    if (t.escalations.length) {
      html += '<p class="small mb-0 mt-1"><strong>Escalations</strong></p><ul class="note-list">' + t.escalations.map(function (e) {
        return '<li>Level ' + e.level + ' (' + UI.escape(e.escalatedTo) + '): ' + UI.escape(e.reason) +
          ' <span class="muted">(' + UI.formatDateTime(e.at) + ')</span></li>';
      }).join('') + '</ul>';
    }

    if (t.evidence) {
      html += '<div class="section-label">Evidence submitted by field worker</div>' +
        '<div class="evidence-grid">' +
          UI.photo(t.evidence.beforeImageUrl, 'Before', 'No before photo') +
          UI.photo(t.evidence.afterImageUrl, 'After', 'No after photo') +
        '</div>' +
        '<p class="small mt-1"><strong>Remarks:</strong> ' + UI.escape(t.evidence.remarks) +
          ' <span class="muted">&middot; ' + UI.formatDateTime(t.evidence.submittedAt) + '</span></p>';
      if (t.review && t.review.decision === 'RETURN') {
        html += '<p class="small"><strong>Returned earlier:</strong> ' + UI.escape(t.review.comment) + '</p>';
      }
      html += renderAiResult('Evidence comparison', t.aiVerification, true);
    }
  }

  if (c.communityVerifications && c.communityVerifications.length) {
    html += '<div class="section-label">Community responses</div><ul class="note-list">' +
      c.communityVerifications.map(function (v) {
        return '<li><strong>' + (v.decision === 'CONFIRM' ? 'Confirmed' : 'Disputed') + '</strong> by ' + UI.escape(v.userName) +
          (v.comment ? ': ' + UI.escape(v.comment) : '') + ' <span class="muted">(' + UI.formatDateTime(v.createdAt) + ')</span>' +
          (v.imageUrl ? '<br><img class="note-photo" src="' + UI.escape(UI.imageSrc(v.imageUrl)) + '" alt="Photo from citizen" data-zoom data-caption="Photo from community response">' : '') +
          '</li>';
      }).join('') + '</ul>';
  }

  html += renderActions(c);

  html += '<div class="section-label">History</div>' + UI.timeline(c.history);
  return html;
}

function renderAiResult(title, job, verification) {
  if (!job) return '';
  let detail = '';
  if (job.status === 'SUCCEEDED') {
    const result = job.result || {};
    if (verification) {
      detail = typeof result.visibleChangePercent === 'number'
        ? 'Estimated visible pixel change: ' + UI.escape(result.visibleChangePercent) + '%. This does not prove waste removal.'
        : 'Image comparison is available for officer review.';
      if (result.aligned === false) detail += ' The photos could not be aligned reliably.';
      if (typeof result.litterCountBefore === 'number' && typeof result.litterCountAfter === 'number') {
        detail += ' Possible litter detections: ' + result.litterCountBefore + ' before, ' + result.litterCountAfter + ' after.';
      }
    } else if (result.classificationSource === 'citizen_report') {
      detail = 'Photo quality checked. The category remains the citizen’s report; no trained classifier is installed.';
    } else if (result.classificationSource === 'pretrained_litter_detector') {
      const items = Array.isArray(result.detectedItems) ? result.detectedItems : [];
      detail = items.length
        ? 'Pretrained model flagged ' + items.length + ' possible litter item' + (items.length === 1 ? '' : 's') + ': ' +
          items.slice(0, 8).map(function (item) { return UI.escape(item.label); }).join(', ') +
          '. Review the photos; detections are uncalibrated.'
        : 'Pretrained model found no litter items. This does not prove the pond is clean.';
    } else if (result.category) {
      detail = 'Suggested category: ' + UI.escape(UI.categoryLabel(result.category)) + '.';
    }
  } else {
    detail = job.status === 'PROCESSING' ? 'Processing photos.' : 'Queued for image assessment.';
  }
  const warnings = Array.isArray(job.warnings) ? job.warnings : [];
  return '<div class="alert alert-warning mt-1"><strong>' + UI.escape(title) + ':</strong> ' + detail +
    (warnings.length ? '<ul class="note-list">' + warnings.map(function (warning) {
      return '<li>' + UI.escape(warning) + '</li>';
    }).join('') + '</ul>' : '') + '</div>';
}

// Action forms shown depending on the current status
function renderActions(c) {
  if (c.status === 'SUBMITTED' || c.status === 'REOPENED') {
    const defaultDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    defaultDeadline.setHours(17, 0, 0, 0);
    const workerOptions = workers.map(function (w) {
      return '<option value="' + w.id + '">' + UI.escape(w.name) + ' - ' + UI.escape(w.team) + ' (' + w.openTasks + ' open)</option>';
    }).join('');
    const priorityOptions = Object.keys(PRIORITIES).map(function (k) {
      return '<option value="' + k + '"' + (k === c.priority ? ' selected' : '') + '>' + PRIORITIES[k] + '</option>';
    }).join('');

    return '<div class="section-label">Assign field worker</div>' +
      '<form id="assignForm" novalidate>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="assignWorker">Field worker</label>' +
            '<select id="assignWorker"><option value="">Select worker</option>' + workerOptions + '</select></div>' +
          '<div class="form-group"><label for="assignPriority">Priority</label>' +
            '<select id="assignPriority">' + priorityOptions + '</select></div>' +
        '</div>' +
        '<div class="form-group"><label for="assignDeadline">Deadline</label>' +
          '<input type="datetime-local" id="assignDeadline" value="' + UI.toDateTimeInput(defaultDeadline) + '" min="' + UI.toDateTimeInput(new Date()) + '"></div>' +
        '<div class="form-group"><label for="assignInstructions">Instructions <span class="optional">(optional)</span></label>' +
          '<textarea id="assignInstructions" maxlength="400" placeholder="What should the worker do on site?"></textarea></div>' +
        '<button type="submit" class="btn" id="assignBtn">Assign task</button>' +
      '</form>' +
      '<details class="mt-2"><summary class="small">Reject this complaint</summary>' +
        '<form id="rejectForm" class="mt-1" novalidate>' +
          '<div class="form-group"><label for="rejectReason">Reason for rejection</label>' +
            '<textarea id="rejectReason" maxlength="300" placeholder="e.g. Duplicate of another complaint, outside panchayat limits"></textarea></div>' +
          '<button type="submit" class="btn btn-danger" id="rejectBtn">Reject complaint</button>' +
        '</form>' +
      '</details>';
  }

  if (c.overdue) {
    const nextLevel = c.task.escalationLevel + 1;
    if (nextLevel > MAX_ESCALATION_LEVEL) {
      return '<div class="section-label">Escalation</div><p class="muted">This task is already at the highest escalation level.</p>';
    }
    return '<div class="section-label">Escalate overdue task</div>' +
      '<form id="escalateForm" novalidate>' +
        '<div class="form-group"><label for="escalateReason">Reason</label>' +
          '<textarea id="escalateReason" maxlength="300" placeholder="Why is this being escalated?"></textarea></div>' +
        '<button type="submit" class="btn btn-danger" id="escalateBtn">Escalate to level ' + nextLevel +
          ' (' + ESCALATION_LEVELS[nextLevel] + ')</button>' +
      '</form>';
  }

  if (c.status === 'COMPLETION_CLAIMED') {
    return '<div class="section-label">Review submitted work</div>' +
      '<p class="hint">Review the photos and the image comparison above. The visual change estimate is advisory; decide whether to forward or return the work.</p>' +
      '<form id="reviewForm" novalidate>' +
        '<div class="form-group"><label for="reviewComment">Comment <span class="optional">(required when returning)</span></label>' +
          '<textarea id="reviewComment" maxlength="300"></textarea></div>' +
        '<div class="flex">' +
          '<button type="submit" class="btn" data-decision="FORWARD">Forward to community verification</button>' +
          '<button type="submit" class="btn btn-outline" data-decision="RETURN">Return to worker</button>' +
        '</div>' +
      '</form>';
  }

  if (c.status === 'COMMUNITY_VERIFICATION') {
    return '<div class="section-label">Next step</div><p class="muted">Waiting for a citizen to confirm or dispute the work.</p>';
  }
  return '';
}

/* ---------- Action handlers ---------- */
function attachActionHandlers(c) {
  const assignForm = document.getElementById('assignForm');
  if (assignForm) {
    assignForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFieldErrors(assignForm);
      const workerSelect = document.getElementById('assignWorker');
      const deadlineInput = document.getElementById('assignDeadline');
      let valid = true;
      if (!workerSelect.value) { UI.showFieldError(workerSelect, 'Please select a field worker.'); valid = false; }
      if (!deadlineInput.value || new Date(deadlineInput.value) <= new Date()) {
        UI.showFieldError(deadlineInput, 'Deadline must be in the future.'); valid = false;
      }
      if (!valid) return;

      await runAction(document.getElementById('assignBtn'), 'Assigning...', function () {
        return API.assignTask({
          problemId: c.id,
          assignedWorkerId: Number(workerSelect.value),
          deadline: new Date(deadlineInput.value).toISOString(),
          priority: document.getElementById('assignPriority').value,
          instructions: document.getElementById('assignInstructions').value.trim()
        });
      }, c.code + ' assigned.', c.id, true);
    });
  }

  const rejectForm = document.getElementById('rejectForm');
  if (rejectForm) {
    rejectForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFieldErrors(rejectForm);
      const reasonInput = document.getElementById('rejectReason');
      if (reasonInput.value.trim().length < 5) {
        UI.showFieldError(reasonInput, 'Please give a reason (at least 5 characters).');
        return;
      }
      if (!confirm('Reject complaint ' + c.code + '? The citizen will see your reason.')) return;
      await runAction(document.getElementById('rejectBtn'), 'Rejecting...', function () {
        return API.rejectProblem(c.id, reasonInput.value.trim());
      }, c.code + ' rejected.', c.id, false);
    });
  }

  const escalateForm = document.getElementById('escalateForm');
  if (escalateForm) {
    escalateForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFieldErrors(escalateForm);
      const reasonInput = document.getElementById('escalateReason');
      if (reasonInput.value.trim().length < 5) {
        UI.showFieldError(reasonInput, 'Please give a reason (at least 5 characters).');
        return;
      }
      await runAction(document.getElementById('escalateBtn'), 'Escalating...', function () {
        return API.escalateTask(c.task.id, reasonInput.value.trim());
      }, c.code + ' escalated.', c.id, false);
    });
  }

  const reviewForm = document.getElementById('reviewForm');
  if (reviewForm) {
    reviewForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFieldErrors(reviewForm);
      const decision = event.submitter ? event.submitter.dataset.decision : 'FORWARD';
      const commentInput = document.getElementById('reviewComment');
      if (decision === 'RETURN' && commentInput.value.trim().length < 5) {
        UI.showFieldError(commentInput, 'Explain what needs to be redone (at least 5 characters).');
        return;
      }
      await runAction(event.submitter, 'Saving...', function () {
        return API.reviewCompletion(c.task.id, decision, commentInput.value.trim());
      }, decision === 'FORWARD' ? c.code + ' sent for community verification.' : c.code + ' returned to the worker.', c.id, false);
    });
  }
}

// Runs an API action with loading state, then refreshes the table and dialog
async function runAction(button, loadingText, action, successMessage, problemId, refreshWorkers) {
  UI.setLoading(button, true, loadingText);
  try {
    await action();
    UI.toast(successMessage);
    if (refreshWorkers) workers = await API.getWorkers();
    await loadComplaints();
    openDetail(problemId);
  } catch (error) {
    UI.showError(error);
    UI.setLoading(button, false);
  }
}
