/* =========================================================
   JALACHAYA - Shared UI helpers
   Small functions reused by every page: formatting, badges,
   toast messages, dialogs, loading buttons, image preparation.
   ========================================================= */

const UI = {

  /* ---------- Text and dates ---------- */

  // Always escape user-entered text before putting it into innerHTML
  escape(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  formatDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  },

  // Value for <input type="datetime-local"> in local time
  toDateTimeInput(date) {
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  },

  // "just now", "5 min ago", "3 h ago", "2 days ago"
  timeAgo(value) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 10) return 'just now';
    if (seconds < 60) return seconds + ' s ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    const days = Math.floor(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  },

  daysBetween(fromIso, toIso) {
    const ms = new Date(toIso || Date.now()) - new Date(fromIso);
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  },

  queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  categoryLabel(key) {
    return CATEGORIES[key] || key;
  },

  /* ---------- Badges ---------- */
  statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + this.escape(STATUS_LABELS[status] || status) + '</span>';
  },

  priorityBadge(priority) {
    return '<span class="badge badge-' + priority + '">' + this.escape(PRIORITIES[priority] || priority) + '</span>';
  },

  overdueBadge() {
    return '<span class="badge badge-overdue">Overdue</span>';
  },

  /* ---------- Reusable HTML blocks ---------- */
  meter(percent) {
    if (percent === null || percent === undefined) {
      return '<span class="meter-label">No complaints</span>';
    }
    return '<div class="meter" title="' + percent + '%"><span style="width:' + percent + '%"></span></div>' +
      '<span class="meter-label">' + percent + '%</span>';
  },

  /* Turns a stored image path into something the <img> tag can load:
     - data:/blob:/http(s) URLs are used as they are
     - "/uploads/..." comes from the Spring Boot server
     - "assets/..." is relative to the project root (pages in sub-folders need "../") */
  imageSrc(url) {
    if (!url) return '';
    if (/^(data:|blob:|https?:)/.test(url)) return url;
    if (url.charAt(0) === '/') return CONFIG.USE_MOCK_BACKEND ? url : CONFIG.API_BASE_URL + url;
    return Auth.rootPath() + url;
  },

  // One photo in a frame. Click it to view larger.
  photo(url, caption, emptyText) {
    if (!url) {
      return '<div class="photo-placeholder">' + this.escape(emptyText || 'No photo attached') + '</div>';
    }
    return '<div class="photo-box"><img src="' + this.escape(this.imageSrc(url)) + '" alt="' + this.escape(caption || 'Uploaded photo') +
      '" data-zoom data-caption="' + this.escape(caption || '') + '" loading="lazy">' +
      (caption ? '<div class="photo-caption">' + this.escape(caption) + '</div>' : '') + '</div>';
  },

  // A grid of photos: images = [{ url, caption, at }]
  gallery(images, emptyText) {
    const self = this;
    if (!images || images.length === 0) {
      return '<div class="photo-placeholder">' + this.escape(emptyText || 'No photos') + '</div>';
    }
    return '<div class="gallery">' + images.map(function (img) {
      const caption = (img.caption || 'Photo') + (img.at ? ' - ' + self.formatDate(img.at) : '');
      return '<figure><img src="' + self.escape(self.imageSrc(img.url)) + '" alt="' + self.escape(img.caption || 'Photo') +
        '" data-zoom data-caption="' + self.escape(caption) + '" loading="lazy">' +
        '<figcaption>' + self.escape(caption) + '</figcaption></figure>';
    }).join('') + '</div>';
  },

  // Progress stepper showing where the complaint is in the workflow
  stepper(status) {
    const self = this;
    let steps;

    if (status === 'REJECTED') {
      steps = [{ s: 'SUBMITTED', cls: 'done' }, { s: 'REJECTED', cls: 'problem' }];
    } else if (status === 'REOPENED') {
      steps = [{ s: 'SUBMITTED', cls: 'done' }, { s: 'REOPENED', cls: 'problem' }].concat(
        STATUS_FLOW.slice(1).map(function (s) { return { s: s, cls: '' }; })
      );
    } else {
      const index = STATUS_FLOW.indexOf(status);
      steps = STATUS_FLOW.map(function (s, i) {
        return { s: s, cls: i < index ? 'done' : (i === index ? 'current' : '') };
      });
    }

    return '<ol class="stepper">' + steps.map(function (step) {
      return '<li class="' + step.cls + '">' + self.escape(STATUS_LABELS[step.s]) + '</li>';
    }).join('') + '</ol>';
  },

  // History list (newest first)
  timeline(history) {
    const self = this;
    if (!history || history.length === 0) return '<p class="muted">No history yet.</p>';
    return '<ul class="timeline">' + history.slice().reverse().map(function (h) {
      return '<li><div>' + self.statusBadge(h.status) + ' ' + self.escape(h.note) + '</div>' +
        '<div class="timeline-meta">' + self.escape(h.by) + ' &middot; ' + self.formatDateTime(h.at) + '</div></li>';
    }).join('') + '</ul>';
  },

  emptyState(message) {
    return '<div class="empty-state">' + this.escape(message) + '</div>';
  },

  /* ---------- Feedback ---------- */
  toast(message, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.setAttribute('role', 'status');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4000);
  },

  // Shows an API error to the user
  showError(error) {
    console.error(error);
    const message = error && error.message ? error.message : 'Something went wrong.';
    this.toast(message, 'error');
    if (error && error.status === 401) {
      Auth.logout();
      setTimeout(function () { window.location.href = Auth.rootPath() + 'login.html'; }, 1200);
    }
  },

  // Disables a button while a request is running (prevents double submit)
  setLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText || 'Please wait...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  },

  showFieldError(input, message) {
    input.classList.add('input-error');
    const error = document.createElement('div');
    error.className = 'field-error';
    error.textContent = message;
    input.insertAdjacentElement('afterend', error);
  },

  // Removes a field's error message as soon as the user edits that field
  setupLiveErrorClearing() {
    function clearOne(event) {
      const input = event.target;
      if (!input.classList || !input.classList.contains('input-error')) return;
      input.classList.remove('input-error');
      const next = input.nextElementSibling;
      if (next && next.classList.contains('field-error')) next.remove();
    }
    document.addEventListener('input', clearOne);
    document.addEventListener('change', clearOne);
  },

  clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach(function (el) { el.remove(); });
    form.querySelectorAll('.input-error').forEach(function (el) { el.classList.remove('input-error'); });
  },

  /* ---------- Dialogs (uses the built-in <dialog> element) ---------- */
  openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) dialog.showModal();
  },

  closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  },

  setupDialogs() {
    document.addEventListener('click', function (event) {
      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) {
        closeButton.closest('dialog').close();
        return;
      }
      // Clicking the dark backdrop closes the dialog
      if (event.target.tagName === 'DIALOG') event.target.close();
    });
  },

  /* ---------- Images ----------
     Checks type and size, then resizes the photo (canvas) so it is
     small enough to store in demo mode and quicker to upload.
     Resolves to { blob, url, sizeKb }. */
  prepareImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('No file selected.'));
      if (CONFIG.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        return reject(new Error('Only JPG, PNG or WEBP images are allowed.'));
      }
      if (file.size > CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        return reject(new Error('Image must be smaller than ' + CONFIG.MAX_IMAGE_SIZE_MB + ' MB.'));
      }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const max = CONFIG.IMAGE_MAX_DIMENSION;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // white background for transparent PNGs
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('Could not process this image.'));
          resolve({ blob: blob, url: URL.createObjectURL(blob), sizeKb: Math.round(blob.size / 1024) });
        }, 'image/jpeg', CONFIG.IMAGE_QUALITY);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('This file could not be opened as an image.'));
      };
      img.src = objectUrl;
    });
  },

  /* ---------- Lightbox: click any photo with data-zoom to view it larger ---------- */
  setupLightbox() {
    if (document.getElementById('lightbox')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'lightbox';
    dialog.className = 'lightbox';
    dialog.innerHTML = '<button type="button" class="dialog-close" data-close-dialog aria-label="Close">&times;</button>' +
      '<img alt=""><p class="photo-caption"></p>';
    document.body.appendChild(dialog);

    document.addEventListener('click', function (event) {
      const img = event.target.closest('img[data-zoom]');
      if (!img) return;
      dialog.querySelector('img').src = img.src;
      dialog.querySelector('img').alt = img.alt;
      dialog.querySelector('p').textContent = img.dataset.caption || '';
      dialog.showModal();
    });
  },

  /* ---------- Photo picker ----------
     Turns an empty <div> into an "add photos" box with thumbnails.
     Usage:  const picker = UI.photoPicker(document.getElementById('photos'), { max: 3 });
             picker.getPhotos()  -> [{ blob, url, sizeKb, name }]
     Supports clicking, choosing several files, and drag-and-drop. */
  photoPicker(root, options) {
    const self = this;
    const max = (options && options.max) || 1;
    const label = (options && options.label) || (max > 1 ? 'Add photos' : 'Add a photo');
    const photos = [];
    const inputId = root.id + 'Input';

    root.classList.add('photo-picker');
    root.innerHTML =
      '<div class="thumb-grid"></div>' +
      '<label class="dropzone" for="' + inputId + '">' +
        '<strong>' + self.escape(label) + '</strong>' +
        '<span>Click to choose' + (max > 1 ? ' (up to ' + max + ')' : '') + ' or drag an image here. JPG, PNG or WEBP, max ' +
          CONFIG.MAX_IMAGE_SIZE_MB + ' MB.</span>' +
        '<input type="file" id="' + inputId + '" class="sr-only" accept="' + CONFIG.ALLOWED_IMAGE_TYPES.join(',') + '"' +
          (max > 1 ? ' multiple' : '') + '>' +
      '</label>';

    const grid = root.querySelector('.thumb-grid');
    const dropzone = root.querySelector('.dropzone');
    const input = root.querySelector('input');

    function clearError() {
      root.classList.remove('input-error');
      const next = root.nextElementSibling;
      if (next && next.classList.contains('field-error')) next.remove();
    }

    function render() {
      grid.innerHTML = photos.map(function (p, i) {
        return '<div class="thumb">' +
          '<img src="' + p.url + '" alt="Selected photo ' + (i + 1) + '" data-zoom data-caption="' + self.escape(p.name) + '">' +
          '<button type="button" class="thumb-remove" data-index="' + i + '" aria-label="Remove photo">&times;</button>' +
          '<span class="thumb-size">' + p.sizeKb + ' KB</span>' +
          '</div>';
      }).join('');
      dropzone.classList.toggle('hidden', photos.length >= max);
      if (options && options.onChange) options.onChange(photos.length);
    }

    async function addFiles(fileList) {
      const files = Array.prototype.slice.call(fileList);
      const free = max - photos.length;
      if (files.length > free) {
        self.toast('Only ' + free + ' more photo' + (free === 1 ? '' : 's') + ' can be added.', 'error');
      }
      for (const file of files.slice(0, free)) {
        try {
          const prepared = await self.prepareImage(file);
          prepared.name = file.name || 'photo.jpg';
          photos.push(prepared);
          clearError();
        } catch (error) {
          self.toast(error.message, 'error');
        }
      }
      render();
    }

    input.addEventListener('change', function () {
      addFiles(input.files);
      input.value = ''; // allows choosing the same file again
    });

    grid.addEventListener('click', function (event) {
      const button = event.target.closest('.thumb-remove');
      if (!button) return;
      const removed = photos.splice(Number(button.dataset.index), 1)[0];
      URL.revokeObjectURL(removed.url);
      render();
    });

    // Drag and drop
    ['dragenter', 'dragover'].forEach(function (type) {
      dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.remove('dragging'); });
    });
    dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    render();

    return {
      getPhotos: function () { return photos.slice(); },
      count: function () { return photos.length; },
      addFiles: addFiles,
      // Loads an image from the site (e.g. a sample photo) as if the user picked it
      addFromUrl: async function (url, name) {
        if (photos.length >= max) {
          self.toast('Remove a photo first - the limit is ' + max + '.', 'error');
          return;
        }
        try {
          const response = await fetch(self.imageSrc(url));
          if (!response.ok) throw new Error();
          const blob = await response.blob();
          await addFiles([new File([blob], name || 'sample.jpg', { type: blob.type || 'image/jpeg' })]);
        } catch (e) {
          self.toast('Could not load the sample photo. Open the site through Live Server.', 'error');
        }
      },
      clear: function () {
        photos.forEach(function (p) { URL.revokeObjectURL(p.url); });
        photos.length = 0;
        clearError();
        render();
      }
    };
  },

  /* ---------- Responsive tables ----------
     On small screens each table row is shown as a card (see style.css).
     This copies every column heading into data-label on its cells so the
     card can show "Status: Assigned". It re-runs whenever a table changes. */
  labelTables() {
    document.querySelectorAll('table.table').forEach(function (table) {
      const headings = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
        return th.textContent.trim();
      });
      table.querySelectorAll('tbody tr').forEach(function (row) {
        Array.prototype.forEach.call(row.children, function (cell, i) {
          if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', headings[i] || '');
        });
      });
    });
  },

  setupResponsiveTables() {
    const self = this;
    let queued = false;
    self.labelTables();
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; self.labelTables(); });
    }).observe(document.body, { childList: true, subtree: true });
  },

  /* ---------- Page setup ---------- */

  // Public pages: mobile menu and "Dashboard" link when logged in
  initPublicPage() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', nav.classList.contains('open'));
      });
    }

    const session = Auth.getSession();
    document.querySelectorAll('[data-guest-only]').forEach(function (el) {
      el.classList.toggle('hidden', Boolean(session));
    });
    document.querySelectorAll('[data-auth-only]').forEach(function (el) {
      el.classList.toggle('hidden', !session);
      if (session && el.tagName === 'A') el.href = Auth.homeFor(session.role);
    });

    this.initResetButtons();
    this.setupDialogs();
    this.setupLiveErrorClearing();
    this.setupLightbox();
    this.setupResponsiveTables();
    if (typeof Motion !== 'undefined') Motion.init();
  },

  // Dashboard pages: user name, logout button, demo badge
  initDashboard(session) {
    if (!CONFIG.USE_MOCK_BACKEND && !document.getElementById('notificationLink')) {
      const bar = document.querySelector('.topbar-user');
      if (bar) {
        const link = document.createElement('a');
        link.id = 'notificationLink';
        link.className = 'btn btn-small btn-outline';
        link.href = Auth.rootPath() + 'notifications.html';
        link.textContent = 'Notifications';
        bar.prepend(link);
        const refresh = async function () {
          if (document.hidden) return;
          try {
            const inbox = await http('GET', '/api/notifications');
            link.textContent = 'Notifications' + (inbox.unreadCount ? ' (' + inbox.unreadCount + ')' : '');
          } catch (error) { link.title = error.message; }
        };
        refresh();
        setInterval(refresh, 20000);
      }
    }
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = session.name;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        Auth.logout();
        window.location.href = Auth.rootPath() + 'login.html?loggedOut=1';
      });
    }

    document.querySelectorAll('.demo-badge, .demo-note').forEach(function (el) {
      el.classList.toggle('hidden', !CONFIG.USE_MOCK_BACKEND);
    });

    this.initResetButtons();
    this.setupDialogs();
    this.setupLiveErrorClearing();
    this.setupLightbox();
    this.setupResponsiveTables();
    this.startClock();
    if (typeof Motion !== 'undefined') Motion.init();
  },

  // Ticking date and time in the dashboard top bar
  startClock() {
    const el = document.getElementById('topbarClock');
    if (!el) return;
    function tick() {
      const now = new Date();
      el.innerHTML = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) +
        ' &middot; ' + now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);
  },

  initResetButtons() {
    document.querySelectorAll('[data-reset-demo]').forEach(function (button) {
      if (!CONFIG.USE_MOCK_BACKEND) {
        button.classList.add('hidden');
        return;
      }
      button.addEventListener('click', function () {
        if (confirm('Reset all demo data? Complaints, uploads and new accounts saved in this browser will be removed.')) {
          resetDemoData();
          Auth.logout();
          window.location.href = Auth.rootPath() + 'index.html';
        }
      });
    });
  }
};
