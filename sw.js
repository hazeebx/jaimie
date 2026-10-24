const CACHE_VERSION = "jaimie-shell-v1";
const LEGACY_CACHE_PREFIXES = ["jaimie-shell-", "jaimie-music-shell-"];
const APP_SHELL = [
    "./app.html",
    "./app-shell.css",
    "./app-shell.js",
    "./pwa.js",
    "./manifest.webmanifest",
    "./assets/jaimie-icon.svg",
    "./assets/jaimie-icon-192.png",
    "./assets/jaimie-icon-512.png",
    "./assets/jaimie-icon-maskable-512.png",
    "./side-bar/component.html",
    "./side-bar/styles.css",
    "./side-bar/app.js",
    "./data-manager/app.js",
    "./shared/safe-content.js",
    "./shared/validation.js",
    "./shared/reminder-calendar-sync.js",
    "./shared/validation-schemas/calendar-reminders.js",
    "./shared/validation-schemas/workout.js",
    "./shared/validation-schemas/habits.js",
    "./shared/validation-schemas/event-countdown.js",
    "./shared/validation-schemas/diet.js",
    "./shared/validation-schemas/sleep.js",
    "./shared/validation-schemas/journal.js",
    "./shared/validation-schemas/inventory.js",
    "./shared/validation-schemas/packing.js",
    "./shared/validation-schemas/finance.js",
    "./shared/validation-schemas/cartographer.js",
    "./dashboard/index.html",
    "./dashboard/styles.css",
    "./dashboard/app.js",
    "./dashboard/widgets/registry.js",
    "./dashboard/widgets/workout-widget.js",
    "./dashboard/widgets/countdown-widget.js",
    "./day_page/index.html",
    "./day_page/styles.css",
    "./day_page/notifications.css",
    "./day_page/app.js",
    "./day_page/schedule-order.js",
    "./day_page/schedule-notifications.js",
    "./calendar-task-tracker/index.html",
    "./calendar-task-tracker/styles.css",
    "./calendar-task-tracker/app.js",
    "./workout-tracker/index.html",
    "./workout-tracker/styles.css",
    "./workout-tracker/app.js",
    "./workout-tracker/workout-history.js",
    "./journal/index.html",
    "./journal/styles.css",
    "./journal/app.js",
    "./journal/notes-model.js",
    "./journal/rich-text.js",
    "./braindump/app.js",
    "./habits/index.html",
    "./habits/styles.css",
    "./habits/app.js",
    "./finance/index.html",
    "./finance/styles.css",
    "./finance/app.js",
    "./finance/finance-model.js",
    "./cartographer/index.html",
    "./cartographer/styles.css",
    "./cartographer/app.js",
    "./cartographer/geo-model.js",
    "./diet-tracker/index.html",
    "./diet-tracker/styles.css",
    "./diet-tracker/app.js",
    "./sleep_tracker/index.html",
    "./sleep_tracker/styles.css",
    "./sleep_tracker/app.js",
    "./event-countdown-widget/index.html",
    "./event-countdown-widget/styles.css",
    "./event-countdown-widget/app.js",
    "./house_inventory/index.html",
    "./house_inventory/styles.css",
    "./house_inventory/app.js",
    "./packing_tracker/index.html",
    "./packing_tracker/styles.css",
    "./packing_tracker/app.js",
    "./index.html",
    "./styles.css",
    "./home.js"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.map(name => {
                const isJaimieCache = LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix));
                return isJaimieCache && name !== CACHE_VERSION ? caches.delete(name) : undefined;
            })))
            .then(() => self.clients.claim())
    );
});

async function cacheResponse(request, response) {
    if (!response || !response.ok || response.type !== "basic") return response;
    if (/\bno-store\b/i.test(response.headers.get("Cache-Control") || "")) return response;
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
    return response;
}

async function networkFirst(request) {
    try {
        return await cacheResponse(request, await fetch(request));
    } catch {
        return (await caches.match(request, { ignoreSearch: true })) ||
            (await caches.match("./app.html")) ||
            Response.error();
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    const refresh = fetch(request)
        .then(response => cacheResponse(request, response))
        .catch(() => null);
    return cached || (await refresh) || Response.error();
}

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request));
        return;
    }

    if (["script", "style", "image", "font", "manifest"].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
