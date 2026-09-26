import { readFileSync } from "node:fs";

const sync = readFileSync(new URL("../firebase/sync.js", import.meta.url), "utf8");
const dataManager = readFileSync(new URL("../data-manager/app.js", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../side-bar/app.js", import.meta.url), "utf8");

for (const pattern of [
    "onSnapshot",
    "LOCAL_CHANGE_DEBOUNCE",
    "requestSync(\"local-change\"",
    "visibilitychange",
    "pageshow",
    "window-focus",
    "syncRequestedWhileBusy",
    "startRemoteListener",
    "version: record.version",
    "updatedAtMs: record.updatedAtMs",
    "deviceId: record.deviceId"
]) {
    if (!sync.includes(pattern)) throw new Error(`Realtime sync behavior is missing: ${pattern}`);
}

for (const pattern of [
    "function subscribe(key, callback)",
    "jaimie-data-changed",
    "BroadcastChannel",
    "source: \"remote\"",
    "applied: true",
    "expected &&"
]) {
    if (!dataManager.includes(pattern)) throw new Error(`Data-change or race-safety behavior is missing: ${pattern}`);
}

if (!/async function writeRemoteRecord[\s\S]*?return \{[\s\S]*?applied:\s*true/.test(dataManager)) {
    throw new Error("Remote hydration does not report a successful apply result.");
}

for (const pattern of ["New JAIMIE data received", "jaimie-data-changed", "window.location.reload()"] ) {
    if (!sidebar.includes(pattern)) throw new Error(`Cloud-update visibility is missing: ${pattern}`);
}

console.log("JAIMIE sync architecture passed: debounced uploads, realtime pulls, resume triggers, hydration results, race-safe dirty flags, and refresh notices are wired.");
