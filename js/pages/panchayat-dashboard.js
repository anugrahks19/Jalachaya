/* JALACHAYA - Panchayat overview: summary numbers, work queues and simple charts.
   All numbers come from the API (backend), not calculated here. */

const session = Auth.requireRole(ROLES.OFFICER);
let newIds = [];   // ids that arrived through a live update (highlighted once)

if (session) {
  UI.initDashboard(session);
  document.getElementById('todayText').textContent =
    'Complaints and field work across reported and registered ponds - ' + UI.formatDate(new Date().toISOString()) + '.';
  setupAuthorityContacts();
  loadDashboard();
  Live.start(loadDashboard, { statusId: 'liveStatus' });
}

async function loadDashboard() {
  try {
    const results = await Promise.all([API.getDashboardSummary(), API.getProblems({}), API.getAnalytics(), API.getAutomaticAlerts()]);
    newIds = Live.diff('problems', results[1].map(function (p) { return p.id; }));
    newIds.forEach(function (id) {
      const p = results[1].find(function (x) { return x.id === id; });
      UI.toast('New complaint ' + p.code + ' at ' + p.pondName);
    });
    renderSummary(results[0]);
    renderQueues(results[1]);
    renderCharts(results[2]);
    renderAutomaticAlerts(results[3]);
  } catch (error) {
    UI.showError(error);
  }
}

function renderSummary(s) {
  Motion.countTo(document.getElementById('sumPonds'), s.totalPonds);
  Motion.countTo(document.getElementById('sumActive'), s.activeProblems);
  Motion.countTo(document.getElementById('sumNew'), s.newComplaints);
  Motion.countTo(document.getElementById('sumProgress'), s.inProgress);
  Motion.countTo(document.getElementById('sumOverdue'), s.overdue);
  Motion.countTo(document.getElementById('sumReview'), s.awaitingReview);
  Motion.countTo(document.getElementById('sumCommunity'), s.awaitingVerification);
}

// One row in a work queue list
function queueItem(p, subText, buttonText) {
  return '<li class="' + (newIds.indexOf(p.id) !== -1 ? 'is-new' : '') + '"><div>' +
    '<div class="list-title">' + UI.escape(p.code) + ' &middot; ' + UI.escape(p.pondName) + '</div>' +
    '<div class="list-sub">' + subText + '</div>' +
    '</div><a class="btn btn-small btn-outline" href="complaints.html?open=' + p.id + '">' + buttonText + '</a></li>';
}

function renderQueues(problems) {
  const newOnes = problems.filter(function (p) { return p.status === 'SUBMITTED' || p.status === 'REOPENED'; });
  const overdue = problems.filter(function (p) { return p.overdue; });
  const review = problems.filter(function (p) { return p.status === 'COMPLETION_CLAIMED'; });

  document.getElementById('newList').innerHTML = newOnes.length === 0
    ? '<li class="muted">Nothing waiting for assignment.</li>'
    : newOnes.slice(0, 5).map(function (p) {
        return queueItem(p,
          UI.escape(UI.categoryLabel(p.category)) + ' &middot; ' + UI.statusBadge(p.status) + ' &middot; ' + UI.formatDate(p.createdAt),
          'Assign');
      }).join('');

  document.getElementById('overdueList').innerHTML = overdue.length === 0
    ? '<li class="muted">No overdue tasks.</li>'
    : overdue.slice(0, 5).map(function (p) {
        const days = Math.max(1, UI.daysBetween(p.task.deadline));
        const level = p.task.escalationLevel
          ? ' &middot; escalated to ' + UI.escape(ESCALATION_LEVELS[p.task.escalationLevel])
          : '';
        return queueItem(p,
          UI.escape(p.task.workerName) + ' &middot; <strong style="color:var(--danger)">' + days + ' day' + (days > 1 ? 's' : '') + ' overdue</strong>' + level,
          'Open');
      }).join('');

  document.getElementById('reviewList').innerHTML = review.length === 0
    ? '<li class="muted">No submitted work to review.</li>'
    : review.slice(0, 5).map(function (p) {
        return queueItem(p,
          'Submitted by ' + UI.escape(p.task.workerName) + ' &middot; ' + UI.formatDate(p.task.evidence.submittedAt),
          'Review');
      }).join('');
}

// Draws a horizontal bar chart with plain HTML/CSS
function barChart(elementId, data, labels, darkBars) {
  const keys = Object.keys(data);
  const max = Math.max.apply(null, keys.map(function (k) { return data[k]; }).concat([1]));
  document.getElementById(elementId).innerHTML = keys.map(function (k) {
    const width = Math.round((data[k] / max) * 100);
    return '<div class="bar-row">' +
      '<span>' + UI.escape(labels[k] || k) + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (darkBars ? ' dark' : '') + '" style="width:' + width + '%"></div></div>' +
      '<span class="bar-value">' + data[k] + '</span>' +
      '</div>';
  }).join('');
}

function renderCharts(analytics) {
  barChart('statusChart', analytics.byStatus, STATUS_LABELS, true);
  barChart('categoryChart', analytics.byCategory, CATEGORIES, false);

  document.getElementById('recoveryTable').innerHTML = analytics.ponds.map(function (p) {
    return '<tr><td>' + UI.escape(p.name) + '</td><td>' + p.activeComplaints + '</td>' +
      '<td style="min-width:130px">' + UI.meter(p.recoveryPercent) + '</td></tr>';
  }).join('');
}

function setupAuthorityContacts() {
  const form = document.getElementById('authorityContactsForm');
  form.addEventListener('input', function () { form.dataset.editing = 'true'; });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      const data = await API.saveAuthorityContacts({panchayatEmail:document.getElementById('panchayatAlertEmail').value.trim(),higherEmail:document.getElementById('higherAlertEmail').value.trim(),inspectionEmail:document.getElementById('inspectionAlertEmail').value.trim()});
      form.dataset.editing = ''; renderAutomaticAlerts(data);
      document.getElementById('authorityContactMessage').textContent = 'Recipients saved. Queued alerts retry automatically when SMTP is ready.';
    } catch (error) { document.getElementById('authorityContactMessage').textContent = error.message; }
  });
  document.getElementById('testAuthorityEmail').addEventListener('click', async function () {
    const button = this; UI.setLoading(button, true, 'Sending test...');
    try { const result = await API.testAuthorityEmail(); document.getElementById('authorityContactMessage').textContent = result.message; }
    catch(error) { document.getElementById('authorityContactMessage').textContent = error.message; }
    finally { UI.setLoading(button,false); }
  });
}
function renderAutomaticAlerts(data) {
  const r=data.rules;
  document.getElementById('deadlineRules').textContent = r.enabled ? 'Checked every minute while Java runs: L1 team reminder within '+r.reminderHours+'h before deadline; L2 Panchayat alert when overdue; L3 higher authority after '+r.higherHours+'h overdue; L4 manual inspection after '+r.inspectionHours+'h overdue.' : 'Automatic deadline monitoring is disabled in server configuration.';
  document.getElementById('mailTransportStatus').textContent = session.demo ? 'Demo: in-app alerts only' : r.smtpReady ? 'SMTP configured - see each delivery status' : 'Email setup required - in-app alerts still work';
  document.getElementById('testAuthorityEmail').disabled = session.demo || !r.smtpReady;
  const labels={PENDING:'Email queued',PROCESSING:'Sending email',SENT:'Accepted by email server',RETRY:'Email retry pending',NEEDS_CONFIGURATION:'Email setup required',CANCELLED:'Email cancelled',DEMO_IN_APP:'Demo inbox only'};
  document.getElementById('automaticDeadlineList').innerHTML = data.items.length ? '<ul class="list">'+data.items.slice(0,6).map(function (a) {
    return '<li><div><a href="complaints.html?open='+a.problemId+'">'+UI.escape(a.code)+'</a> <strong>L'+a.level+' - '+UI.escape(a.destination)+'</strong><div class="small muted">'+UI.formatDateTime(a.createdAt)+' · '+UI.escape(labels[a.deliveryStatus] || a.deliveryStatus)+(a.recipient?' · '+UI.escape(a.recipient):'')+'</div></div></li>';
  }).join('')+'</ul>' : '<p class="muted">No automatic deadline alerts in this account scope yet.</p>';
  if(!document.getElementById('authorityContactsForm').dataset.editing) {
    document.getElementById('panchayatAlertEmail').value=data.contacts.PANCHAYAT;
    document.getElementById('higherAlertEmail').value=data.contacts.HIGHER;
    document.getElementById('inspectionAlertEmail').value=data.contacts.INSPECTION;
  }
}
