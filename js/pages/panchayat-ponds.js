/* JALACHAYA - Panchayat: add, edit and deactivate ponds */

const session = Auth.requireRole(ROLES.OFFICER);
let ponds = [];
let editingPondId = null; // null = adding a new pond
let pondPhotoPicker = null;

const pondForm = document.getElementById('pondForm');
const pondInputs = {
  name: document.getElementById('pondName'),
  ward: document.getElementById('pondWard'),
  village: document.getElementById('pondVillage'),
  areaAcres: document.getElementById('pondArea'),
  latitude: document.getElementById('pondLat'),
  longitude: document.getElementById('pondLng'),
  description: document.getElementById('pondDescription')
};

if (session) {
  UI.initDashboard(session);
  for (let i = 1; i <= 12; i++) {
    pondInputs.ward.insertAdjacentHTML('beforeend', '<option value="Ward ' + i + '">Ward ' + i + '</option>');
  }
  pondPhotoPicker = UI.photoPicker(document.getElementById('pondPhoto'), { max: 1, label: 'Add a pond photo' });
  document.getElementById('addPondBtn').addEventListener('click', function () { openPondForm(null); });
  pondForm.addEventListener('submit', savePond);
  loadPonds();
}

async function loadPonds() {
  const tbody = document.getElementById('pondTableBody');
  try {
    ponds = await API.getPonds();
    if (ponds.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No ponds registered yet.</td></tr>';
      return;
    }
    tbody.innerHTML = ponds.map(function (p) {
      const thumb = p.imageUrl
        ? '<img class="pond-thumb" src="' + UI.escape(UI.imageSrc(p.imageUrl)) + '" alt="' + UI.escape(p.name) + '" data-zoom data-caption="' + UI.escape(p.name) + '">'
        : '<span class="pond-thumb-empty" title="No photo"></span>';
      return '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td><strong>' + UI.escape(p.name) + '</strong></td>' +
        '<td>' + UI.escape(p.ward) + (p.village ? ', ' + UI.escape(p.village) : '') + '</td>' +
        '<td class="opt">' + (p.areaAcres ? p.areaAcres + ' ac' : '-') + '</td>' +
        '<td class="small opt">' + p.latitude.toFixed(4) + ', ' + p.longitude.toFixed(4) + '</td>' +
        '<td>' + p.activeComplaints + '</td>' +
        '<td style="min-width:120px">' + UI.meter(p.recoveryPercent) + '</td>' +
        '<td>' + (p.active ? '<span class="badge badge-ASSIGNED">Active</span>' : '<span class="badge badge-REJECTED">Inactive</span>') + '</td>' +
        '<td class="text-right"><div class="row-actions">' +
          '<button type="button" class="btn btn-small btn-outline" data-edit="' + p.id + '">Edit</button> ' +
          '<button type="button" class="btn btn-small btn-secondary" data-toggle="' + p.id + '">' + (p.active ? 'Deactivate' : 'Activate') + '</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openPondForm(Number(b.dataset.edit)); });
    });
    tbody.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { togglePond(Number(b.dataset.toggle), b); });
    });
  } catch (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Could not load ponds.</td></tr>';
    UI.showError(error);
  }
}

function openPondForm(pondId) {
  editingPondId = pondId;
  pondForm.reset();
  UI.clearFieldErrors(pondForm);
  document.getElementById('pondFormMessage').innerHTML = '';
  pondPhotoPicker.clear();
  const current = document.getElementById('pondCurrentPhoto');
  current.classList.add('hidden');
  current.innerHTML = '';

  if (pondId) {
    const p = ponds.find(function (x) { return x.id === pondId; });
    document.getElementById('pondDialogTitle').textContent = 'Edit pond';
    pondInputs.name.value = p.name;
    pondInputs.ward.value = p.ward;
    pondInputs.village.value = p.village || '';
    pondInputs.areaAcres.value = p.areaAcres || '';
    pondInputs.latitude.value = p.latitude;
    pondInputs.longitude.value = p.longitude;
    pondInputs.description.value = p.description || '';
    if (p.imageUrl) {
      current.innerHTML = '<div class="current-photo">' +
        '<img src="' + UI.escape(UI.imageSrc(p.imageUrl)) + '" alt="Current photo" data-zoom data-caption="Current photo">' +
        '<label class="checkbox-label"><input type="checkbox" id="removePondPhoto"> Remove current photo</label></div>' +
        '<p class="hint">Adding a new photo below replaces the current one.</p>';
      current.classList.remove('hidden');
    }
  } else {
    document.getElementById('pondDialogTitle').textContent = 'Add pond';
  }
  UI.openDialog('pondDialog');
}

async function savePond(event) {
  event.preventDefault();
  UI.clearFieldErrors(pondForm);
  document.getElementById('pondFormMessage').innerHTML = '';

  const data = {
    name: pondInputs.name.value.trim(),
    ward: pondInputs.ward.value,
    village: pondInputs.village.value.trim(),
    areaAcres: pondInputs.areaAcres.value,
    latitude: pondInputs.latitude.value,
    longitude: pondInputs.longitude.value,
    description: pondInputs.description.value.trim()
  };

  // ---- Validation ----
  let valid = true;
  if (data.name.length < 3) { UI.showFieldError(pondInputs.name, 'Name must be at least 3 characters.'); valid = false; }
  if (!data.ward) { UI.showFieldError(pondInputs.ward, 'Please select a ward.'); valid = false; }
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (data.latitude === '' || isNaN(lat) || lat < -90 || lat > 90) {
    UI.showFieldError(pondInputs.latitude, 'Enter a latitude between -90 and 90.'); valid = false;
  }
  if (data.longitude === '' || isNaN(lng) || lng < -180 || lng > 180) {
    UI.showFieldError(pondInputs.longitude, 'Enter a longitude between -180 and 180.'); valid = false;
  }
  if (data.areaAcres !== '' && Number(data.areaAcres) <= 0) {
    UI.showFieldError(pondInputs.areaAcres, 'Area must be greater than 0.'); valid = false;
  }
  if (!valid) return;

  const button = document.getElementById('pondSaveBtn');
  UI.setLoading(button, true, 'Saving...');
  try {
    let pondId = editingPondId;
    if (editingPondId) {
      await API.updatePond(editingPondId, data);
    } else {
      const created = await API.createPond(data);
      pondId = created.id;
    }

    // Photo: upload a new one, or remove the current one
    const photos = pondPhotoPicker.getPhotos();
    const removeBox = document.getElementById('removePondPhoto');
    if (photos.length) {
      const formData = new FormData();
      formData.append('image', photos[0].blob, 'pond-photo.jpg');
      await API.uploadPondImage(pondId, formData);
    } else if (removeBox && removeBox.checked) {
      await API.removePondImage(pondId);
    }
    UI.toast(editingPondId ? 'Pond updated.' : 'Pond added.');
    UI.closeDialog('pondDialog');
    loadPonds();
  } catch (error) {
    document.getElementById('pondFormMessage').innerHTML = '<div class="alert alert-error">' + UI.escape(error.message) + '</div>';
  } finally {
    UI.setLoading(button, false);
  }
}

async function togglePond(pondId, button) {
  const pond = ponds.find(function (p) { return p.id === pondId; });
  const makeActive = !pond.active;
  if (!makeActive && !confirm('Deactivate ' + pond.name + '? It will be hidden from the public site and from new complaints. Its records are kept.')) {
    return;
  }
  UI.setLoading(button, true, 'Saving...');
  try {
    await API.updatePond(pondId, { active: makeActive });
    UI.toast(pond.name + (makeActive ? ' activated.' : ' deactivated.'));
    loadPonds();
  } catch (error) {
    UI.showError(error);
    UI.setLoading(button, false);
  }
}
