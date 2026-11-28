/* VELOX offline shell — versioned, same-origin only.
   Netzwerk zuerst (kurzes Zeitlimit), sonst Cache: so ist nach einem Update nie eine Mischung aus alter und neuer
   Version aktiv, und die App startet trotzdem offline. */
const CACHE = "velox-shell-v44";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./velox-extras.css",
  "./velox-polish.css",
  "./sensor-core.js",
  "./elevation-core.js",
  "./ride-core.js",
  "./charts.js",
  "./app.js",
  "./analysis-pro.js",
  "./velox-plus.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // einzeln ablegen: eine fehlende optionale Datei darf die Installation nicht verhindern
    await Promise.all(SHELL.map(async path => {
      try { await cache.add(path); } catch (error) { console.warn("SW: nicht gecacht:", path); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith("velox-shell-") && key !== CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  let timer;
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS); })
    ]);
    clearTimeout(timer);
    // Serverfehler (5xx) zählen wie "offline": dann lieber die gespeicherte Version ausliefern.
    if (response.status >= 500) throw new Error("server " + response.status);
    // Nur vollständige Antworten speichern (cache.put lehnt z. B. 206 ab). Scheitert das Speichern
    // (Speicher voll), wird die frische Antwort trotzdem ausgeliefert statt auf den Cache zurückzufallen.
    if (response.status === 200) {
      try { await cache.put(cacheKey || request, response.clone()); } catch (error) { console.warn("SW: Speichern fehlgeschlagen:", error); }
    }
    return response;
  } catch {
    clearTimeout(timer);
    return (await cache.match(cacheKey || request)) ||
      (await cache.match(request, { ignoreSearch: true })) || null;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const response = await networkFirst(request, "./index.html");
      return response || (await caches.match("./")) || new Response("VELOX ist offline nicht verfügbar.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })());
    return;
  }

  event.respondWith((async () => {
    const response = await networkFirst(request);
    return response || new Response("Diese Ressource ist offline nicht verfügbar.", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});
