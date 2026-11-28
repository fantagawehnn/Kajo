/* KAJO: caches only the static app shell.
   Supabase requests, authentication, personal records and API responses are never cached. */
const CACHE_PREFIX = "kajo-shell-";
const CACHE_NAME = CACHE_PREFIX + "v2-36";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./icons/kajo-icon.svg",
  "./branding/Herzschlag%20im%20Kajak-Wellenlogo.png",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { body: event.data?.text?.() || "" }; }
  const title = payload.title || "KAJO";
  const options = {
    body: payload.body || "Deine persönliche Erinnerung",
    icon: payload.icon || "./icons/kajo-icon.svg",
    badge: payload.badge || "./icons/kajo-icon.svg",
    tag: payload.tag || "kajo-reminder",
    renotify: Boolean(payload.renotify),
    timestamp: Number(payload.timestamp) || Date.now(),
    lang: "de-DE",
    dir: "auto",
    data: { url: payload.url || "./" },
    actions: [{ action: "open", title: "KAJO öffnen" }],
    vibrate: [90, 40, 90]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isAppShellAsset =
    request.mode === "navigate" ||
    /\\.(?:html|js|css|svg|png|webmanifest)$/i.test(url.pathname);

  if (!isAppShellAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const isNavigation = request.mode === "navigate";
    const cached = await cache.match(request);

    // Navigation bleibt network-first, damit Deployments sofort sichtbar werden.
    // Statische App-Dateien werden cache-first ausgeliefert und im Hintergrund aktualisiert.
    if (!isNavigation && cached) {
      event.waitUntil(fetch(request).then(response => {
        if (response && response.ok && response.type === "basic") {
          return cache.put(request, response.clone());
        }
      }).catch(() => {}));
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (isNavigation) {
        return (await cache.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
