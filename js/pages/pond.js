/* JALACHAYA - Public pond profile (pond.html?id=1)
   Shows only public information: no reporter or worker details. */

UI.initPublicPage();
loadPond();

async function loadPond() {
  const container = document.getElementById('pondContent');
  const id = UI.queryParam('id');

  if (!id) {
    container.innerHTML = '<div class="alert alert-error">No pond selected.</div>';
    return;
  }

  try {
    const pond = await API.getPublicPond(id);
    document.title = pond.name + ' - JALACHAYA';

    const timelineRows = pond.timeline.length === 0
      ? '<tr class="empty-row"><td colspan="5">No complaints have been reported for this pond.</td></tr>'
      : pond.timeline.map(function (t) {
          return '<tr>' +
            '<td>' + UI.escape(t.code) + '</td>' +
            '<td>' + UI.escape(UI.categoryLabel(t.category)) + '</td>' +
            '<td>' + UI.formatDate(t.createdAt) + '</td>' +
            '<td>' + UI.statusBadge(t.status) + '</td>' +
            '<td>' + UI.formatDate(t.updatedAt) + '</td>' +
            '</tr>';
        }).join('');

    // Pond photo if the Panchayat has added one, otherwise the line drawing
    const banner = pond.imageUrl
      ? '<div class="pond-banner"><img class="pond-photo" src="' + UI.escape(UI.imageSrc(pond.imageUrl)) + '" alt="Photo of ' +
          UI.escape(pond.name) + '" data-zoom data-caption="' + UI.escape(pond.name) + '"></div>'
      : '<div class="pond-banner">' + Sketches.slotHtml('kulam') + '</div>';

    container.innerHTML =
      banner +
      '<div class="flex-between mb-2">' +
        '<div><h1 class="mb-0">' + UI.escape(pond.name) + '</h1>' +
        '<p class="muted mb-0">' + UI.escape(pond.ward) + (pond.village ? ', ' + UI.escape(pond.village) : '') + '</p></div>' +
        '<a class="btn" href="citizen/report.html?pond=' + pond.id + '">Report a problem here</a>' +
      '</div>' +

      '<div class="three-col" data-reveal-group>' +
        '<div class="card"><h3>Workflow progress</h3>' + UI.meter(pond.recoveryPercent) + '</div>' +
        '<div class="card"><h3>Open complaints</h3><p class="mb-0 big-number" id="pondOpen">0</p></div>' +
        '<div class="card"><h3>Verified as resolved</h3><p class="mb-0 big-number" id="pondResolved">0</p></div>' +
      '</div>' +

      '<div class="card mt-3">' +
        '<h3 class="card-title">About this pond</h3>' +
        '<dl class="detail-grid">' +
          '<dt>Description</dt><dd>' + UI.escape(pond.description || '-') + '</dd>' +
          '<dt>Area</dt><dd>' + (pond.areaAcres ? pond.areaAcres + ' acres' : '-') + '</dd>' +
          '<dt>Coordinates</dt><dd>' + pond.latitude.toFixed(4) + ', ' + pond.longitude.toFixed(4) +
            ' &middot; <a href="https://www.openstreetmap.org/?mlat=' + pond.latitude + '&mlon=' + pond.longitude +
            '#map=17/' + pond.latitude + '/' + pond.longitude + '" target="_blank" rel="noopener">Open in map</a></dd>' +
        '</dl>' +
      '</div>' +

      '<div class="card">' +
        '<h3 class="card-title">Complaint timeline</h3>' +
        '<div class="table-wrap"><table class="table">' +
          '<thead><tr><th>Complaint ID</th><th>Category</th><th>Reported</th><th>Status</th><th>Last update</th></tr></thead>' +
          '<tbody>' + timelineRows + '</tbody>' +
        '</table></div>' +
      '</div>';
    Sketches.mount(container); // animate the drawing if this pond has no photo
    Motion.countTo(document.getElementById('pondOpen'), pond.activeComplaints);
    Motion.countTo(document.getElementById('pondResolved'), pond.resolvedComplaints);
    Motion.setupReveal();
  } catch (error) {
    container.innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
  }
}
