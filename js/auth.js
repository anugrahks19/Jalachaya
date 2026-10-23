/* =========================================================
   JALACHAYA - Login session handling
   ---------------------------------------------------------
   After login the backend returns { token, role, userId, name }.
   We keep it in sessionStorage (per tab) and localStorage, and send
   the token with every API request (see http() in api.js).

   IMPORTANT: hiding pages in the browser is only for convenience.
   The Spring Boot backend must check the JWT and role on every
   request - the frontend check can always be bypassed.
   ========================================================= */

const SESSION_KEY = 'jalachaya_session';

const Auth = {

  /* Each browser tab keeps its own login (sessionStorage), so you can be
     a citizen in one tab and the Panchayat officer in another - handy for
     showing live updates side by side. The last login is also kept in
     localStorage so a newly opened tab starts logged in. */
  save(session) {
    const text = JSON.stringify(session);
    sessionStorage.setItem(SESSION_KEY, text);
    localStorage.setItem(SESSION_KEY, text);
  },

  getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  },

  getToken() {
    const session = this.getSession();
    return session ? session.token : null;
  },

  isLoggedIn() {
    return this.getSession() !== null;
  },

  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  },

  // Pages inside citizen/, panchayat/ and worker/ set data-root="../" on <body>
  rootPath() {
    return document.body.dataset.root || '';
  },

  homeFor(role) {
    return this.rootPath() + (ROLE_HOME[role] || 'index.html');
  },

  // Current page path relative to the project root, e.g. "citizen/report.html?pond=2"
  currentPagePath() {
    const parts = window.location.pathname.split('/');
    const depth = this.rootPath() ? 2 : 1;
    return parts.slice(-depth).join('/') + window.location.search;
  },

  /* Call at the top of every dashboard page script.
     Returns the session, or null if the user is being redirected. */
  requireRole(role) {
    const session = this.getSession();
    if (!session) {
      window.location.replace(this.rootPath() + 'login.html?next=' + encodeURIComponent(this.currentPagePath()));
      return null;
    }
    if (session.role !== role) {
      // Logged in, but this page belongs to another role
      window.location.replace(this.homeFor(session.role));
      return null;
    }
    return session;
  }
};
