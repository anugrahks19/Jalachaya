/* JALACHAYA — real Java API configuration. Browser mock data is disabled. */

const CONFIG = {
  APP_NAME: 'JALACHAYA',

  USE_MOCK_BACKEND: false,
  // Automatic backend URL: uses localhost when developing, or your Render backend URL when hosted
  API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8080'
    : (window.__JALACHAYA_API_URL__ || 'https://jalachaya-backend.onrender.com'),

  // Image upload rules (checked in the browser; the backend must check again)
  MAX_IMAGE_SIZE_MB: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

  MAX_REPORT_PHOTOS: 3,        // photos per new complaint
  MAX_COMPLAINT_PHOTOS: 6,     // total photos a complaint can collect

  // Uploaded photos are resized before saving so localStorage does not fill up
  IMAGE_MAX_DIMENSION: 900,
  IMAGE_QUALITY: 0.72,

  // Real sample photos (assets/samples/). Used by the demo data, the
  // "Sample photos" panel on the report page and the worker's
  // "Use sample photos" button. Replace the files to change them.
  SAMPLE_IMAGES: {
    polluted: [
      { url: 'assets/samples/polluted-1.jpg', caption: 'Plastic waste choking the water' },
      { url: 'assets/samples/polluted-2.jpg', caption: 'Bottles and cans floating on the surface' },
      { url: 'assets/samples/polluted-3.jpg', caption: 'Dumped waste along the bank' }
    ],
    clean: [
      { url: 'assets/samples/clean-1.jpg', caption: 'Clean pond with healthy reeds' },
      { url: 'assets/samples/clean-2.jpg', caption: 'Clear water and trimmed banks' },
      { url: 'assets/samples/clean-3.jpg', caption: 'Clean pond after waste removal' }
    ]
  },

  // Small artificial delay in demo mode so loading states are visible
  MOCK_DELAY_MS: 250,

  // "Live" updates: lists refresh on their own every few seconds, and
  // instantly when another browser tab changes the demo data.
  LIVE_REFRESH_SECONDS: 20
};
