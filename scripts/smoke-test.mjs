import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const failures = [];

const featureFolders = [
    "braindump",
    "calendar-task-tracker",
    "day_page",
    "diet-tracker",
    "event-countdown-widget",
    "habits",
    "house_inventory",
    "journal",
    "packing_tracker",
    "sleep_tracker",
    "workout-tracker"
];

function fail(message) {
    failures.push(message);
}

function requireFile(path) {
    if (!existsSync(path)) {
        fail(`Missing file: ${path}`);
    }
}

for (const folder of featureFolders) {
    const directory = join(root, folder);

    for (const filename of ["index.html", "styles.css", "app.js"]) {
        requireFile(join(directory, filename));
    }

    const htmlPath = join(directory, "index.html");

    if (!existsSync(htmlPath)) {
        continue;
    }

    const html = readFileSync(htmlPath, "utf8");
    const dataManagerIndex = html.indexOf("../data-manager/app.js");
    const featureAppIndex = html.indexOf('src="app.js"');

    if (dataManagerIndex === -1) {
        fail(`${folder}/index.html does not load the shared data manager`);
    }

    if (featureAppIndex === -1) {
        fail(`${folder}/index.html does not load its feature app`);
    }

    if (
        dataManagerIndex !== -1 &&
        featureAppIndex !== -1 &&
        dataManagerIndex > featureAppIndex
    ) {
        fail(`${folder}/index.html loads its feature app before the data manager`);
    }
}

const homeHtml = readFileSync(join(root, "index.html"), "utf8");

if (!homeHtml.includes("./data-manager/app.js")) {
    fail("Home does not load the shared data manager");
}

const sidebarHtml = readFileSync(
    join(root, "side-bar", "component.html"),
    "utf8"
);

if (/href\s*=\s*["']\s*["']/.test(sidebarHtml)) {
    fail("Sidebar contains an empty link");
}

for (const match of sidebarHtml.matchAll(/href=["']([^"']+)["']/g)) {
    requireFile(join(root, match[1]));
}

function collectJavaScript(directory) {
    const files = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".git") {
            continue;
        }

        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...collectJavaScript(path));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(path);
        }
    }

    return files;
}

for (const path of collectJavaScript(root)) {
    try {
        execFileSync(process.execPath, ["--check", path], {
            stdio: "pipe"
        });
    } catch (error) {
        fail(`JavaScript syntax error in ${path}: ${error.stderr || error.message}`);
    }
}

if (failures.length) {
    console.error("JAIMIE smoke test failed:\n");

    for (const failure of failures) {
        console.error(`- ${failure}`);
    }

    process.exitCode = 1;
} else {
    console.log(
        `JAIMIE smoke test passed: ${featureFolders.length} feature pages and shared wiring are valid.`
    );
}
