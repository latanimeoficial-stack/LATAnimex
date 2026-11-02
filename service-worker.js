/* LATAnime — service worker
   Network-first para que el catálogo y la web reflejen tus cambios publicados.
   No almacena videos, flujos multimedia ni recursos de otros dominios.
*/
'use strict';
const CACHE_NAME = 'latanime-shell-v1';
const SHELL_URLS = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('latanime-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // No interceptar servicios externos (Archive.org, AniList, CDNs, etc.).
  if (url.origin !== self.location.origin) return;

  // Nunca interceptar solicitudes parciales/streaming ni archivos de video/audio.
  const mediaPattern = /\.(mp4|m4v|m3u8|mpd|webm|mov|avi|mkv|mp3|m4a|aac|ogg|opus|ts|m4s)(?:$|\?)/i;
  if (request.headers.has('range') || mediaPattern.test(url.pathname + url.search) ||
      request.destination === 'video' || request.destination === 'audio') return;

  // Las navegaciones son network-first para mostrar siempre la versión publicada más reciente.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          try { await cache.put(request, response.clone()); } catch (_) {}
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request) || await caches.match('./');
        if (cached) return cached;
        return new Response('LATAnime necesita conexión para cargar el catálogo. Comprueba tu Internet e inténtalo de nuevo.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Para recursos del mismo origen: red primero y caché como respaldo offline.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        try { await cache.put(request, response.clone()); } catch (_) {}
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
