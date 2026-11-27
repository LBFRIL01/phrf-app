// Service worker: lets the app install to a phone and show something useful
// with no signal. Pages always come from the network when possible, so people
// never see stale ratings; the last copy is shown only when offline.
const CACHE = "phrf-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon.svg", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Static build files never change name, so cache them forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  // Pages: network first. Only the public rating list is kept for offline use.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        if (url.pathname === "/" && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
        }
        return res;
      }).catch(() => caches.match(url.pathname === "/" ? "/" : OFFLINE).then((hit) => hit || caches.match(OFFLINE))),
    );
  }
});
