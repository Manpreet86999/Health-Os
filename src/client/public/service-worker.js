const CACHE = 'health-os-v1.4.0-final';
const APP_SHELL = ['/', '/manifest.webmanifest', '/health-os-mark.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Training and account data must remain network-only; never cache API responses.
  if (new URL(request.url).pathname.startsWith('/api/')) return;
  const hashed = /\/assets\/.*-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2)$/.test(new URL(request.url).pathname);
  if (hashed) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => {});
      return response;
    }));
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : Response.error()))));
});

