const CACHE_NAME = "jaimie-music-shell-v2";
const SHELL_URLS = [
    "./music/index.html",
    "./music/styles.css?v=1",
    "./music/app.js?v=2",
    "./music/core/database.js?v=1",
    "./music/core/storage.js?v=1",
    "./music/core/metadata.js?v=1",
    "./music/core/player.js?v=2",
    "./assets/jaimie-music.svg",
    "./manifest.webmanifest"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(SHELL_URLS.map(url => cache.add(url).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.filter(name => name.startsWith("jaimie-music-shell-") && name !== CACHE_NAME).map(name => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const isMusicNavigation = request.mode === "navigate" && /\/music\/?(?:index\.html)?$/.test(url.pathname);
    const isShellAsset = SHELL_URLS.some(entry => {
        const shellUrl = new URL(entry, self.location.href);
        return shellUrl.pathname === url.pathname;
    });
    if (!isMusicNavigation && !isShellAsset) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request).then(cached => cached || caches.match("./music/index.html")))
    );
});
