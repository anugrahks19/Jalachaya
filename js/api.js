/* JALACHAYA — every page action uses the real Java REST API. */

// Error returned by the real backend or a network failure
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Friendly default messages for common HTTP status codes
function defaultErrorMessage(status) {
  if (status === 400) return 'Some of the information sent was not valid.';
  if (status === 401) return 'Please log in to continue.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'The requested record was not found.';
  if (status === 409) return 'This conflicts with existing data.';
  if (status >= 500) return 'The server had a problem. Please try again later.';
  return 'Something went wrong. Please try again.';
}

// Builds "?a=1&b=2" from an object, skipping empty values
function toQueryString(params) {
  const parts = [];
  Object.keys(params || {}).forEach(function (key) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  });
  return parts.length ? '?' + parts.join('&') : '';
}

// Sends one HTTP request to the Spring Boot backend
async function http(method, path, body) {
  const options = { method: method, headers: {} };

  const token = Auth.getToken();
  if (token && !path.startsWith('/api/auth/') && !path.startsWith('/api/public/')) {
    options.headers['Authorization'] = 'Bearer ' + token; // JWT from login
  }

  if (body instanceof FormData) {
    options.body = body; // browser sets multipart/form-data automatically
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(CONFIG.API_BASE_URL + path, options);
  } catch (networkError) {
    throw new ApiError(0, 'Cannot reach the server at ' + CONFIG.API_BASE_URL +
      '. Check that the Spring Boot backend is running.');
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null; // response had no JSON body
  }

  if (!response.ok) {
    const message = data && data.message ? data.message : defaultErrorMessage(response.status);
    throw new ApiError(response.status, message);
  }
  return data;
}

const API = {

  /* ---------- Authentication ---------- */
  login(email, password, role) {
    return http('POST', '/api/auth/login', { email: email, password: password, role: role });
  },

  register(data) {
    return http('POST', '/api/auth/register', data);
  },

  getMe() {
    return http('GET', '/api/users/me');
  },

  getWorkers() {
    return http('GET', '/api/users?role=FIELD_WORKER');
  },

  /* ---------- Public pond information (no login needed) ---------- */
  getPublicPonds() {
    return http('GET', '/api/public/ponds');
  },

  getPublicPond(id) {
    return http('GET', '/api/public/ponds/' + id);
  },

  getPublicActivity() {
    return http('GET', '/api/public/activity');
  },

  getPublicHighlights() {
    return http('GET', '/api/public/highlights');
  },

  /* ---------- Pond management (Panchayat) ---------- */
  getPonds() {
    return http('GET', '/api/ponds');
  },

  createPond(data) {
    return http('POST', '/api/ponds', data);
  },

  updatePond(id, data) {
    return http('PUT', '/api/ponds/' + id, data);
  },

  // formData field: image
  uploadPondImage(id, formData) {
    return http('POST', '/api/ponds/' + id + '/image', formData);
  },

  removePondImage(id) {
    return http('DELETE', '/api/ponds/' + id + '/image');
  },

  /* ---------- Complaints / problems ---------- */
  // formData fields: pondId, category, description, landmark, latitude, longitude,
  // images (repeat the field once per photo, up to CONFIG.MAX_REPORT_PHOTOS)
  createProblem(formData) {
    return http('POST', '/api/problems', formData);
  },

  // Citizen adds a photo to their own complaint. formData fields: image, caption
  addProblemImage(id, formData) {
    return http('POST', '/api/problems/' + id + '/images', formData);
  },

  getMyProblems() {
    return http('GET', '/api/problems?mine=true');
  },

  // filters: { pondId, category, priority, status, overdue, search }
  getProblems(filters) {
    return http('GET', '/api/problems' + toQueryString(filters));
  },

  getProblem(id) {
    return http('GET', '/api/problems/' + id);
  },

  rejectProblem(id, reason) {
    return http('PUT', '/api/problems/' + id, { status: 'REJECTED', reason: reason });
  },

  /* ---------- Tasks (assignment and field work) ---------- */
  // data: { problemId, assignedWorkerId, deadline, priority, instructions }
  assignTask(data) {
    return http('POST', '/api/tasks', data);
  },

  getMyTasks() {
    return http('GET', '/api/tasks?mine=true');
  },

  startTask(taskId) {
    return http('PUT', '/api/tasks/' + taskId, { status: 'IN_PROGRESS' });
  },

  // formData fields: text, image (optional)
  addTaskNote(taskId, formData) {
    return http('POST', '/api/tasks/' + taskId + '/notes', formData);
  },

  // formData fields: beforeImage, afterImage, remarks
  submitCompletion(taskId, formData) {
    return http('POST', '/api/tasks/' + taskId + '/complete', formData);
  },

  /* ---------- Verification ---------- */
  // Panchayat review of submitted work. decision: FORWARD or RETURN
  reviewCompletion(taskId, decision, comment) {
    return http('POST', '/api/verifications', { taskId: taskId, decision: decision, comment: comment });
  },

  getPendingVerifications() {
    return http('GET', '/api/community-verifications/pending');
  },

  // formData fields: taskId, decision (CONFIRM or DISPUTE), comment, image (optional)
  submitCommunityVerification(formData) {
    return http('POST', '/api/community-verifications', formData);
  },

  /* ---------- Escalation ---------- */
  escalateTask(taskId, reason) {
    return http('POST', '/api/escalations', { taskId: taskId, reason: reason });
  },

  /* ---------- Dashboard ---------- */
  getDashboardSummary() {
    return http('GET', '/api/dashboard/summary');
  },

  getAnalytics() {
    return http('GET', '/api/dashboard/analytics');
  }
};
