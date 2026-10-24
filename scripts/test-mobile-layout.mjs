import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const viewportWidth = Number.parseInt(process.argv[2] || "390", 10);
const viewportHeight = Number.parseInt(process.argv[3] || "844", 10);

if (!Number.isFinite(viewportWidth) || viewportWidth < 320 || !Number.isFinite(viewportHeight) || viewportHeight < 480) {
    throw new Error("Viewport arguments must be a width of at least 320 and a height of at least 480.");
}
const routes = [
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
    "index.html"
];
const chromeCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
];
const chromePath = chromeCandidates.find(existsSync);

if (!chromePath) {
    throw new Error("Google Chrome is required for the local mobile layout test.");
}

const profile = mkdtempSync(join(tmpdir(), "jaimie-mobile-layout-"));
const server = spawn("python", ["-m", "http.server", "8766", "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore"
});
const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--remote-debugging-port=9223",
    `--user-data-dir=${profile}`,
    `--window-size=${viewportWidth},${viewportHeight}`,
    "http://127.0.0.1:8766/app.html#/dashboard/index.html"
], { stdio: "ignore" });
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function waitForJson(url) {
    let lastError;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw lastError || new Error(`Timed out waiting for ${url}`);
}

try {
    const targets = await waitForJson("http://127.0.0.1:9223/json/list");
    const page = targets.find(target => target.type === "page" && target.url.includes("app.html"));
    if (!page) throw new Error("JAIMIE application shell was not found in Chrome.");

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", resolveOpen, { once: true });
        socket.addEventListener("error", rejectOpen, { once: true });
    });

    let messageId = 0;
    const pending = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        const resolver = pending.get(message.id);
        if (!resolver) return;
        pending.delete(message.id);
        resolver(message);
    });
    const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
        const id = ++messageId;
        pending.set(id, message => {
            if (message.error) rejectMessage(new Error(message.error.message));
            else resolveMessage(message.result);
        });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const response = await send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
        return response.result.value;
    };

    await send("Emulation.setDeviceMetricsOverride", {
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 1,
        mobile: true
    });
    await send("Page.reload", { ignoreCache: true });
    await delay(900);

    const serviceWorkerReady = await evaluate(`Promise.race([
        navigator.serviceWorker.ready.then(registration => ({
            active: Boolean(registration.active),
            scope: registration.scope
        })),
        new Promise(resolveTimeout => setTimeout(() => resolveTimeout(null), 5000))
    ])`);
    if (!serviceWorkerReady?.active) {
        throw new Error("JAIMIE service worker did not become active.");
    }
    const shellCached = await evaluate(`caches.has("jaimie-shell-v1")`);
    if (!shellCached) throw new Error("JAIMIE offline shell cache was not created.");

    const button = await evaluate(`(() => {
        const target = document.getElementById("mobileMenuToggle");
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (!button) throw new Error("Mobile menu launcher is missing.");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await delay(260);
    const drawerOpen = await evaluate(`document.getElementById("jaimieSideMenu")?.classList.contains("is-mobile-open")`);
    if (!drawerOpen) throw new Error("Mobile navigation drawer did not open after a physical click.");
    await evaluate(`document.getElementById("sideMenuBackdrop")?.click()`);

    const failures = [];
    for (const route of routes) {
        await evaluate(`location.hash = ${JSON.stringify(`#/${route}`)}`);
        await delay(520);
        const result = await evaluate(`(() => {
            const frame = document.querySelector(".app-shell__frame.is-active");
            const doc = frame?.contentDocument;
            if (!doc) return { error: "Active feature frame is unavailable." };
            const viewport = doc.documentElement.clientWidth;
            const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth || 0);
            const offenders = [...doc.body.querySelectorAll("*")].flatMap(element => {
                const style = frame.contentWindow.getComputedStyle(element);
                if (style.position === "fixed" || style.display === "none" || style.visibility === "hidden") return [];
                const rect = element.getBoundingClientRect();
                if (rect.width < 1 || (rect.left >= -1 && rect.right <= viewport + 1)) return [];
                return [{
                    tag: element.tagName.toLowerCase(),
                    id: element.id,
                    className: String(element.className || "").slice(0, 90),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width)
                }];
            }).slice(0, 8);
            return { viewport, scrollWidth, offenders };
        })()`);

        if (result.error || result.scrollWidth > result.viewport + 1 || result.offenders.length) {
            failures.push({ route, ...result });
        }
    }

    if (!failures.length) {
        server.kill();
        await delay(450);
        await send("Page.reload", { ignoreCache: true });
        await delay(3200);
        const offlineState = await evaluate(`(() => {
            const frame = document.querySelector(".app-shell__frame.is-active");
            return {
                controlled: Boolean(navigator.serviceWorker.controller),
                shellVisible: Boolean(document.getElementById("appShell")),
                framePresent: Boolean(frame),
                frameSource: frame?.getAttribute("src") || "",
                featureReadyState: frame?.contentDocument?.readyState || "",
                featureVisible: Boolean(frame?.contentDocument?.body)
            };
        })()`);
        if (!offlineState.controlled || !offlineState.shellVisible || !offlineState.featureVisible) {
            failures.push({ route: "offline reload", ...offlineState });
        }
    }

    socket.close();
    if (failures.length) {
        console.error(JSON.stringify(failures, null, 2));
        process.exitCode = 1;
    } else {
        console.log(`JAIMIE mobile layout passed: ${routes.length} routes fit a ${viewportWidth}px viewport, the drawer opens, and the PWA reloads offline.`);
    }
} finally {
    chrome.kill();
    server.kill();
    await delay(120);
    rmSync(profile, { recursive: true, force: true });
}
