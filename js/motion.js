/* =========================================================
   JALACHAYA - Motion and live updates
   ---------------------------------------------------------
   Motion
     - fades sections in as you scroll to them
     - counts numbers up (summary cards)
     - plays the "first load" animations once per page

   Live
     - refreshes a page's data every CONFIG.LIVE_REFRESH_SECONDS
     - refreshes INSTANTLY when another browser tab changes the
       demo data (try the citizen and Panchayat portals side by side)
     - keeps a small "Live - updated 12 s ago" label up to date

   Everything respects the system "reduce motion" setting.
   ========================================================= */

const Motion = {

  reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  init() {
    const root = document.documentElement;
    root.classList.add('motion-ready');

    // Entry animations (cards, rows, bars) only play during the first
    // few seconds, so live refreshes later do not replay them.
    if (!this.reduced) {
      root.classList.add('motion-intro');
      setTimeout(function () { root.classList.remove('motion-intro'); }, 3200);
    }

    this.setupReveal();
    if (typeof Sketches !== 'undefined') Sketches.mount();
  },

  // Elements with data-reveal (and the children of data-reveal-group)
  // fade up when they scroll into view.
  setupReveal() {
    const items = [];
    document.querySelectorAll('[data-reveal]').forEach(function (el) { items.push(el); });
    document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty('--reveal-delay', (i * 90) + 'ms');
        items.push(child);
      });
    });

    if (this.reduced || !('IntersectionObserver' in window)) return; // shown as normal

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) {
      el.classList.add('reveal');
      observer.observe(el);
    });

    // Safety net: if the page jumps (e.g. a link to #ponds), anything that is
    // now above or inside the screen is shown, so nothing stays invisible.
    if (!this._revealScroll) {
      this._revealScroll = true;
      let queued = false;
      window.addEventListener('scroll', function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          document.querySelectorAll('.reveal:not(.is-visible)').forEach(function (el) {
            if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible');
          });
        });
      }, { passive: true });
    }
  },

  // Home page: a column of dots on the right, one per full-screen
  // section (<section class="screen" data-screen="Title">). The dot of
  // the section on screen is filled; clicking a dot scrolls to it.
  sectionDots() {
    const sections = Array.prototype.filter.call(
      document.querySelectorAll('section.screen[data-screen]'),
      function (s) { return !s.classList.contains('hidden'); });
    if (sections.length < 2 || !('IntersectionObserver' in window)) return;

    const old = document.querySelector('.section-dots');
    if (old) old.remove();
    const nav = document.createElement('nav');
    nav.className = 'section-dots';
    nav.setAttribute('aria-label', 'Page sections');
    sections.forEach(function (section) {
      const dot = document.createElement('a');
      dot.href = '#' + section.id;
      dot.innerHTML = '<span>' + section.dataset.screen + '</span>';
      dot.setAttribute('aria-label', section.dataset.screen);
      nav.appendChild(dot);
    });
    document.body.appendChild(nav);
    const dots = nav.querySelectorAll('a');

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const i = sections.indexOf(entry.target);
        dots.forEach(function (d, j) { d.classList.toggle('active', i === j); });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });   // the section in the middle of the screen
    sections.forEach(function (s) { observer.observe(s); });
  },

  // Animates the number shown in an element, e.g. 0 -> 12
  countTo(el, value) {
    if (!el) return;
    const target = Number(value) || 0;
    const start = parseInt(el.textContent, 10);
    const from = isNaN(start) ? 0 : start;
    if (this.reduced || from === target) {
      el.textContent = target;
      return;
    }
    const duration = 700;
    const began = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
};

const Live = {
  lastUpdated: null,

  /* refresh  - async function that reloads the page's data
     options  - { statusId: id of the element showing "Live - updated ..." } */
  start(refresh, options) {
    const self = this;
    const statusEl = options && options.statusId ? document.getElementById(options.statusId) : null;
    let running = false;

    async function run() {
      if (running) return;
      running = true;
      try {
        await refresh();
        self.lastUpdated = Date.now();
        self.paint(statusEl, true);
      } catch (e) {
        console.warn('Live refresh failed:', e.message);
      } finally {
        running = false;
      }
    }

    this.lastUpdated = Date.now();
    this.paint(statusEl, false);

    // 1. Regular refresh while the tab is visible
    setInterval(function () {
      if (document.visibilityState === 'visible') run();
    }, CONFIG.LIVE_REFRESH_SECONDS * 1000);

    // 2. Instant refresh when another tab changes the demo data
    window.addEventListener('storage', function (event) {
      if (typeof DB_KEY !== 'undefined' && event.key === DB_KEY) run();
    });

    // 3. Refresh when the user comes back to this tab
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') run();
    });

    // Keep the "updated 12 s ago" text ticking
    setInterval(function () { self.paint(statusEl, false); }, 5000);
  },

  paint(el, justUpdated) {
    if (!el) return;
    el.innerHTML = '<span class="live-dot"></span>Live &middot; updated ' + UI.timeAgo(this.lastUpdated);
    if (justUpdated) {
      el.classList.remove('flash');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('flash');
    }
  },

  /* Remembers which ids a list showed last time and returns the ones
     that are new. Used to highlight and announce new items. */
  diff(key, ids) {
    const store = this._seen || (this._seen = {});
    const previous = store[key];
    store[key] = ids.slice();
    if (!previous) return [];          // first load: nothing is "new"
    return ids.filter(function (id) { return previous.indexOf(id) === -1; });
  }
};
