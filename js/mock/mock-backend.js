/* =========================================================
   JALACHAYA - Mock backend (DEMO MODE ONLY)
   ---------------------------------------------------------
   Pretends to be the Spring Boot backend so the frontend can be
   tested without a server. All data is kept in localStorage.

   It follows the same rules the real backend should enforce:
   role checks, valid status changes, no duplicate votes, and
   keeping history instead of deleting it.

   When the real backend is ready, set USE_MOCK_BACKEND = false
   in js/config.js. This file is then no longer used.
   ========================================================= */

const DB_KEY = 'jalachaya_demo_db_v3';

/* ---------- Storage helpers ---------- */
function loadDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Demo data was corrupted and has been reset.');
    }
  }
  const db = createSeedData();
  saveDb(db);
  return db;
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    throw new ApiError(507, 'Browser storage is full. Use "Reset demo data" to clear old uploads.');
  }
}

function resetDemoData() {
  localStorage.removeItem(DB_KEY);
}

/* ---------- Small utilities ---------- */
function mockDelay() {
  return new Promise(function (resolve) { setTimeout(resolve, CONFIG.MOCK_DELAY_MS); });
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function nowIso() {
  return new Date().toISOString();
}
function readableDate(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function cleanText(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

// Reads an uploaded File/Blob as a data URL so it can be saved in localStorage
function fileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new ApiError(400, 'Could not read the uploaded image.')); };
    reader.readAsDataURL(file);
  });
}

// Validates and converts every image in a FormData field (e.g. "images")
async function readImages(formData, field, max) {
  const files = formData.getAll(field).filter(function (f) { return f && f.size; });
  if (files.length > max) throw new ApiError(400, 'You can attach up to ' + max + ' photos.');
  const urls = [];
  for (const file of files) {
    validateImage(file, 'Photo');
    urls.push(await fileToDataUrl(file));
  }
  return urls;
}

function validateImage(file, label) {
  if (!file || !file.size) return false;
  if (CONFIG.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
    throw new ApiError(400, label + ' must be a JPG, PNG or WEBP image.');
  }
  if (file.size > CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new ApiError(400, label + ' must be smaller than ' + CONFIG.MAX_IMAGE_SIZE_MB + ' MB.');
  }
  return true;
}

/* ---------- Authentication / permission helpers ---------- */
function currentUser(db) {
  const session = Auth.getSession();
  if (!session || !session.token) throw new ApiError(401, 'Please log in to continue.');
  const userId = Number(String(session.token).replace('demo-token-', ''));
  const user = db.users.find(function (u) { return u.id === userId; });
  if (!user) throw new ApiError(401, 'Your session has expired. Please log in again.');
  return user;
}

function requireRole(db, allowedRoles) {
  const user = currentUser(db);
  if (allowedRoles.indexOf(user.role) === -1) {
    throw new ApiError(403, 'You do not have permission to do this.');
  }
  return user;
}

function findById(list, id, label) {
  const item = list.find(function (x) { return x.id === Number(id); });
  if (!item) throw new ApiError(404, label + ' not found.');
  return item;
}

function sessionFor(user) {
  return { token: 'demo-token-' + user.id, role: user.role, userId: user.id, name: user.name };
}

function publicUser(user) {
  const copy = clone(user);
  delete copy.password;
  return copy;
}

/* ---------- Workflow helpers ---------- */
function recordHistory(problem, status, note, user) {
  problem.status = status;
  problem.updatedAt = nowIso();
  problem.history.push({ status: status, note: note, by: user.name, role: user.role, at: problem.updatedAt });
}

function getActiveTask(db, problemId) {
  return db.tasks.find(function (t) { return t.problemId === problemId && t.active; }) || null;
}

function isOverdue(problem, task) {
  if (!task || !task.active) return false;
  if (ACTIVE_WORK_STATUSES.indexOf(problem.status) === -1) return false;
  return new Date(task.deadline).getTime() < Date.now();
}

// Pond Recovery Index - see RECOVERY_WEIGHTS in constants.js
function computeRecovery(problems) {
  const counted = problems.filter(function (p) { return p.status !== 'REJECTED'; });
  if (counted.length === 0) return null;
  let weighted = 0;
  let totalWeight = 0;
  counted.forEach(function (p) {
    const weight = RECOVERY_WEIGHTS[p.priority] || 1;
    weighted += weight * (RECOVERY_COMPLETION[p.status] || 0);
    totalWeight += weight;
  });
  return Math.round((weighted / totalWeight) * 100);
}

function pondStats(db, pond) {
  const problems = db.problems.filter(function (p) { return p.pondId === pond.id; });
  const open = problems.filter(function (p) { return p.status !== 'VERIFIED' && p.status !== 'REJECTED'; });
  const resolved = problems.filter(function (p) { return p.status === 'VERIFIED'; });
  return {
    totalComplaints: problems.filter(function (p) { return p.status !== 'REJECTED'; }).length,
    activeComplaints: open.length,
    resolvedComplaints: resolved.length,
    recoveryPercent: computeRecovery(problems)
  };
}

function taskView(db, task) {
  const worker = db.users.find(function (u) { return u.id === task.workerId; });
  const view = clone(task);
  view.workerName = worker ? worker.name : 'Unknown';
  view.workerTeam = worker ? worker.team : '';
  return view;
}

// Hides staff and other citizens' names from citizen views
function maskHistoryForCitizen(history, viewer) {
  return history.map(function (h) {
    let by = 'Panchayat office';
    if (h.role === ROLES.WORKER) by = 'Field team';
    if (h.role === ROLES.CITIZEN) by = (h.by === viewer.name) ? 'You' : 'Community member';
    return { status: h.status, note: h.note, by: by, at: h.at };
  });
}

// Adds pond name, task details etc. depending on who is asking
function problemView(db, problem, viewer) {
  const pond = db.ponds.find(function (p) { return p.id === problem.pondId; });
  const task = getActiveTask(db, problem.id);
  const view = clone(problem);
  view.pondName = pond ? pond.name : 'Unknown pond';
  view.overdue = isOverdue(problem, task);

  if (viewer.role === ROLES.CITIZEN) {
    view.history = maskHistoryForCitizen(problem.history, viewer);
    view.task = task ? {
      id: task.id,
      deadline: task.deadline,
      evidence: ['COMMUNITY_VERIFICATION', 'VERIFIED'].indexOf(problem.status) !== -1 ? task.evidence : null
    } : null;
    return view;
  }

  const reporter = db.users.find(function (u) { return u.id === problem.reporterId; });
  view.reporterName = reporter ? reporter.name : 'Unknown';
  view.task = task ? taskView(db, task) : null;
  view.previousTaskCount = db.tasks.filter(function (t) { return t.problemId === problem.id && !t.active; }).length;

  if (viewer.role === ROLES.OFFICER) {
    view.reporterPhone = reporter ? reporter.phone : '';
    view.communityVerifications = db.communityVerifications
      .filter(function (v) { return v.problemId === problem.id; })
      .map(function (v) {
        const u = db.users.find(function (x) { return x.id === v.userId; });
        return { decision: v.decision, comment: v.comment, imageUrl: v.imageUrl || null, createdAt: v.createdAt, userName: u ? u.name : 'Citizen' };
      });
  }
  return view;
}

function newestFirst(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

/* =========================================================
   Mock API methods - same names as the API object in api.js
   ========================================================= */
const MockBackend = {

  /* ---------- Auth ---------- */
  async login(email, password) {
    await mockDelay();
    const db = loadDb();
    const user = db.users.find(function (u) { return u.email.toLowerCase() === cleanText(email).toLowerCase(); });
    if (!user || user.password !== password) {
      throw new ApiError(401, 'Incorrect email or password.');
    }
    return sessionFor(user);
  },

  async register(data) {
    await mockDelay();
    const db = loadDb();
    const name = cleanText(data.name);
    const email = cleanText(data.email).toLowerCase();
    if (name.length < 3) throw new ApiError(400, 'Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Please enter a valid email address.');
    if (!data.password || data.password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters.');
    if (db.users.some(function (u) { return u.email.toLowerCase() === email; })) {
      throw new ApiError(409, 'An account with this email already exists.');
    }
    const user = {
      id: db.nextIds.user++,
      name: name,
      email: email,
      password: data.password, // demo only - backend must hash passwords
      role: ROLES.CITIZEN,     // only citizens can self-register
      phone: cleanText(data.phone),
      ward: cleanText(data.ward),
      createdAt: nowIso()
    };
    db.users.push(user);
    saveDb(db);
    return sessionFor(user);
  },

  async getMe() {
    await mockDelay();
    const db = loadDb();
    return publicUser(currentUser(db));
  },

  async getWorkers() {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    return db.users
      .filter(function (u) { return u.role === ROLES.WORKER; })
      .map(function (u) {
        const openTasks = db.tasks.filter(function (t) {
          if (t.workerId !== u.id || !t.active) return false;
          const p = db.problems.find(function (x) { return x.id === t.problemId; });
          return p && ACTIVE_WORK_STATUSES.indexOf(p.status) !== -1;
        }).length;
        return { id: u.id, name: u.name, team: u.team, phone: u.phone, openTasks: openTasks };
      });
  },

  /* ---------- Public pond information ---------- */
  async getPublicPonds() {
    await mockDelay();
    const db = loadDb();
    return db.ponds
      .filter(function (p) { return p.active; })
      .map(function (p) {
        return Object.assign({
          id: p.id, name: p.name, ward: p.ward, village: p.village, imageUrl: p.imageUrl || null,
          areaAcres: p.areaAcres, latitude: p.latitude, longitude: p.longitude
        }, pondStats(db, p));
      });
  },

  async getPublicPond(id) {
    await mockDelay();
    const db = loadDb();
    const pond = findById(db.ponds, id, 'Pond');
    if (!pond.active) throw new ApiError(404, 'Pond not found.');
    const timeline = db.problems
      .filter(function (p) { return p.pondId === pond.id && p.status !== 'REJECTED'; })
      .sort(newestFirst)
      .map(function (p) {
        // Public view: no reporter or worker details
        return { code: p.code, category: p.category, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt };
      });
    return Object.assign(clone(pond), pondStats(db, pond), { timeline: timeline });
  },

  // Recently verified work that has before and after photos (home page)
  async getPublicHighlights() {
    await mockDelay();
    const db = loadDb();
    return db.problems
      .filter(function (p) { return p.status === 'VERIFIED'; })
      .map(function (p) {
        const task = getActiveTask(db, p.id);
        const pond = db.ponds.find(function (x) { return x.id === p.pondId; });
        if (!task || !task.evidence || !task.evidence.beforeImageUrl || !task.evidence.afterImageUrl) return null;
        return {
          code: p.code, pondName: pond ? pond.name : '', category: p.category, verifiedAt: p.updatedAt,
          beforeImageUrl: task.evidence.beforeImageUrl, afterImageUrl: task.evidence.afterImageUrl,
          remarks: task.evidence.remarks
        };
      })
      .filter(function (x) { return x !== null; })
      .sort(function (a, b) { return new Date(b.verifiedAt) - new Date(a.verifiedAt); })
      .slice(0, 2);
  },

  // Latest public events across all complaints for the home page feed.
  // Public wording only: no names, no internal notes or escalations.
  async getPublicActivity() {
    await mockDelay();
    const db = loadDb();
    const PUBLIC_TEXT = {
      SUBMITTED: 'New complaint reported',
      ASSIGNED: 'Field worker assigned',
      IN_PROGRESS: 'Inspection started',
      COMPLETION_CLAIMED: 'Clean-up work submitted',
      COMMUNITY_VERIFICATION: 'Sent to residents for verification',
      VERIFIED: 'Verified as resolved by residents',
      REOPENED: 'Reopened after a resident disputed the work'
    };
    const events = [];
    db.problems.forEach(function (p) {
      if (p.status === 'REJECTED') return;
      const pond = db.ponds.find(function (x) { return x.id === p.pondId; });
      p.history.forEach(function (h, i) {
        let text = null;
        if (h.note.indexOf('Citizen added a photo') === 0) text = 'New photo added';
        else if (h.note.indexOf('Escalated') === 0 || h.note.indexOf('Returned') === 0) text = null;
        else if (i === 0 || h.status !== p.history[i - 1].status) text = PUBLIC_TEXT[h.status] || null;
        if (text) {
          events.push({ id: p.id + '-' + i, code: p.code, pondName: pond ? pond.name : '', status: h.status, text: text, at: h.at });
        }
      });
    });
    return events
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); })
      .slice(0, 6);
  },

  /* ---------- Pond management ---------- */
  async getPonds() {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    return db.ponds.map(function (p) { return Object.assign(clone(p), pondStats(db, p)); });
  },

  async createPond(data) {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    const pond = Object.assign({ id: db.nextIds.pond++, active: true, imageUrl: null, createdAt: nowIso() }, validatePond(db, data, null));
    db.ponds.push(pond);
    saveDb(db);
    return clone(pond);
  },

  async updatePond(id, data) {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    const pond = findById(db.ponds, id, 'Pond');

    // Only changing the active flag (deactivate / reactivate)
    if (Object.keys(data).length === 1 && 'active' in data) {
      if (data.active === false && pondStats(db, pond).activeComplaints > 0) {
        throw new ApiError(409, 'This pond still has open complaints. Close them before deactivating.');
      }
      pond.active = Boolean(data.active);
    } else {
      Object.assign(pond, validatePond(db, data, pond.id));
    }
    saveDb(db);
    return clone(pond);
  },

  // formData field: image
  async uploadPondImage(id, formData) {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    const pond = findById(db.ponds, id, 'Pond');
    const urls = await readImages(formData, 'image', 1);
    if (urls.length === 0) throw new ApiError(400, 'Please choose a photo.');
    pond.imageUrl = urls[0];
    saveDb(db);
    return clone(pond);
  },

  async removePondImage(id) {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    const pond = findById(db.ponds, id, 'Pond');
    pond.imageUrl = null;
    saveDb(db);
    return clone(pond);
  },

  /* ---------- Complaints ---------- */
  async createProblem(formData) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.CITIZEN]);

    const pond = db.ponds.find(function (p) { return p.id === Number(formData.get('pondId')) && p.active; });
    if (!pond) throw new ApiError(400, 'Please select a valid pond.');
    const category = formData.get('category');
    if (!CATEGORIES[category]) throw new ApiError(400, 'Please select a problem category.');
    const description = cleanText(formData.get('description'));
    if (description.length < 15) throw new ApiError(400, 'Description must be at least 15 characters.');

    const lat = formData.get('latitude');
    const lng = formData.get('longitude');

    const imageUrls = await readImages(formData, 'images', CONFIG.MAX_REPORT_PHOTOS);

    const problem = {
      id: db.nextIds.problem++,
      code: 'JC-' + db.nextIds.code++,
      pondId: pond.id,
      reporterId: user.id,
      category: category,
      priority: 'MEDIUM',
      description: description,
      landmark: cleanText(formData.get('landmark')),
      latitude: lat ? Number(lat) : pond.latitude,
      longitude: lng ? Number(lng) : pond.longitude,
      images: imageUrls.map(function (url, i) {
        return { url: url, caption: 'Reported photo ' + (i + 1), addedBy: user.name, role: user.role, at: nowIso() };
      }),
      status: 'SUBMITTED',
      rejectionReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      history: []
    };
    const photoNote = imageUrls.length ? ' with ' + imageUrls.length + ' photo' + (imageUrls.length > 1 ? 's' : '') : '';
    recordHistory(problem, 'SUBMITTED', 'Complaint submitted' + photoNote + '.', user);
    db.problems.push(problem);
    saveDb(db);
    return problemView(db, problem, user);
  },

  // Citizen adds another photo to their own open complaint. formData: image, caption
  async addProblemImage(id, formData) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.CITIZEN]);
    const problem = findById(db.problems, id, 'Complaint');
    if (problem.reporterId !== user.id) throw new ApiError(403, 'You can only add photos to your own complaints.');
    if (problem.status === 'VERIFIED' || problem.status === 'REJECTED') {
      throw new ApiError(409, 'This complaint is closed. Photos can no longer be added.');
    }
    if (problem.images.length >= CONFIG.MAX_COMPLAINT_PHOTOS) {
      throw new ApiError(409, 'This complaint already has the maximum of ' + CONFIG.MAX_COMPLAINT_PHOTOS + ' photos.');
    }
    const urls = await readImages(formData, 'image', 1);
    if (urls.length === 0) throw new ApiError(400, 'Please choose a photo.');
    const caption = cleanText(formData.get('caption')) || 'Added later';
    problem.images.push({ url: urls[0], caption: caption, addedBy: user.name, role: user.role, at: nowIso() });
    recordHistory(problem, problem.status, 'Citizen added a photo: ' + caption + '.', user);
    saveDb(db);
    return problemView(db, problem, user);
  },

  async getMyProblems() {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.CITIZEN]);
    return db.problems
      .filter(function (p) { return p.reporterId === user.id; })
      .sort(newestFirst)
      .map(function (p) { return problemView(db, p, user); });
  },

  async getProblems(filters) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const f = filters || {};
    const search = cleanText(f.search).toLowerCase();

    return db.problems
      .map(function (p) { return problemView(db, p, user); })
      .filter(function (p) {
        if (f.pondId && p.pondId !== Number(f.pondId)) return false;
        if (f.category && p.category !== f.category) return false;
        if (f.priority && p.priority !== f.priority) return false;
        if (f.status && p.status !== f.status) return false;
        if (f.overdue && !p.overdue) return false;
        if (search) {
          const text = [p.code, p.description, p.landmark, p.pondName, p.reporterName].join(' ').toLowerCase();
          if (text.indexOf(search) === -1) return false;
        }
        return true;
      })
      .sort(newestFirst);
  },

  async getProblem(id) {
    await mockDelay();
    const db = loadDb();
    const user = currentUser(db);
    const problem = findById(db.problems, id, 'Complaint');

    const isReporter = problem.reporterId === user.id;
    const isAssignedWorker = db.tasks.some(function (t) { return t.problemId === problem.id && t.workerId === user.id; });
    const allowed = user.role === ROLES.OFFICER ||
      (user.role === ROLES.CITIZEN && isReporter) ||
      (user.role === ROLES.WORKER && isAssignedWorker);
    if (!allowed) throw new ApiError(403, 'You do not have permission to view this complaint.');

    return problemView(db, problem, user);
  },

  async rejectProblem(id, reason) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const problem = findById(db.problems, id, 'Complaint');
    if (['SUBMITTED', 'REOPENED'].indexOf(problem.status) === -1) {
      throw new ApiError(409, 'Only new or reopened complaints can be rejected.');
    }
    reason = cleanText(reason);
    if (reason.length < 5) throw new ApiError(400, 'Please give a reason for rejecting.');
    problem.rejectionReason = reason;
    recordHistory(problem, 'REJECTED', 'Rejected: ' + reason, user);
    saveDb(db);
    return problemView(db, problem, user);
  },

  /* ---------- Tasks ---------- */
  async assignTask(data) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const problem = findById(db.problems, data.problemId, 'Complaint');
    if (['SUBMITTED', 'REOPENED'].indexOf(problem.status) === -1) {
      throw new ApiError(409, 'This complaint has already been assigned.');
    }
    const worker = db.users.find(function (u) { return u.id === Number(data.assignedWorkerId) && u.role === ROLES.WORKER; });
    if (!worker) throw new ApiError(400, 'Please select a field worker.');
    const deadline = new Date(data.deadline);
    if (isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      throw new ApiError(400, 'Deadline must be a future date and time.');
    }
    if (!PRIORITIES[data.priority]) throw new ApiError(400, 'Please select a priority.');

    // Close any earlier task (keeps it for history)
    db.tasks.forEach(function (t) { if (t.problemId === problem.id) t.active = false; });

    const task = {
      id: db.nextIds.task++,
      problemId: problem.id,
      workerId: worker.id,
      assignedById: user.id,
      priority: data.priority,
      deadline: deadline.toISOString(),
      instructions: cleanText(data.instructions),
      active: true,
      createdAt: nowIso(),
      startedAt: null,
      notes: [],
      evidence: null,
      review: null,
      escalationLevel: 0,
      escalations: []
    };
    db.tasks.push(task);
    problem.priority = data.priority;
    recordHistory(problem, 'ASSIGNED',
      'Assigned to ' + worker.name + ' (' + worker.team + '). Deadline: ' + readableDate(task.deadline) + '.', user);
    saveDb(db);
    return problemView(db, problem, user);
  },

  async getMyTasks() {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.WORKER]);
    return db.tasks
      .filter(function (t) { return t.workerId === user.id; })
      .map(function (t) {
        const problem = db.problems.find(function (p) { return p.id === t.problemId; });
        const pond = db.ponds.find(function (p) { return p.id === problem.pondId; });
        const view = clone(t);
        view.problem = {
          id: problem.id, code: problem.code, category: problem.category, description: problem.description,
          landmark: problem.landmark, latitude: problem.latitude, longitude: problem.longitude,
          images: clone(problem.images), status: problem.status, createdAt: problem.createdAt
        };
        view.pondName = pond ? pond.name : 'Unknown pond';
        // A task that was reopened by the community is closed for this worker
        view.stage = t.active ? problem.status : 'CLOSED';
        view.overdue = isOverdue(problem, t);
        return view;
      })
      .sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return new Date(a.deadline) - new Date(b.deadline);
      });
  },

  async startTask(taskId) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.WORKER]);
    const ctx = getOwnTask(db, taskId, user);
    if (ctx.problem.status !== 'ASSIGNED') throw new ApiError(409, 'This task has already been started.');
    ctx.task.startedAt = nowIso();
    recordHistory(ctx.problem, 'IN_PROGRESS', 'Inspection started.', user);
    saveDb(db);
    return clone(ctx.task);
  },

  // formData fields: text, image (optional)
  async addTaskNote(taskId, formData) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.WORKER]);
    const ctx = getOwnTask(db, taskId, user);
    if (ACTIVE_WORK_STATUSES.indexOf(ctx.problem.status) === -1) {
      throw new ApiError(409, 'Notes can only be added while the task is open.');
    }
    const text = cleanText(formData.get('text'));
    if (text.length < 3) throw new ApiError(400, 'Please write a note.');
    const urls = await readImages(formData, 'image', 1);
    ctx.task.notes.push({ text: text, imageUrl: urls[0] || null, at: nowIso() });
    saveDb(db);
    return clone(ctx.task);
  },

  async submitCompletion(taskId, formData) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.WORKER]);
    const ctx = getOwnTask(db, taskId, user);
    if (ctx.problem.status !== 'IN_PROGRESS') {
      throw new ApiError(409, 'Start the inspection before submitting completion.');
    }
    const before = formData.get('beforeImage');
    const after = formData.get('afterImage');
    if (!validateImage(before, 'Before photo')) throw new ApiError(400, 'A before photo is required.');
    if (!validateImage(after, 'After photo')) throw new ApiError(400, 'An after photo is required.');
    const remarks = cleanText(formData.get('remarks'));
    if (remarks.length < 10) throw new ApiError(400, 'Please describe the work done (at least 10 characters).');

    ctx.task.evidence = {
      beforeImageUrl: await fileToDataUrl(before),
      afterImageUrl: await fileToDataUrl(after),
      remarks: remarks,
      submittedAt: nowIso()
    };
    ctx.task.review = null;
    recordHistory(ctx.problem, 'COMPLETION_CLAIMED', 'Work completed and evidence submitted.', user);
    saveDb(db);
    return clone(ctx.task);
  },

  /* ---------- Verification ---------- */
  async reviewCompletion(taskId, decision, comment) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const task = findById(db.tasks, taskId, 'Task');
    const problem = findById(db.problems, task.problemId, 'Complaint');
    if (problem.status !== 'COMPLETION_CLAIMED') throw new ApiError(409, 'There is no submitted work to review.');
    comment = cleanText(comment);

    if (decision === 'FORWARD') {
      task.review = { decision: 'FORWARD', comment: comment, at: nowIso() };
      recordHistory(problem, 'COMMUNITY_VERIFICATION',
        'Evidence reviewed. Sent for community verification.' + (comment ? ' Note: ' + comment : ''), user);
    } else if (decision === 'RETURN') {
      if (comment.length < 5) throw new ApiError(400, 'Please explain what the worker needs to redo.');
      task.review = { decision: 'RETURN', comment: comment, at: nowIso() };
      recordHistory(problem, 'IN_PROGRESS', 'Returned to field worker: ' + comment, user);
    } else {
      throw new ApiError(400, 'Unknown review decision.');
    }
    saveDb(db);
    return problemView(db, problem, user);
  },

  async getPendingVerifications() {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.CITIZEN]);
    return db.problems
      .filter(function (p) { return p.status === 'COMMUNITY_VERIFICATION'; })
      .sort(newestFirst)
      .map(function (p) {
        const task = getActiveTask(db, p.id);
        const pond = db.ponds.find(function (x) { return x.id === p.pondId; });
        const mine = db.communityVerifications.find(function (v) { return v.taskId === task.id && v.userId === user.id; });
        return {
          problemId: p.id,
          code: p.code,
          pondName: pond ? pond.name : '',
          category: p.category,
          description: p.description,
          landmark: p.landmark,
          reportedByMe: p.reporterId === user.id,
          taskId: task.id,
          evidence: clone(task.evidence),
          myResponse: mine ? { decision: mine.decision, comment: mine.comment } : null
        };
      });
  },

  // formData fields: taskId, decision (CONFIRM / DISPUTE), comment, image (optional)
  async submitCommunityVerification(formData) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.CITIZEN]);
    const data = {
      taskId: formData.get('taskId'),
      decision: formData.get('decision'),
      comment: formData.get('comment')
    };
    const task = findById(db.tasks, data.taskId, 'Task');
    const problem = findById(db.problems, task.problemId, 'Complaint');

    if (!task.active || problem.status !== 'COMMUNITY_VERIFICATION') {
      throw new ApiError(409, 'This work is no longer waiting for verification.');
    }
    if (task.workerId === user.id) throw new ApiError(403, 'You cannot verify your own work.');
    const duplicate = db.communityVerifications.some(function (v) { return v.taskId === task.id && v.userId === user.id; });
    if (duplicate) throw new ApiError(409, 'You have already responded to this verification.');

    const comment = cleanText(data.comment);
    if (data.decision === 'DISPUTE' && comment.length < 5) {
      throw new ApiError(400, 'Please explain why the problem is not resolved.');
    }
    if (data.decision !== 'CONFIRM' && data.decision !== 'DISPUTE') {
      throw new ApiError(400, 'Unknown decision.');
    }
    const urls = await readImages(formData, 'image', 1);
    const imageUrl = urls[0] || null;
    if (imageUrl) {
      problem.images.push({
        url: imageUrl,
        caption: data.decision === 'DISPUTE' ? 'Photo from dispute' : 'Photo from verification',
        addedBy: user.name, role: user.role, at: nowIso()
      });
    }

    db.communityVerifications.push({
      id: db.nextIds.communityVerification++,
      taskId: task.id,
      problemId: problem.id,
      userId: user.id,
      decision: data.decision,
      comment: comment,
      imageUrl: imageUrl,
      createdAt: nowIso()
    });

    if (data.decision === 'CONFIRM') {
      recordHistory(problem, 'VERIFIED', 'Confirmed by community' + (comment ? ': ' + comment : '.'), user);
    } else {
      task.active = false; // old task and evidence are kept, not deleted
      recordHistory(problem, 'REOPENED', 'Disputed by community: ' + comment, user);
    }
    saveDb(db);
    return { status: problem.status };
  },

  /* ---------- Escalation ---------- */
  async escalateTask(taskId, reason) {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const task = findById(db.tasks, taskId, 'Task');
    const problem = findById(db.problems, task.problemId, 'Complaint');
    if (!isOverdue(problem, task)) throw new ApiError(409, 'Only overdue tasks can be escalated.');
    if (task.escalationLevel >= MAX_ESCALATION_LEVEL) {
      throw new ApiError(409, 'This task is already at the highest escalation level.');
    }
    reason = cleanText(reason);
    if (reason.length < 5) throw new ApiError(400, 'Please give a reason for escalation.');

    task.escalationLevel += 1;
    const level = task.escalationLevel;
    task.escalations.push({ level: level, escalatedTo: ESCALATION_LEVELS[level], reason: reason, by: user.name, at: nowIso() });
    recordHistory(problem, problem.status,
      'Escalated to level ' + level + ' (' + ESCALATION_LEVELS[level] + '): ' + reason, user);
    saveDb(db);
    return problemView(db, problem, user);
  },

  /* ---------- Dashboard ---------- */
  async getDashboardSummary() {
    await mockDelay();
    const db = loadDb();
    const user = requireRole(db, [ROLES.OFFICER]);
    const all = db.problems.map(function (p) { return problemView(db, p, user); });
    function count(statuses) {
      return all.filter(function (p) { return statuses.indexOf(p.status) !== -1; }).length;
    }
    return {
      totalPonds: db.ponds.filter(function (p) { return p.active; }).length,
      activeProblems: all.filter(function (p) { return p.status !== 'VERIFIED' && p.status !== 'REJECTED'; }).length,
      newComplaints: count(['SUBMITTED', 'REOPENED']),
      inProgress: count(ACTIVE_WORK_STATUSES),
      overdue: all.filter(function (p) { return p.overdue; }).length,
      awaitingReview: count(['COMPLETION_CLAIMED']),
      awaitingVerification: count(['COMMUNITY_VERIFICATION']),
      verified: count(['VERIFIED'])
    };
  },

  async getAnalytics() {
    await mockDelay();
    const db = loadDb();
    requireRole(db, [ROLES.OFFICER]);
    const byCategory = {};
    const byStatus = {};
    Object.keys(CATEGORIES).forEach(function (k) { byCategory[k] = 0; });
    Object.keys(STATUS_LABELS).forEach(function (k) { byStatus[k] = 0; });
    db.problems.forEach(function (p) {
      byStatus[p.status] += 1;
      if (p.status !== 'REJECTED') byCategory[p.category] += 1;
    });
    const ponds = db.ponds
      .filter(function (p) { return p.active; })
      .map(function (p) { return Object.assign({ id: p.id, name: p.name }, pondStats(db, p)); });
    return { byCategory: byCategory, byStatus: byStatus, ponds: ponds };
  }
};

/* ---------- Helpers used by the methods above ---------- */
function validatePond(db, data, ownId) {
  const name = cleanText(data.name);
  const ward = cleanText(data.ward);
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  const area = data.areaAcres === '' || data.areaAcres === undefined ? null : Number(data.areaAcres);

  if (name.length < 3) throw new ApiError(400, 'Pond name must be at least 3 characters.');
  if (!ward) throw new ApiError(400, 'Ward is required.');
  if (data.latitude === '' || isNaN(lat) || lat < -90 || lat > 90) throw new ApiError(400, 'Latitude must be between -90 and 90.');
  if (data.longitude === '' || isNaN(lng) || lng < -180 || lng > 180) throw new ApiError(400, 'Longitude must be between -180 and 180.');
  if (area !== null && (isNaN(area) || area <= 0)) throw new ApiError(400, 'Area must be a positive number.');

  const duplicate = db.ponds.some(function (p) {
    return p.id !== ownId && p.name.toLowerCase() === name.toLowerCase() && p.ward === ward;
  });
  if (duplicate) throw new ApiError(409, 'A pond with this name already exists in ' + ward + '.');

  return {
    name: name,
    ward: ward,
    village: cleanText(data.village),
    areaAcres: area,
    latitude: lat,
    longitude: lng,
    description: cleanText(data.description)
  };
}

function getOwnTask(db, taskId, user) {
  const task = findById(db.tasks, taskId, 'Task');
  if (task.workerId !== user.id) throw new ApiError(403, 'This task is not assigned to you.');
  if (!task.active) throw new ApiError(409, 'This task has been closed.');
  const problem = findById(db.problems, task.problemId, 'Complaint');
  return { task: task, problem: problem };
}
