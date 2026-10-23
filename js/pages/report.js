/* JALACHAYA - Citizen: report a pond problem with up to 3 photos */

const session = Auth.requireRole(ROLES.CITIZEN);

const reportForm = document.getElementById('reportForm');
const pondNameInput = document.getElementById('pondName');
const pondWardInput = document.getElementById('pondWard');
const categorySelect = document.getElementById('category');
const descriptionInput = document.getElementById('description');
const submitBtn = document.getElementById('submitBtn');

let pondList = [];
let photoPicker = null;

if (session) {
  UI.initDashboard(session);
  photoPicker = UI.photoPicker(document.getElementById('reportPhotos'), { max: CONFIG.MAX_REPORT_PHOTOS });
  fillCategories();
  renderSamples();
  API.getMe().then(function (me) { session.demo = me.demo === true; renderSamples(); }).catch(function () {});
  loadPonds();
  setupEvents();
}

function fillCategories() {
  Object.keys(CATEGORIES).forEach(function (key) {
    categorySelect.insertAdjacentHTML('beforeend', '<option value="' + key + '">' + CATEGORIES[key] + '</option>');
  });
}

// Sample photos panel: real photos of polluted ponds (CONFIG.SAMPLE_IMAGES.polluted)
function renderSamples() {
  if (!session.demo) {
    document.getElementById('sampleAside').classList.add('hidden');
    return;
  }
  const list = document.getElementById('sampleList');
  const samples = CONFIG.SAMPLE_IMAGES.polluted;
  list.innerHTML = samples.map(function (sample, i) {
    return '<div class="sample-item">' +
      UI.photo(sample.url, sample.caption) +
      (session.demo
        ? '<button type="button" class="btn btn-small btn-secondary" data-sample="' + i + '">Use this photo</button>'
        : '') +
      '</div>';
  }).join('');

  list.querySelectorAll('[data-sample]').forEach(function (button) {
    button.addEventListener('click', function () {
      const index = Number(button.dataset.sample);
      photoPicker.addFromUrl(samples[index].url, 'sample-polluted-' + (index + 1) + '.jpg');
    });
  });
}

async function loadPonds() {
  try {
    pondList = await API.getPublicPonds();
    document.getElementById('pondSuggestions').innerHTML = pondList.map(function (p) {
      return '<option value="' + UI.escape(p.name) + '">' + UI.escape(p.ward) + '</option>';
    }).join('');
    const preselect = UI.queryParam('pond');
    const pond = pondList.find(function (p) { return String(p.id) === preselect; });
    if (pond) {
      pondNameInput.value = pond.name; pondWardInput.value = pond.ward;
      document.getElementById('latitude').value = pond.latitude == null ? '' : pond.latitude;
      document.getElementById('longitude').value = pond.longitude == null ? '' : pond.longitude;
    }

  } catch (error) {
    // Suggestions are optional; an unregistered pond can still be reported.
    document.getElementById('pondSuggestions').innerHTML = '';
  }
}

function setupEvents() {
  // Names and locations are entered by the citizen; suggestions never constrain reporting.

  descriptionInput.addEventListener('input', function () {
    document.getElementById('charCount').textContent = descriptionInput.value.length;
  });

  // Browser geolocation (asks the user for permission)
  document.getElementById('useLocationBtn').addEventListener('click', function () {
    const status = document.getElementById('locationStatus');
    if (!navigator.geolocation) {
      status.textContent = 'Location is not supported by this browser.';
      return;
    }
    status.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      document.getElementById('latitude').value = pos.coords.latitude.toFixed(6);
      document.getElementById('longitude').value = pos.coords.longitude.toFixed(6);
      status.textContent = 'Location added.';
    }, function () {
      status.textContent = 'Could not get location. You can enter coordinates manually or describe the location using the ward and landmark.';
    }, { timeout: 10000 });
  });

  reportForm.addEventListener('submit', submitReport);
}

async function submitReport(event) {
  event.preventDefault();
  if (submitBtn.disabled) return; // already submitting
  UI.clearFieldErrors(reportForm);
  document.getElementById('formMessage').innerHTML = '';

  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const description = descriptionInput.value.trim();

  // ---- Validation ----
  let valid = true;
  if (pondNameInput.value.trim().length < 3) { UI.showFieldError(pondNameInput, 'Enter the pond name (at least 3 characters).'); valid = false; }
  if (!pondWardInput.value.trim()) { UI.showFieldError(pondWardInput, 'Enter the ward or locality.'); valid = false; }
  if (!categorySelect.value) { UI.showFieldError(categorySelect, 'Please select a category.'); valid = false; }
  if (description.length < 15) {
    UI.showFieldError(descriptionInput, 'Please describe the problem in at least 15 characters.'); valid = false;
  }
  const lat = latInput.value;
  const lng = lngInput.value;
  if (lat && (Number(lat) < -90 || Number(lat) > 90)) { UI.showFieldError(latInput, 'Latitude must be between -90 and 90.'); valid = false; }
  if (lng && (Number(lng) < -180 || Number(lng) > 180)) { UI.showFieldError(lngInput, 'Longitude must be between -180 and 180.'); valid = false; }
  if (Boolean(lat) !== Boolean(lng)) { UI.showFieldError(latInput, 'Enter both coordinates or leave both blank.'); valid = false; }
  if (!valid) {
    document.getElementById('formMessage').innerHTML = '<div class="alert alert-error">Please correct the highlighted fields.</div>';
    return;
  }

  // ---- Build multipart form data (same format the Spring Boot API expects) ----
  const photos = photoPicker.getPhotos();
  const formData = new FormData();
  formData.append('pondName', pondNameInput.value.trim());
  formData.append('pondWard', pondWardInput.value.trim());
  formData.append('category', categorySelect.value);
  formData.append('description', description);
  formData.append('landmark', document.getElementById('landmark').value.trim());
  formData.append('latitude', lat);
  formData.append('longitude', lng);
  photos.forEach(function (p, i) {
    formData.append('images', p.blob, 'complaint-photo-' + (i + 1) + '.jpg');
  });

  UI.setLoading(submitBtn, true, photos.length ? 'Uploading ' + photos.length + ' photo' + (photos.length > 1 ? 's' : '') + '...' : 'Submitting...');
  try {
    const created = await API.createProblem(formData);
    document.getElementById('reportLayout').classList.add('hidden');
    document.getElementById('newComplaintId').textContent = created.code;
    document.getElementById('viewComplaintLink').href = 'dashboard.html?open=' + created.id;
    document.getElementById('successPanel').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch (error) {
    document.getElementById('formMessage').innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
    UI.setLoading(submitBtn, false);
  }
}
