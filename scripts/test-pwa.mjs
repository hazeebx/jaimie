import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const fail = message => failures.push(message);
const read = path => readFileSync(join(root, path), "utf8");

const manifestPath = join(root, "manifest.webmanifest");
if (!existsSync(manifestPath)) {
    fail("manifest.webmanifest is missing");
} else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const field of ["name", "short_name", "start_url", "scope", "display", "theme_color", "background_color"]) {
        if (!manifest[field]) fail(`Manifest is missing ${field}`);
    }
    if (manifest.prefer_related_applications !== false) {
        fail("Manifest must keep prefer_related_applications false");
    }

    for (const size of [192, 512]) {
        const icon = manifest.icons?.find(candidate => candidate.sizes === `${size}x${size}` && candidate.type === "image/png");
        if (!icon) {
            fail(`Manifest is missing a ${size}x${size} PNG icon`);
            continue;
        }
        const iconPath = join(root, icon.src.replace(/^\.\//, ""));
        if (!existsSync(iconPath)) {
            fail(`Manifest icon does not exist: ${icon.src}`);
            continue;
        }
        const png = readFileSync(iconPath);
        if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
            fail(`Manifest icon has incorrect dimensions: ${icon.src}`);
        }
    }

    if (!manifest.icons?.some(icon => String(icon.purpose || "").split(/\s+/).includes("maskable"))) {
        fail("Manifest is missing a maskable icon");
    }
}

const appHtml = read("app.html");
for (const required of ["manifest.webmanifest", "apple-touch-icon", "pwa.js"]) {
    if (!appHtml.includes(required)) fail(`app.html is missing PWA wiring: ${required}`);
}

const pagePaths = [
    "index.html",
    "dashboard/index.html",
    "day_page/index.html",
    "calendar-task-tracker/index.html",
    "workout-tracker/index.html",
    "journal/index.html",
    "habits/index.html",
    "finance/index.html",
    "cartographer/index.html",
    "diet-tracker/index.html",
    "sleep_tracker/index.html",
    "event-countdown-widget/index.html",
    "house_inventory/index.html",
    "packing_tracker/index.html",
    "braindump/index.html"
];
for (const pagePath of pagePaths) {
    if (!read(pagePath).includes("manifest.webmanifest")) {
        fail(`${pagePath} does not reference the JAIMIE manifest`);
    }
}

const pwaSource = read("pwa.js");
for (const behavior of ["beforeinstallprompt", "appinstalled", "serviceWorker.register", "display-mode: standalone"]) {
    if (!pwaSource.includes(behavior)) fail(`PWA client is missing behavior: ${behavior}`);
}

const workerSource = read("sw.js");
for (const safeguard of [
    'request.method !== "GET"',
    "url.origin !== self.location.origin",
    "request.mode === \"navigate\"",
    "no-store",
    "jaimie-music-shell-"
]) {
    if (!workerSource.includes(safeguard)) fail(`Service worker is missing safeguard: ${safeguard}`);
}
if (/local-ai-engine|firestore|googleapis/i.test(workerSource)) {
    fail("Service worker must not pre-cache local AI or Firebase endpoints");
}

const shellMatch = workerSource.match(/const APP_SHELL = \[([\s\S]*?)\n\];/);
if (!shellMatch) {
    fail("Service worker APP_SHELL list could not be read");
} else {
    const shellPaths = [...shellMatch[1].matchAll(/"(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)].map(match => match[1]);
    for (const shellPath of shellPaths) {
        const diskPath = join(root, shellPath.slice(2));
        if (!existsSync(diskPath)) fail(`Service worker pre-cache target is missing: ${shellPath}`);
    }
}

if (failures.length) {
    console.error("JAIMIE PWA test failed:\n");
    failures.forEach(message => console.error(`- ${message}`));
    process.exitCode = 1;
} else {
    console.log("JAIMIE PWA test passed: manifest, icons, install flow, cache list, and network safeguards are valid.");
}
