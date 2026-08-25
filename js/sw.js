// Rens Driver — minimal offline shell.
// Caches the app files so the login + job screens open with no signal.
// Status taps made offline are queued in localStorage by driver.html and
// flushed on reconnect (see flushQueue there).
const CACHE = 'rens-driver-v1';
const SHELL = ['/driver.html', '/css/styles.css', '/js/shared.js', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // never cache Supabase / API calls — always go to network
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('/driver.html')))
  );
});
