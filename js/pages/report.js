/* JALACHAYA - Citizen: report a pond problem with up to 3 photos */

const session = Auth.requireRole(ROLES.CITIZEN);

const reportForm = document.getElementById('reportForm');
const pondSelect = document.getElementById('pondId');
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
  if (!CONFIG.USE_MOCK_BACKEND) {
    document.getElementById('sampleAside').classList.add('hidden');
    return;
  }
  const list = document.getElementById('sampleList');
  const samples = CONFIG.SAMPLE_IMAGES.polluted;
  list.innerHTML = samples.map(function (sample, i) {
    return '<div class="sample-item">' +
      UI.photo(sample.url, sample.caption) +
      (CONFIG.USE_MOCK_BACKEND
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
    pondSelect.innerHTML = '<option value="">Select pond</option>' + pondList.map(function (p) {
      return '<option value="' + p.id + '">' + UI.escape(p.name) + ' (' + UI.escape(p.ward) + ')</option>';
    }).join('');

    // Pre-select a pond when coming from pond.html?id=...
    const preselect = UI.queryParam('pond');
    if (preselect && pondList.some(function (p) { return String(p.id) === preselect; })) {
      pondSelect.value = preselect;
      fillPondCoordinates();
    }
  } catch (error) {
    pondSelect.innerHTML = '<option value="">Could not load ponds</option>';
    UI.showError(error);
  }
}

function fillPondCoordinates() {
  const pond = pondList.find(function (p) { return String(p.id) === pondSelect.value; });
  if (pond) {
    document.getElementById('latitude').value = pond.latitude;
    document.getElementById('longitude').value = pond.longitude;
  }
}

function setupEvents() {
  pondSelect.addEventListener('change', fillPondCoordinates);

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
      status.textContent = 'Could not get location. The pond location will be used instead.';
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
  if (!pondSelect.value) { UI.showFieldError(pondSelect, 'Please select a pond.'); valid = false; }
  if (!categorySelect.value) { UI.showFieldError(categorySelect, 'Please select a category.'); valid = false; }
  if (description.length < 15) {
    UI.showFieldError(descriptionInput, 'Please describe the problem in at least 15 characters.'); valid = false;
  }
  const lat = latInput.value;
  const lng = lngInput.value;
  if (lat && (Number(lat) < -90 || Number(lat) > 90)) { UI.showFieldError(latInput, 'Latitude must be between -90 and 90.'); valid = false; }
  if (lng && (Number(lng) < -180 || Number(lng) > 180)) { UI.showFieldError(lngInput, 'Longitude must be between -180 and 180.'); valid = false; }
  if (!valid) {
    document.getElementById('formMessage').innerHTML = '<div class="alert alert-error">Please correct the highlighted fields.</div>';
    return;
  }

  // ---- Build multipart form data (same format the Spring Boot API expects) ----
  const photos = photoPicker.getPhotos();
  const formData = new FormData();
  formData.append('pondId', pondSelect.value);
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
