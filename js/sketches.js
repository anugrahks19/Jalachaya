/* =========================================================
   JALACHAYA - Live sketches
   ---------------------------------------------------------
   Any element like  <div class="sketch-slot" data-sketch="kulam">  is
   replaced with an inline, animated line drawing:
     1. the drawing "sketches itself" stroke by stroke when it scrolls
        into view (stroke-dashoffset animation, see motion.css), then
     2. it stays alive: birds fly past, clouds drift, the palm sways,
        ripples spread on the water and the lotus moves.

   Drawings: kulam (temple pond), office (Panchayat office), village,
   boat (field worker), phone (report), heron (register), strip (pond
   edge along the bottom of pages), lotus (sidebar) and three small
   icons (record, deadline, verified). Each is plain SVG built from
   strings, so it is easy to read and change.

   The slot can contain a plain <img> of the same drawing; it is shown
   if JavaScript is off. All animations stop for people who turn on
   "reduce motion" in their system settings.
   ========================================================= */

const Sketches = (function () {
  let counter = 0;

  // Stepped temple pond (kulam). viewBox 480 x 330.
  // data-step on a group = order in which it is drawn.
  function kulam(uid) {
    return '' +
'<svg class="sketch" viewBox="0 0 480 330" fill="none" stroke="#2f5b3e" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Line drawing of a stepped village pond with a temple and coconut palm">' +
'  <defs><clipPath id="water-' + uid + '"><rect x="58" y="244" width="364" height="50"/></clipPath></defs>' +

   // --- sky: sun, drifting clouds, birds (not drawn in, they just move) ---
'  <g data-step="0">' +
'    <circle class="sk-halo no-draw" cx="252" cy="78" r="30" stroke="#dfe7d7" stroke-width="2"/>' +
'    <circle cx="252" cy="78" r="22" stroke="#8ea888" stroke-width="2"/>' +
'  </g>' +
'  <g class="sk-cloud" style="--y:38px; --dur:58s; --delay:-12s">' +
'    <path class="no-draw" d="M0 14 q2 -10 13 -9 q5 -9 16 -5 q10 -3 13 7 q8 0 8 7 Z" stroke="#8ea888" stroke-width="1.6" fill="#fffdf8"/>' +
'  </g>' +
'  <g class="sk-cloud" style="--y:62px; --dur:74s; --delay:-48s">' +
'    <path class="no-draw" d="M0 10 q2 -8 10 -7 q4 -7 12 -4 q8 -2 10 5 q6 0 6 6 Z" stroke="#8ea888" stroke-width="1.4" fill="#fffdf8"/>' +
'  </g>' +
'  <g class="sk-bird" style="--y:52px; --dur:19s; --delay:2s">' +
'    <g class="sk-bob"><path class="sk-wing no-draw" d="M0 0 q5 -5 10 0 q5 -5 10 0" stroke-width="1.6"/></g>' +
'  </g>' +
'  <g class="sk-bird" style="--y:70px; --dur:23s; --delay:4.5s">' +
'    <g class="sk-bob"><path class="sk-wing no-draw" d="M0 0 q4 -4 8 0 q4 -4 8 0" stroke-width="1.4"/></g>' +
'  </g>' +

   // --- coconut palm (fronds sway around the top of the trunk) ---
'  <g data-step="1">' +
'    <path d="M80 200 C 86 160, 88 130, 98 96" stroke-width="4"/>' +
'    <g class="sk-palm">' +
'      <path d="M98 96 C 72 80, 52 86, 38 104" stroke-width="3"/>' +
'      <path d="M98 96 C 78 70, 58 64, 44 66" stroke-width="3"/>' +
'      <path d="M98 96 C 106 66, 122 56, 142 58" stroke-width="3"/>' +
'      <path d="M98 96 C 124 84, 142 92, 152 110" stroke-width="3"/>' +
'      <path d="M98 96 C 98 72, 90 56, 80 48" stroke-width="3"/>' +
'      <circle cx="100" cy="102" r="3" fill="#2f5b3e" stroke="none" class="no-draw sk-late"/>' +
'      <circle cx="94" cy="104" r="3" fill="#2f5b3e" stroke="none" class="no-draw sk-late"/>' +
'    </g>' +
'  </g>' +

   // --- bushes and temple ---
'  <g data-step="2">' +
'    <path class="sk-bush" d="M150 190 q 15 -18 30 0 q 15 -22 32 0 q 14 -16 28 0 q 12 -14 24 0" stroke="#8ea888" stroke-width="2.5"/>' +
'    <path d="M316 164 L340 140 L390 140 L414 164 Z" fill="#dfe7d7" stroke-width="2.5"/>' +
'    <path d="M346 140 L365 120 L384 140" fill="#dfe7d7" stroke-width="2.5"/>' +
'    <path d="M365 120 V 110" stroke-width="2"/>' +
'    <rect x="332" y="164" width="66" height="26" fill="#fffdf8" stroke-width="2.5"/>' +
'    <rect x="358" y="172" width="14" height="18" stroke-width="2"/>' +
'    <path class="sk-flame no-draw" d="M365 187 q -3.5 -4 0 -9 q 3.5 5 0 9 Z" fill="#c8963e" stroke="none"/>' +
'  </g>' +

   // --- bank and stone steps ---
'  <g data-step="3">' +
'    <path d="M10 200 H 470" stroke-width="2.5"/>' +
'    <path d="M20 200 H460 L448 214 H32 Z" fill="#eef2e8" stroke-width="2"/>' +
'    <path d="M32 214 H448 L436 228 H44 Z" fill="#eef2e8" stroke-width="2"/>' +
'    <path d="M44 228 H436 L424 242 H56 Z" fill="#eef2e8" stroke-width="2"/>' +
'  </g>' +

   // --- water with moving ripples, spreading rings, lily pads, lotus ---
'  <g data-step="4">' +
'    <path d="M56 242 H424 V296 H56 Z" fill="#dfe7d7" stroke-width="2"/>' +
'  </g>' +
'  <g clip-path="url(#water-' + uid + ')">' +
'    <ellipse class="sk-ring no-draw" cx="150" cy="270" rx="16" ry="4.5" stroke="#8ea888" stroke-width="1.5" style="--delay:3s"/>' +
'    <ellipse class="sk-ring no-draw" cx="380" cy="280" rx="14" ry="4" stroke="#8ea888" stroke-width="1.5" style="--delay:5.2s"/>' +
'    <ellipse class="sk-ring no-draw" cx="250" cy="284" rx="12" ry="3.5" stroke="#8ea888" stroke-width="1.5" style="--delay:7.1s"/>' +
'  </g>' +
'  <g data-step="5">' +
'    <g class="sk-waves">' +
'      <path d="M84 258 q 10 -5 20 0 q 10 5 20 0" stroke="#8ea888" stroke-width="2"/>' +
'      <path d="M170 276 q 10 -5 20 0 q 10 5 20 0 q 10 -5 20 0" stroke="#8ea888" stroke-width="2"/>' +
'      <path d="M360 260 q 10 -5 20 0 q 10 5 20 0" stroke="#8ea888" stroke-width="2"/>' +
'    </g>' +
'    <g class="sk-waves sk-waves-alt">' +
'      <path d="M110 286 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/>' +
'      <path d="M300 266 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/>' +
'    </g>' +
'    <g class="sk-pad"><ellipse cx="282" cy="286" rx="18" ry="6" fill="#8ea888" stroke-width="1.5"/></g>' +
'    <g class="sk-pad sk-pad-2"><ellipse cx="342" cy="280" rx="14" ry="5" fill="#8ea888" stroke-width="1.5"/></g>' +
'    <g class="sk-pad sk-pad-3"><ellipse cx="236" cy="262" rx="11" ry="4" fill="#8ea888" stroke-width="1.5"/></g>' +
'    <g class="sk-lotus">' +
'      <path d="M310 274 C 303 264, 305 254, 310 246 C 315 254, 317 264, 310 274 Z" fill="#ecd3cf" stroke-width="2"/>' +
'      <path d="M310 274 C 298 270, 293 262, 292 254 C 302 256, 308 264, 310 274 Z" fill="#ecd3cf" stroke-width="2"/>' +
'      <path d="M310 274 C 322 270, 327 262, 328 254 C 318 256, 312 264, 310 274 Z" fill="#ecd3cf" stroke-width="2"/>' +
'    </g>' +
'  </g>' +

   // --- front steps ---
'  <g data-step="6">' +
'    <path d="M40 296 H440" stroke-width="2"/>' +
'    <path d="M26 308 H454" stroke-width="2"/>' +
'    <path d="M12 320 H468" stroke-width="2"/>' +
'  </g>' +
'</svg>';
  }

  /* ---------------------------------------------------------
     Shared pieces used by the smaller drawings below
     --------------------------------------------------------- */
  const INK = '#2f5b3e';

  function svgStart(viewBox, label, extra) {
    return '<svg class="sketch" viewBox="' + viewBox + '" fill="none" stroke="' + INK + '" ' +
      'stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + label + '" ' + (extra || '') + '>';
  }

  // sun with a pulsing glow
  function sun(cx, cy, r) {
    return '<g data-step="0">' +
      '<circle class="sk-halo no-draw" cx="' + cx + '" cy="' + cy + '" r="' + (r + 6) + '" stroke="#dfe7d7" stroke-width="2"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="#8ea888" stroke-width="2"/></g>';
  }

  // a cloud that drifts across (y = height in the sky)
  function cloud(y, dur, delay, small) {
    const d = small
      ? 'M0 10 q2 -8 10 -7 q4 -7 12 -4 q8 -2 10 5 q6 0 6 6 Z'
      : 'M0 14 q2 -10 13 -9 q5 -9 16 -5 q10 -3 13 7 q8 0 8 7 Z';
    return '<g class="sk-cloud" style="--y:' + y + 'px; --dur:' + dur + 's; --delay:' + delay + 's">' +
      '<path class="no-draw" d="' + d + '" stroke="#8ea888" stroke-width="1.5" fill="#fffdf8"/></g>';
  }

  // a bird that flies past, flapping
  function bird(y, dur, delay) {
    return '<g class="sk-bird" style="--y:' + y + 'px; --dur:' + dur + 's; --delay:' + delay + 's">' +
      '<g class="sk-bob"><path class="sk-wing no-draw" d="M0 0 q4 -4 8 0 q4 -4 8 0" stroke-width="1.5"/></g></g>';
  }

  // a ring that spreads on the water
  function ring(cx, cy, rx, delay) {
    return '<ellipse class="sk-ring no-draw" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + (rx / 3.4).toFixed(1) +
      '" stroke="#8ea888" stroke-width="1.4" style="--delay:' + delay + 's"/>';
  }

  // three-petal lotus whose base is at (x, y); size 1 = kulam lotus
  function lotus(x, y, size) {
    const k = size || 1;
    function p(dx, dy) { return (x + dx * k).toFixed(1) + ' ' + (y + dy * k).toFixed(1); }
    return '<g class="sk-lotus">' +
      '<path d="M' + p(0, 0) + ' C ' + p(-7, -10) + ', ' + p(-5, -20) + ', ' + p(0, -28) + ' C ' + p(5, -20) + ', ' + p(7, -10) + ', ' + p(0, 0) + ' Z" fill="#ecd3cf" stroke-width="1.8"/>' +
      '<path d="M' + p(0, 0) + ' C ' + p(-12, -4) + ', ' + p(-17, -12) + ', ' + p(-18, -20) + ' C ' + p(-8, -18) + ', ' + p(-2, -10) + ', ' + p(0, 0) + ' Z" fill="#ecd3cf" stroke-width="1.8"/>' +
      '<path d="M' + p(0, 0) + ' C ' + p(12, -4) + ', ' + p(17, -12) + ', ' + p(18, -20) + ' C ' + p(8, -18) + ', ' + p(2, -10) + ', ' + p(0, 0) + ' Z" fill="#ecd3cf" stroke-width="1.8"/>' +
      '</g>';
  }

  // a clump of reeds swaying from its base (x, y); h = height
  function reeds(x, y, h, cattail) {
    const t = y - h;
    return '<g class="sk-sway" style="transform-origin:' + x + 'px ' + y + 'px; --a:2.5deg; --dur:' + (3.6 + (x % 7) / 5).toFixed(1) + 's">' +
      '<path d="M' + x + ' ' + y + ' C ' + (x - 3) + ' ' + (y - h * 0.4) + ', ' + (x + 3) + ' ' + (y - h * 0.7) + ', ' + (x - 2) + ' ' + t + '" stroke-width="2"/>' +
      '<path d="M' + (x + 5) + ' ' + y + ' C ' + (x + 8) + ' ' + (y - h * 0.35) + ', ' + (x + 14) + ' ' + (y - h * 0.6) + ', ' + (x + 24) + ' ' + (y - h * 0.8) + '" stroke-width="2"/>' +
      '<path d="M' + (x - 5) + ' ' + y + ' C ' + (x - 9) + ' ' + (y - h * 0.3) + ', ' + (x - 15) + ' ' + (y - h * 0.5) + ', ' + (x - 24) + ' ' + (y - h * 0.62) + '" stroke-width="2"/>' +
      (cattail ? '<ellipse cx="' + (x - 1.5) + '" cy="' + (t + 9) + '" rx="3.2" ry="8" fill="' + INK + '" stroke-width="1"/>' : '') +
      '</g>';
  }

  // a fish that jumps out of the water now and then
  function fish(x0, y0, dx, h, delay, dur) {
    return '<g class="sk-jump" style="--x0:' + x0 + 'px; --y0:' + y0 + 'px; --dx:' + dx + 'px; --h:' + h + 'px; --delay:' + delay + 's; --dur:' + dur + 's">' +
      '<path class="no-draw" d="M-9 0 C -4 -5, 5 -5, 9 0 C 5 5, -4 5, -9 0 Z M-9 0 L-15 -5 L-15 5 Z" fill="#8ea888" stroke-width="1.4"/></g>';
  }

  // walking villager; feet on the ground line
  function walker(ground, from, to, dur, delay) {
    return '<g class="sk-walker" style="--y:' + ground + 'px; --from:' + from + 'px; --to:' + to + 'px; --dur:' + dur + 's; --delay:' + delay + 's">' +
      '<g class="sk-step">' +
      '<circle class="no-draw" cx="0" cy="-24" r="4" fill="#fffdf8" stroke-width="1.8"/>' +
      '<path class="no-draw" d="M0 -20 V -10" stroke-width="2"/>' +
      '<path class="no-draw sk-arm" d="M0 -17 L -4 -11 M0 -17 L4 -11" stroke-width="1.6"/>' +
      '<path class="no-draw sk-leg sk-leg-a" d="M0 -10 L -3 0" stroke-width="2"/>' +
      '<path class="no-draw sk-leg sk-leg-b" d="M0 -10 L 3 0" stroke-width="2"/>' +
      '</g></g>';
  }

  /* ---------------------------------------------------------
     Panchayat office: flag waves, villager walks in to the door
     --------------------------------------------------------- */
  function office() {
    return svgStart('0 0 360 150', 'Line drawing of the Panchayat office with a flag and a tree') +
      sun(64, 32, 11) + cloud(16, 46, -18) + cloud(40, 62, -40, true) + bird(30, 16, 1.5) +
      '<g data-step="1">' +
      '  <path d="M40 128 V 98" stroke-width="3"/>' +
      '  <g class="sk-sway" style="transform-origin:40px 100px; --a:2deg; --dur:5s">' +
      '    <path d="M40 100 c -22 2 -30 -18 -16 -30 c 0 -16 26 -20 32 -6 c 16 -2 20 18 6 26 c -4 10 -16 12 -22 10 Z" fill="#dfe7d7" stroke-width="2.2"/>' +
      '  </g>' +
      '  <path d="M74 128 q 8 -14 18 0 q 8 -12 16 0" stroke="#8ea888" stroke-width="2"/>' +
      '</g>' +
      '<g data-step="2">' +
      '  <path d="M112 72 L195 40 L278 72 Z" fill="#dfe7d7" stroke-width="2.4"/>' +
      '  <rect x="122" y="72" width="146" height="56" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <rect x="173" y="54" width="44" height="12" fill="#fffdf8" stroke-width="1.6"/>' +
      '  <path d="M181 60 H 209" stroke-width="1.4"/>' +
      '  <path d="M140 80 V 128 M160 80 V 128 M230 80 V 128 M250 80 V 128" stroke-width="2"/>' +
      '  <rect x="184" y="92" width="22" height="36" stroke-width="2"/>' +
      '</g>' +
      '<g data-step="3">' +
      '  <path d="M8 128 H 352" stroke-width="2.4"/>' +
      '  <path d="M176 134 H 214" stroke-width="1.8"/>' +
      '  <path d="M302 128 V 26" stroke-width="2.4"/>' +
      '  <g class="sk-flag" style="transform-origin:302px 28px">' +
      '    <path d="M302 28 q 13 -6 26 0 v 15 q -13 -6 -26 0 Z" fill="#8ea888" stroke-width="1.8"/>' +
      '  </g>' +
      '</g>' +
      walker(128, -12, 192, 15, 2.5) +
      '</svg>';
  }

  /* ---------------------------------------------------------
     Village: smoke from the hut, palm sways, a citizen photographs
     the pond (the phone flashes), ripples and a lotus on the pond
     --------------------------------------------------------- */
  function village(uid) {
    return svgStart('0 0 360 150', 'Line drawing of a village house, a palm tree and a pond, with a resident taking a photo') +
      '<defs><clipPath id="vp-' + uid + '"><path d="M196 130 C 220 118, 330 118, 352 130 C 330 144, 220 144, 196 130 Z"/></clipPath></defs>' +
      sun(306, 30, 11) + cloud(14, 52, -10) + cloud(38, 70, -44, true) + bird(26, 18, 3) +
      '<g data-step="1">' +
      '  <path d="M28 86 L68 56 L108 86 Z" fill="#dfe7d7" stroke-width="2.4"/>' +
      '  <rect x="38" y="86" width="60" height="36" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <rect x="60" y="100" width="16" height="22" stroke-width="2"/>' +
      '  <rect x="82" y="94" width="10" height="10" stroke-width="1.8"/>' +
      '</g>' +
      '<g class="sk-puff no-draw" style="--delay:0s"><circle cx="90" cy="68" r="3.5" stroke="#8ea888" stroke-width="1.4" fill="#fffdf8"/></g>' +
      '<g class="sk-puff no-draw" style="--delay:1.3s"><circle cx="90" cy="68" r="4.5" stroke="#8ea888" stroke-width="1.4" fill="#fffdf8"/></g>' +
      '<g class="sk-puff no-draw" style="--delay:2.6s"><circle cx="90" cy="68" r="3" stroke="#8ea888" stroke-width="1.4" fill="#fffdf8"/></g>' +
      '<g data-step="2">' +
      '  <path d="M132 122 C 136 100, 134 84, 142 64" stroke-width="3"/>' +
      '  <g class="sk-sway" style="transform-origin:142px 64px; --a:3deg; --dur:4.4s">' +
      '    <path d="M142 64 C 124 54, 112 58, 104 70" stroke-width="2.4"/>' +
      '    <path d="M142 64 C 128 46, 114 44, 106 46" stroke-width="2.4"/>' +
      '    <path d="M142 64 C 150 44, 162 40, 176 44" stroke-width="2.4"/>' +
      '    <path d="M142 64 C 160 56, 172 62, 178 76" stroke-width="2.4"/>' +
      '    <path d="M142 64 C 142 50, 136 40, 128 36" stroke-width="2.4"/>' +
      '  </g>' +
      '</g>' +
      '<g data-step="3">' +
      '  <path d="M8 122 H 190 C 198 122, 202 126, 206 128" stroke-width="2.4"/>' +
      '  <path d="M196 130 C 220 118, 330 118, 352 130 C 330 144, 220 144, 196 130 Z" fill="#dfe7d7" stroke-width="2"/>' +
      '</g>' +
      '<g clip-path="url(#vp-' + uid + ')">' + ring(236, 132, 9, 2.6) + ring(320, 129, 8, 4.4) + '</g>' +
      '<g data-step="4">' +
      '  <g class="sk-waves"><path d="M222 136 q 6 -3 12 0 q 6 3 12 0" stroke="#8ea888" stroke-width="1.6"/><path d="M296 124 q 6 -3 12 0" stroke="#8ea888" stroke-width="1.6"/></g>' +
      '  <g class="sk-pad"><ellipse cx="300" cy="134" rx="10" ry="3.5" fill="#8ea888" stroke-width="1.4"/></g>' +
      lotus(274, 132, 0.62) +
      '</g>' +
      '<g data-step="5">' +
      '  <circle cx="176" cy="92" r="5" fill="#fffdf8" stroke-width="2"/>' +
      '  <path d="M176 97 V 110 M176 110 L172 122 M176 110 L180 122" stroke-width="2"/>' +
      '  <path d="M176 101 L186 98 M176 101 L170 108" stroke-width="1.8"/>' +
      '  <rect x="186" y="92" width="5" height="9" rx="1" fill="#fffdf8" stroke-width="1.6"/>' +
      '</g>' +
      '<path class="sk-flash no-draw" d="M195 90 l5 -4 M197 96 h7 M195 102 l5 4" stroke="#c8963e" stroke-width="1.8"/>' +
      '</svg>';
  }

  /* ---------------------------------------------------------
     Field worker in a boat, scooping floating waste
     --------------------------------------------------------- */
  function boat() {
    function debris(y, dur, delay, can) {
      const shape = can
        ? '<rect class="no-draw" x="0" y="-5" width="7" height="6" rx="1" fill="#fffdf8" stroke-width="1.4"/>'
        : '<path class="no-draw" d="M0 -4 h10 a2 2 0 0 1 0 4 h-10 a2 2 0 0 1 0 -4 Z M10 -3 h3 v2 h-3" fill="#fffdf8" stroke-width="1.4"/>';
      return '<g class="sk-debris" style="--y:' + y + 'px; --dur:' + dur + 's; --delay:' + delay + 's"><g class="sk-bob">' + shape + '</g></g>';
    }
    return svgStart('0 0 360 150', 'Line drawing of a field worker in a small boat collecting waste from a pond') +
      sun(48, 30, 11) + cloud(14, 50, -26) + bird(34, 17, 4) +
      '<g data-step="1">' +
      '  <path d="M0 92 C 60 84, 120 96, 180 90 C 240 84, 300 94, 360 88" stroke="#8ea888" stroke-width="2"/>' +
      '  <path d="M-5 104 H 365 V 156 H -5 Z" fill="#dfe7d7" stroke-width="2"/>' +
      '</g>' +
      '<g data-step="2">' + reeds(22, 112, 46, true) + reeds(334, 116, 40, false) +
      '  <g class="sk-waves"><path d="M70 122 q 8 -4 16 0 q 8 4 16 0" stroke="#8ea888" stroke-width="1.8"/><path d="M262 134 q 8 -4 16 0 q 8 4 16 0" stroke="#8ea888" stroke-width="1.8"/></g>' +
      '  <g class="sk-waves sk-waves-alt"><path d="M110 142 q 8 -4 16 0" stroke="#8ea888" stroke-width="1.8"/><path d="M300 116 q 8 -4 16 0" stroke="#8ea888" stroke-width="1.8"/></g>' +
      '</g>' +
      debris(112, 11, 1, false) + debris(126, 14, 6, true) + debris(118, 12, 10.5, false) +
      '<g class="sk-boat" style="transform-origin:186px 110px">' +
      '<g data-step="3">' +
      '  <circle cx="170" cy="64" r="6" fill="#fffdf8" stroke-width="2"/>' +
      '  <path d="M159 62 Q 170 49, 181 62 Z" fill="#dfe7d7" stroke-width="1.8"/>' +
      '  <path d="M170 70 V 100 M170 78 L 186 86 M170 80 L 184 92" stroke-width="2"/>' +
      '  <g class="sk-rake" style="transform-origin:186px 86px">' +
      '    <path d="M154 52 L 236 134" stroke-width="2.4"/>' +
      '    <path d="M230 128 q 8 7 15 0 l -3 9 q -5 4 -10 0 Z" fill="#8ea888" stroke-width="1.6"/>' +
      '  </g>' +
      '  <path d="M204 100 C 202 88, 212 84, 216 90 C 222 86, 230 92, 226 100 Z" fill="#8ea888" stroke-width="1.8"/>' +
      '  <path d="M126 100 H 246 L 230 118 H 142 Z" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <path d="M134 106 H 238" stroke-width="1.4"/>' +
      '</g></g>' +
      '</svg>';
  }

  /* ---------------------------------------------------------
     Phone photographing a bottle in the water (report page)
     --------------------------------------------------------- */
  function phone(uid) {
    return svgStart('0 0 360 150', 'Line drawing of a phone taking a photo of plastic waste in a pond') +
      '<defs><clipPath id="ps-' + uid + '"><rect x="218" y="26" width="62" height="92" rx="3"/></clipPath></defs>' +
      cloud(10, 48, -14, true) + bird(22, 15, 2) +
      '<g data-step="0">' +
      '  <path d="M-5 156 V 104 C 60 98, 140 108, 230 102 C 290 98, 330 106, 365 102 V 156" fill="#dfe7d7" stroke-width="2"/>' +
      reeds(24, 108, 50, true) +
      '  <g class="sk-waves"><path d="M60 124 q 8 -4 16 0 q 8 4 16 0" stroke="#8ea888" stroke-width="1.8"/><path d="M120 138 q 8 -4 16 0" stroke="#8ea888" stroke-width="1.8"/></g>' +
      '</g>' +
      '<g class="sk-bob" style="--bob:2s"><g data-step="1">' +
      '  <path d="M84 108 h20 a3 3 0 0 1 0 6 h-20 a3 3 0 0 1 0 -6 Z M104 109 h5 v4 h-5" fill="#fffdf8" stroke-width="1.8"/>' +
      '  <path d="M128 110 c 4 -6 12 -6 14 0 c -2 4 -12 4 -14 0 Z" fill="#fffdf8" stroke-width="1.6"/>' +
      '</g></g>' +
      ring(96, 116, 12, 3) +
      '<path class="sk-march no-draw" d="M120 92 C 150 56, 182 52, 208 62" stroke="#8ea888" stroke-width="1.8"/>' +
      '<g data-step="2">' +
      '  <rect x="210" y="12" width="78" height="128" rx="10" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <rect x="218" y="26" width="62" height="92" rx="3" fill="#dfe7d7" stroke-width="1.6"/>' +
      '  <path d="M240 19 H 258" stroke-width="2"/>' +
      '  <circle cx="249" cy="129" r="4.5" stroke-width="1.8"/>' +
      '</g>' +
      '<g clip-path="url(#ps-' + uid + ')"><g data-step="3">' +
      '  <path d="M218 84 C 236 78, 262 90, 282 82 V 120 H 216 Z" fill="#8ea888" stroke-width="1.4"/>' +
      '  <path d="M240 92 h12 a2 2 0 0 1 0 4 h-12 a2 2 0 0 1 0 -4 Z" fill="#fffdf8" stroke-width="1.3"/>' +
      '  <path d="M232 52 q 6 -6 12 0 q 6 -6 12 0" stroke-width="1.3"/>' +
      '</g>' +
      '<rect class="sk-shutter no-draw" x="218" y="26" width="62" height="92" fill="#ffffff" stroke="none"/></g>' +
      '<g class="sk-focus no-draw" style="transform-origin:249px 92px">' +
      '  <path d="M232 80 v-6 h6 M260 74 h6 v6 M232 104 v6 h6 M266 104 v6 h-6" stroke-width="1.8"/>' +
      '</g>' +
      '<g class="sk-sent no-draw" style="transform-origin:288px 18px">' +
      '  <circle cx="288" cy="18" r="10" fill="' + INK + '" stroke="none"/>' +
      '  <path d="M283 18 l3.5 3.5 l6.5 -7" stroke="#fff" stroke-width="2"/>' +
      '</g>' +
      '</svg>';
  }

  /* ---------------------------------------------------------
     Heron standing in the pond; dips for fish now and then
     --------------------------------------------------------- */
  function heron(uid) {
    return svgStart('0 0 480 330', 'Line drawing of a heron standing in a pond with reeds and a lotus') +
      '<defs><clipPath id="hw-' + uid + '"><rect x="10" y="214" width="460" height="86"/></clipPath></defs>' +
      sun(380, 70, 22) + cloud(40, 60, -20) + cloud(80, 76, -50, true) + bird(56, 20, 2) + bird(74, 24, 6) +
      '<g data-step="1">' +
      '  <path d="M10 200 C 90 188, 170 204, 250 196 C 330 188, 400 202, 470 194" stroke="#8ea888" stroke-width="2.4"/>' +
      '  <path d="M108 196 q 14 -24 30 -4 q 14 -20 28 2" stroke="#8ea888" stroke-width="2.2"/>' +
      '  <path d="M300 192 q 12 -18 24 -2 q 10 -14 20 2" stroke="#8ea888" stroke-width="2.2"/>' +
      '</g>' +
      '<g data-step="2"><path d="M0 214 H 480 V 300 H 0 Z" fill="#dfe7d7" stroke="none"/><path d="M0 214 C 120 210, 240 218, 480 213" stroke-width="2"/></g>' +
      '<g clip-path="url(#hw-' + uid + ')">' + ring(226, 254, 15, 2.8) + ring(252, 254, 13, 3.9) + ring(394, 264, 14, 6) + '</g>' +
      '<g data-step="3">' + reeds(50, 296, 90, true) + reeds(434, 296, 86, true) +
      '  <g class="sk-waves"><path d="M80 240 q 10 -5 20 0 q 10 5 20 0" stroke="#8ea888" stroke-width="2"/><path d="M320 236 q 10 -5 20 0 q 10 5 20 0 q 10 -5 20 0" stroke="#8ea888" stroke-width="2"/></g>' +
      '  <g class="sk-waves sk-waves-alt"><path d="M300 286 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/><path d="M200 280 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/></g>' +
      '</g>' +
      fish(372, 262, 46, 40, 4, 7.5) +
      '<g data-step="4">' +
      '  <path d="M228 188 L 224 254 M244 188 L 250 254" stroke-width="2.6"/>' +
      '  <path d="M196 172 L 174 184 L 198 184" fill="#fffdf8" stroke-width="2"/>' +
      '  <path d="M196 172 C 206 150, 254 144, 274 160 C 282 168, 278 182, 262 188 C 240 194, 210 190, 196 172 Z" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <path d="M212 168 C 230 158, 252 158, 266 170" stroke-width="2"/>' +
      '  <g class="sk-dip" style="transform-origin:270px 162px">' +
      '    <path d="M268 160 C 284 140, 266 126, 280 108 C 286 100, 296 98, 302 102" stroke-width="3"/>' +
      '    <path d="M296 99 L 280 92" stroke-width="2"/>' +
      '    <circle cx="302" cy="104" r="7" fill="#fffdf8" stroke-width="2.4"/>' +
      '    <path d="M308 101 L 336 108 L 308 109 Z" fill="#c8963e" stroke-width="1.8"/>' +
      '    <circle class="no-draw sk-late" cx="304" cy="102" r="1.6" fill="' + INK + '" stroke="none"/>' +
      '  </g>' +
      '</g>' +
      '<g data-step="5">' +
      '  <g class="sk-pad"><ellipse cx="112" cy="282" rx="18" ry="6" fill="#8ea888" stroke-width="1.5"/></g>' +
      '  <g class="sk-pad sk-pad-2"><ellipse cx="164" cy="270" rx="13" ry="4.5" fill="#8ea888" stroke-width="1.5"/></g>' +
      lotus(140, 276, 1) +
      '</g>' +
      '<g class="sk-dragonfly no-draw">' +
      '  <path d="M-8 0 H 8" stroke-width="1.8"/>' +
      '  <g class="sk-buzz"><path d="M-1 0 C -4 -8, 2 -8, 1 0 M-1 0 C -4 8, 2 8, 1 0" stroke="#8ea888" stroke-width="1.2" fill="#fffdf8"/></g>' +
      '</g>' +
      '<g data-step="6">' +
      '  <path d="M0 300 H 480" stroke-width="2"/>' +
      '  <path d="M30 300 l4 -10 l3 10 l4 -12 l3 12 M440 300 l3 -9 l3 9 l4 -11 l3 11" stroke-width="1.8"/>' +
      '</g>' +
      '</svg>';
  }

  /* ---------------------------------------------------------
     Wide water strip along the bottom of a page: reeds sway,
     a duck paddles across, a fish jumps, lotus and ripples
     --------------------------------------------------------- */
  function strip(uid, width) {
    width = width || 1200;
    const x = function (value) { return value * width / 1200; };
    return svgStart('0 0 ' + width + ' 100', 'Pond edge with reeds, lotus flowers and a duck', 'preserveAspectRatio="xMidYMax meet"') +
      '<defs><clipPath id="sw-' + uid + '"><rect x="0" y="48" width="' + width + '" height="52"/></clipPath></defs>' +
      '<g data-step="0" transform="scale(' + (width / 1200) + ' 1)"><path d="M-10 46 C 100 40, 200 52, 300 46 C 400 40, 500 52, 600 46 C 700 40, 800 52, 900 46 C 1000 40, 1100 52, 1210 46 V 110 H -10 Z" fill="#dfe7d7" stroke="none"/>' +
      '<path d="M-10 46 C 100 40, 200 52, 300 46 C 400 40, 500 52, 600 46 C 700 40, 800 52, 900 46 C 1000 40, 1100 52, 1210 46" stroke="#8ea888" stroke-width="2"/></g>' +
      '<g clip-path="url(#sw-' + uid + ')">' + ring(x(260), 72, 14, 2) + ring(x(640), 82, 12, 3.6) + ring(x(880), 66, 13, 5.2) + ring(x(1060), 84, 11, 6.4) + '</g>' +
      '<g data-step="1">' + reeds(x(42), 100, 72, true) + reeds(x(380), 100, 58, false) + reeds(x(760), 100, 66, true) + reeds(x(1150), 100, 74, true) + '</g>' +
      '<g data-step="2">' +
      '  <g transform="scale(' + (width / 1200) + ' 1)"><g class="sk-waves"><path d="M130 70 q 10 -5 20 0 q 10 5 20 0" stroke="#8ea888" stroke-width="2"/><path d="M560 64 q 10 -5 20 0 q 10 5 20 0 q 10 -5 20 0" stroke="#8ea888" stroke-width="2"/><path d="M990 74 q 10 -5 20 0 q 10 5 20 0" stroke="#8ea888" stroke-width="2"/></g>' +
      '  <g class="sk-waves sk-waves-alt"><path d="M300 86 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/><path d="M700 90 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/><path d="M860 88 q 8 -4 16 0" stroke="#8ea888" stroke-width="2"/></g>' +
      '</g><g class="sk-pad"><ellipse cx="' + x(496) + '" cy="78" rx="18" ry="6" fill="#8ea888" stroke-width="1.5"/></g>' +
      '  <g class="sk-pad sk-pad-2"><ellipse cx="' + x(546) + '" cy="70" rx="12" ry="4" fill="#8ea888" stroke-width="1.5"/></g>' +
      '  <g class="sk-pad sk-pad-3"><ellipse cx="' + x(984) + '" cy="88" rx="15" ry="5" fill="#8ea888" stroke-width="1.5"/></g>' +
      lotus(x(522), 76, 0.9) + lotus(x(1010), 86, 0.75) +
      '</g>' +
      fish(x(640), 74, 42, 34, 5, 9) +
      '<g class="sk-duck" style="--y:58px;--pond-start:52px;--pond-end:' + (width - 52) + 'px;--pond-middle:' + (width / 2) + 'px"><g class="sk-duck-facing"><g class="sk-bob">' +
      '  <path class="no-draw" d="M-30 6 q -8 2 -16 0 M-26 10 q -10 2 -20 0" stroke="#8ea888" stroke-width="1.6"/>' +
      '  <path class="no-draw" d="M-16 0 C -18 -8, -4 -12, 8 -6 L 10 -14 C 11 -21, 22 -22, 24 -15 L 31 -13 L 24 -10 C 23 -4, 20 2, 12 4 L -10 4 C -14 4, -17 3, -16 0 Z" fill="#fffdf8" stroke-width="1.8"/>' +
      '  <circle class="no-draw" cx="18" cy="-16" r="1.4" fill="' + INK + '" stroke="none"/>' +
      '  <path class="no-draw" d="M-6 -4 C 0 -7, 6 -6, 8 -2" stroke-width="1.4"/>' +
      '</g></g></g>' +
      '</svg>';
  }

  /* Small lotus for the dashboard sidebar */
  function lotusSmall() {
    return svgStart('0 0 140 74', 'Lotus on the water') +
      '<g data-step="0"><path d="M4 60 q 11 -4 22 0 q 11 4 22 0 q 11 -4 22 0 q 11 4 22 0 q 11 -4 22 0 q 11 4 22 0" stroke="#8ea888" stroke-width="1.8"/></g>' +
      ring(70, 62, 20, 2.5) +
      '<g data-step="1">' +
      '  <g class="sk-pad"><ellipse cx="40" cy="64" rx="16" ry="5" fill="#8ea888" stroke-width="1.4"/></g>' +
      '  <g class="sk-pad sk-pad-2"><ellipse cx="104" cy="66" rx="11" ry="3.6" fill="#8ea888" stroke-width="1.4"/></g>' +
      '</g>' +
      '<g data-step="2">' + lotus(70, 60, 1.45) +
      '  <g class="sk-sway" style="transform-origin:116px 62px; --a:5deg; --dur:3.4s">' +
      '    <path d="M116 62 C 116 50, 118 42, 120 36" stroke-width="1.6"/>' +
      '    <path d="M120 36 C 116 30, 117 24, 121 18 C 124 24, 125 30, 120 36 Z" fill="#ecd3cf" stroke-width="1.5"/>' +
      '  </g>' +
      '</g>' +
      '</svg>';
  }

  /* Small icons for the "Why JALACHAYA" cards */
  function record() {
    return svgStart('0 0 80 80', 'Clipboard being filled in') +
      '<g data-step="0">' +
      '  <rect x="18" y="12" width="44" height="58" rx="4" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <rect x="30" y="8" width="20" height="9" rx="2" fill="#dfe7d7" stroke-width="2"/>' +
      '</g>' +
      '<path class="sk-write no-draw" style="--delay:0s" d="M27 30 H 53" stroke="#8ea888" stroke-width="2.6"/>' +
      '<path class="sk-write no-draw" style="--delay:.35s" d="M27 40 H 53" stroke="#8ea888" stroke-width="2.6"/>' +
      '<path class="sk-write no-draw" style="--delay:.7s" d="M27 50 H 41" stroke="#8ea888" stroke-width="2.6"/>' +
      '<path class="sk-tick no-draw" pathLength="1" d="M44 56 l5 5 l9 -11" stroke-width="2.6"/>' +
      '</svg>';
  }

  function deadline() {
    return svgStart('0 0 80 80', 'Clock with moving hands') +
      '<g data-step="0">' +
      '  <circle cx="40" cy="43" r="25" fill="#fffdf8" stroke-width="2.4"/>' +
      '  <path d="M40 22 v4 M61 43 h-4 M40 64 v-4 M19 43 h4" stroke-width="2"/>' +
      '  <path d="M22 22 l-6 -6 M58 22 l6 -6" stroke-width="2.4"/>' +
      '</g>' +
      '<g class="sk-hand sk-hand-m no-draw" style="transform-origin:40px 43px"><path d="M40 43 V 26" stroke-width="2.2"/></g>' +
      '<g class="sk-hand sk-hand-h no-draw" style="transform-origin:40px 43px"><path d="M40 43 H 52" stroke-width="2.6"/></g>' +
      '<circle class="no-draw" cx="40" cy="43" r="2.4" fill="' + INK + '" stroke="none"/>' +
      '</svg>';
  }

  function verified() {
    return svgStart('0 0 80 80', 'Check mark being confirmed') +
      '<circle class="sk-pulse no-draw" cx="40" cy="40" r="24" stroke="#8ea888" stroke-width="2" style="transform-origin:40px 40px"/>' +
      '<g data-step="0"><circle cx="40" cy="40" r="24" fill="#dfe7d7" stroke-width="2.4"/></g>' +
      '<path class="sk-tick sk-tick-big no-draw" pathLength="1" d="M29 41 l8 8 l15 -17" stroke-width="3"/>' +
      '</svg>';
  }

  const DRAWINGS = {
    kulam: kulam,         // home page hero, login, pond page without a photo
    office: office,       // Panchayat pages
    village: village,     // citizen pages
    boat: boat,           // field worker page
    phone: phone,         // report a problem
    heron: heron,         // register
    strip: strip,         // water strip along the bottom of pages
    lotus: lotusSmall,    // dashboard sidebar
    record: record,       // "Why JALACHAYA" icons
    deadline: deadline,
    verified: verified
  };

  // Prepares every stroke for the "draw itself" effect
  function prepare(svg) {
    svg.querySelectorAll('[data-step]').forEach(function (group) {
      const step = Number(group.dataset.step);
      group.querySelectorAll('path, line, circle, ellipse, rect, polyline').forEach(function (shape, i) {
        if (shape.classList.contains('no-draw')) return;
        shape.setAttribute('pathLength', '1');
        shape.classList.add('draw');
        const fill = shape.getAttribute('fill');
        if (fill && fill !== 'none') shape.classList.add('has-fill');
        shape.style.setProperty('--d', (step * 0.32 + i * 0.06).toFixed(2) + 's');
      });
    });
  }

  function mount(root) {
    const slots = (root || document).querySelectorAll('[data-sketch]');
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-drawing');
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.2 })
      : null;

    slots.forEach(function (slot) {
      const make = DRAWINGS[slot.dataset.sketch];
      if (!make || slot.dataset.mounted) return;
      counter += 1;
      const uid = 's' + counter;
      const pondWidth = function () {
        const bounds = slot.getBoundingClientRect();
        const style = getComputedStyle(slot);
        // Match the SVG's content area; dashboard strips have top padding.
        // Using the outer height leaves letterboxing at both pond edges.
        const inset = function (name) { return parseFloat(style[name]) || 0; };
        const width = bounds.width - inset('paddingLeft') - inset('paddingRight') - inset('borderLeftWidth') - inset('borderRightWidth');
        const height = bounds.height - inset('paddingTop') - inset('paddingBottom') - inset('borderTopWidth') - inset('borderBottomWidth');
        return height > 0 ? width / height * 100 : 1200;
      };
      slot.innerHTML = make(uid, slot.dataset.sketch === 'strip' ? pondWidth() : undefined);
      if (slot.dataset.sketch === 'strip' && 'ResizeObserver' in window) {
        let previousWidth = pondWidth();
        const resize = new ResizeObserver(function () {
          const width = pondWidth();
          if (Math.abs(width - previousWidth) < 0.5) return;
          previousWidth = width;
          slot.innerHTML = strip(uid, width);
          const resizedSvg = slot.querySelector('svg');
          prepare(resizedSvg);
          resizedSvg.classList.add('is-drawing');
        });
        resize.observe(slot);
      }
      slot.dataset.mounted = 'true';
      const svg = slot.querySelector('svg');
      prepare(svg);
      if (observer) observer.observe(svg);
      else svg.classList.add('is-drawing');
    });
  }

  // Markup for a slot, for pages that build their HTML in JavaScript
  function slotHtml(name, extraClass) {
    return '<div class="sketch-slot ' + (extraClass || '') + '" data-sketch="' + name + '"></div>';
  }

  return { mount: mount, slotHtml: slotHtml };
})();
