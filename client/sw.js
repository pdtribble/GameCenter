// Service Worker — caches app shell for offline/installable use.
// Game data (socket, API) is always fetched live from the server.
'use strict';

const CACHE_NAME = 'gc-shell-v1';
const SHELL = ['/', '/app.js', '/style.css', '/socket.io/socket.io.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Always network for socket.io, API calls, and POST requests
  if (
    url.includes('/socket.io/') ||
    url.includes('/api/') ||
    e.request.method !== 'GET'
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
