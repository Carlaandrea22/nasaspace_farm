/* global self, caches, buildId, assets */

const cachePrefix = "field-shift-";
const cacheName = `${cachePrefix}${buildId}`;
const publicPages = ["/", "/consulta", "/la-maica", "/la-maica/mi-parcela", "/la-maica/mi-cultivo-y-mi-agua", "/la-maica/comparar", "/la-maica/mi-proximo-turno"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll([...publicPages, ...assets])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const outdated = keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(outdated.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && publicPages.includes(url.pathname) && (!url.search || url.pathname === "/consulta")) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(url.pathname)) ?? Response.error();
    }));
    return;
  }
  if (url.search) return;

  if (assets.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async (cache) => {
      return (await cache.match(request)) ?? fetch(request);
    }));
  }
});
