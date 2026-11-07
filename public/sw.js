const STATIC_CACHE = "taskly-static-v2";
const MEDIA_CACHE = "taskly-media-v1";

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== MEDIA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCloudinary(url) {
  return url.hostname.endsWith("res.cloudinary.com");
}

async function putResponse(cache, request, response) {
  if (response && response.ok && response.status !== 206) {
    if (response.type === "basic" || response.type === "cors") {
      try {
        await cache.put(request, response.clone());
      } catch (err) {
        // ignora fallos de caché (cuota, respuestas no cacheables)
      }
    }
  }
  return response;
}

async function cachedFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    return putResponse(cache, request, response);
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => putResponse(cache, request, response))
    .catch(() => cached);
  return cached || network;
}

async function handleNavigation(request) {
  const key = new URL(request.url).pathname === "/" ? "/index.html" : request.url;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(key, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(key);
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Authenticated agent responses must never enter a shared browser cache.
    if (url.pathname.startsWith("/api/") || url.pathname === "/mcp") {
      event.respondWith(fetch(request));
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(handleNavigation(request));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isCloudinary(url)) {
    event.respondWith(cachedFirst(request));
    return;
  }
});
