import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.window = globalThis;
await import("../shared/safe-content.js");

const safe = globalThis.JAIMIESafeContent;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");

assert.equal(
    safe.escapeHtml(`<img src=x onerror="alert('x')"> & done`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; done"
);
assert.equal(safe.normalizeText("  Cafe\u0301\u0000  "), "Café");
assert.equal(safe.normalizeText("abcdef", { maxLength: 3 }), "abc");
assert.equal(
    safe.safeUrl("/calendar", { base: "https://jaimie.example/app/" }),
    "https://jaimie.example/calendar"
);
assert.equal(safe.safeUrl("javascript:alert(1)"), null);
assert.equal(safe.safeUrl("java\nscript:alert(1)"), null);
assert.equal(safe.safeUrl("data:text/html,<script>alert(1)</script>"), null);
assert.equal(safe.safeUrl("file:///C:/secrets.txt"), null);

const ignoredDirectories = new Set([
    ".git",
    ".firebase",
    ".venv",
    "node_modules",
    "venv"
]);

function collectJavaScript(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...collectJavaScript(path));
        else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
    }
    return files;
}

const inlineHandlerPattern = /\bon[a-z]+\s*=\s*["']/i;
for (const path of collectJavaScript(root)) {
    const source = readFileSync(path, "utf8");
    assert.equal(
        inlineHandlerPattern.test(source),
        false,
        `Inline event-handler markup is not allowed in ${path}`
    );
}

for (const path of [
    join(root, "house_inventory", "app.js"),
    join(root, "packing_tracker", "app.js"),
    join(root, "workout-tracker", "app.js"),
    join(root, "event-countdown-widget", "app.js")
]) {
    const source = readFileSync(path, "utf8");
    assert.equal(
        /data-[\w-]+="\$\{(?:item|profile|workout|record|exerciseData|event)\.id\}"/.test(source),
        false,
        `A stored ID is interpolated into markup without escaping in ${path}`
    );
}

console.log("JAIMIE content-safety tests passed: text, URLs, and dynamic action markup are hardened.");
