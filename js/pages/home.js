/* JALACHAYA - Home page
   Public pond list, headline numbers, before/after highlights and a
   live activity feed. The page refreshes itself (see Live in motion.js). */

UI.initPublicPage();
Motion.sectionDots();
loadPonds();
loadHighlights();
loadActivity();

Live.start(function () {
  return Promise.all([loadPonds(), loadActivity()]);
}, { statusId: 'liveStatus' });

async function loadPonds() {
  const tbody = document.getElementById('pondTableBody');
  try {
    const ponds = await API.getPublicPonds();

    // Headline numbers (animated count-up)
    let complaints = 0;
    let resolved = 0;
    ponds.forEach(function (p) {
      complaints += p.totalComplaints;
      resolved += p.resolvedComplaints;
    });
    Motion.countTo(document.getElementById('statPonds'), ponds.length);
    Motion.countTo(document.getElementById('statComplaints'), complaints);
    Motion.countTo(document.getElementById('statResolved'), resolved);

    if (ponds.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No ponds registered yet.</td></tr>';
      return;
    }

    tbody.innerHTML = ponds.map(function (p) {
      const thumb = p.imageUrl
        ? '<img src="' + UI.escape(UI.imageSrc(p.imageUrl)) + '" alt="" data-zoom data-caption="' + UI.escape(p.name) + '" loading="lazy">'
        : '';
      return '<tr>' +
        '<td><span class="pond-cell">' + thumb + '<strong>' + UI.escape(p.name) + '</strong></span></td>' +
        '<td>' + UI.escape(p.ward) + (p.village ? ', ' + UI.escape(p.village) : '') + '</td>' +
        '<td>' + p.activeComplaints + '</td>' +
        '<td>' + p.resolvedComplaints + '</td>' +
        '<td style="min-width:110px">' + UI.meter(p.recoveryPercent) + '</td>' +
        '<td class="text-right"><a class="btn btn-small btn-outline" href="pond.html?id=' + p.id + '">View</a></td>' +
        '</tr>';
    }).join('');
  } catch (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load ponds.</td></tr>';
    UI.showError(error);
  }
}

// "Recent activity": newest public events. New ones are highlighted.
async function loadActivity() {
  const list = document.getElementById('activityList');
  try {
    const events = await API.getPublicActivity();
    const fresh = Live.diff('activity', events.map(function (e) { return e.id; }));
    if (events.length === 0) {
      list.innerHTML = '<li class="muted">No activity yet.</li>';
      return;
    }
    list.innerHTML = events.map(function (e) {
      return '<li class="' + (fresh.indexOf(e.id) !== -1 ? 'is-new' : '') + '">' +
        '<strong>' + UI.escape(e.text) + '</strong>' +
        '<span class="activity-meta">' + UI.escape(e.code) + ' &middot; ' + UI.escape(e.pondName) +
        ' &middot; ' + UI.timeAgo(e.at) + '</span></li>';
    }).join('');
  } catch (error) {
    list.innerHTML = '<li class="muted">Activity is not available.</li>';
  }
}

// "From the field": before/after photos of recently verified work
async function loadHighlights() {
  try {
    const items = await API.getPublicHighlights();
    if (items.length === 0) return; // section stays hidden
    document.getElementById('fieldHighlights').innerHTML = items.map(function (h) {
      return '<div class="card">' +
        '<div class="flex-between mb-2"><h3 class="mb-0">' + UI.escape(h.pondName) + ' &middot; ' + UI.escape(UI.categoryLabel(h.category)) + '</h3>' +
        '<span class="muted small">' + UI.escape(h.code) + ' &middot; verified ' + UI.formatDate(h.verifiedAt) + '</span></div>' +
        '<div class="before-after">' +
          '<div><span class="photo-tag">Before</span>' + UI.photo(h.beforeImageUrl, null) + '</div>' +
          '<div><span class="photo-tag">After</span>' + UI.photo(h.afterImageUrl, null) + '</div>' +
        '</div>' +
        '<p class="small muted mt-1 mb-0">' + UI.escape(h.remarks) + '</p>' +
        '</div>';
    }).join('');
    const section = document.getElementById('fieldSection');
    section.classList.remove('hidden');
    // fade the cards in as they scroll into view
    document.getElementById('fieldHighlights').setAttribute('data-reveal-group', '');
    Motion.setupReveal();
    Motion.sectionDots();   // the section is visible now, so it gets a dot too
  } catch (error) {
    console.warn('Highlights not available:', error.message);
  }
}
