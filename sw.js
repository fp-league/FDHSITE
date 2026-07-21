// Fortnite Drivers Hub — service worker
// Caches the static app shell so the site is installable and loads instantly on repeat visits.
// Firebase/Firestore requests always go to the network — we never want stale driver data.

const CACHE_NAME = 'fdh-shell-v1';
const APP_SHELL = [
  'index.html',
  'rankings.html',
  'stats.html',
  'compare.html',
  'awards.html',
  'directory.html',
  'dashboard.html',
  'driver.html',
  'league.html',
  'assets/styles.css',
  'assets/app.js',
  'assets/logo.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Firebase/Firestore/Google API calls — always live data
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com') || url.hostname.includes('gstatic.com')) {
    return;
  }

  // Only handle same-origin GET requests for the app shell
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
