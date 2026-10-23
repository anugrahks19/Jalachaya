/* JALACHAYA - Panchayat overview: summary numbers, work queues and simple charts.
   All numbers come from the API (backend), not calculated here. */

const session = Auth.requireRole(ROLES.OFFICER);
let newIds = [];   // ids that arrived through a live update (highlighted once)

if (session) {
  UI.initDashboard(session);
  document.getElementById('todayText').textContent =
    'Complaints and field work across all registered ponds - ' + UI.formatDate(new Date().toISOString()) + '.';
  loadDashboard();
  Live.start(loadDashboard, { statusId: 'liveStatus' });
}

async function loadDashboard() {
  try {
    const results = await Promise.all([API.getDashboardSummary(), API.getProblems({}), API.getAnalytics()]);
    newIds = Live.diff('problems', results[1].map(function (p) { return p.id; }));
    newIds.forEach(function (id) {
      const p = results[1].find(function (x) { return x.id === id; });
      UI.toast('New complaint ' + p.code + ' at ' + p.pondName);
    });
    renderSummary(results[0]);
    renderQueues(results[1]);
    renderCharts(results[2]);
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
