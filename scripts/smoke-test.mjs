import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const failures = [];
const safeContentPath = join(root, "shared", "safe-content.js");
const validationPath = join(root, "shared", "validation.js");
const schemaScripts = [
    { filename: "calendar-reminders.js", label: "Calendar/Reminder" },
    { filename: "workout.js", label: "Workout" },
    { filename: "habits.js", label: "Habits" },
    { filename: "event-countdown.js", label: "Event Countdown" },
    { filename: "diet.js", label: "Diet" },
    { filename: "sleep.js", label: "Sleep" },
    { filename: "journal.js", label: "Journal" },
    { filename: "inventory.js", label: "Inventory" },
    { filename: "packing.js", label: "Packing" }
];

requireFile(safeContentPath);
requireFile(validationPath);
for (const schema of schemaScripts) {
    requireFile(join(root, "shared", "validation-schemas", schema.filename));
}

const featureFolders = [
    "braindump",
    "calendar-task-tracker",
    "dashboard",
    "day_page",
    "diet-tracker",
    "event-countdown-widget",
    "finance",
    "habits",
    "house_inventory",
    "journal",
    "music",
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
    const safeContentIndex = html.indexOf("../shared/safe-content.js");
    const validationIndex = html.indexOf("../shared/validation.js");
    const schemaIndexes = schemaScripts.map(schema => ({
        ...schema,
        index: html.indexOf(`../shared/validation-schemas/${schema.filename}`)
    }));
    const dataManagerIndex = html.indexOf("../data-manager/app.js");
    const featureAppIndex = html.search(/src=["']app\.js(?:\?[^"']*)?["']/);

    if (safeContentIndex === -1) {
        fail(`${folder}/index.html does not load the shared safe-content layer`);
    }

    if (validationIndex === -1) {
        fail(`${folder}/index.html does not load the shared validation layer`);
    }

    for (const schema of schemaIndexes) {
        if (schema.index === -1) {
            fail(`${folder}/index.html does not load the ${schema.label} schema`);
        }
    }

    if (dataManagerIndex === -1) {
        fail(`${folder}/index.html does not load the shared data manager`);
    }

    if (
        safeContentIndex !== -1 &&
        validationIndex !== -1 &&
        safeContentIndex > validationIndex
    ) {
        fail(`${folder}/index.html loads validation before safe-content`);
    }

    const orderedIndexes = [
        { label: "validation", index: validationIndex },
        ...schemaIndexes,
        { label: "data manager", index: dataManagerIndex }
    ];
    for (let index = 1; index < orderedIndexes.length; index += 1) {
        const previous = orderedIndexes[index - 1];
        const current = orderedIndexes[index];
        if (previous.index !== -1 && current.index !== -1 && previous.index > current.index) {
            fail(`${folder}/index.html loads ${current.label} before ${previous.label}`);
        }
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

const financeHtml = readFileSync(join(root, "finance", "index.html"), "utf8");
const financeSchemaPath = join(root, "shared", "validation-schemas", "finance.js");
requireFile(financeSchemaPath);
requireFile(join(root, "finance", "finance-model.js"));
if (!financeHtml.includes("../shared/validation-schemas/finance.js")) {
    fail("Finance does not load its validation schema");
}
if (!financeHtml.includes("finance-model.js")) {
    fail("Finance does not load its model before the feature app");
}
if (financeHtml.indexOf("../shared/validation-schemas/finance.js") > financeHtml.indexOf("../data-manager/app.js")) {
    fail("Finance loads its validation schema after the data manager");
}
if (financeHtml.indexOf("finance-model.js") > financeHtml.search(/src=["']app\.js(?:\?[^"']*)?["']/)) {
    fail("Finance loads its feature app before its model");
}

const homeHtml = readFileSync(join(root, "index.html"), "utf8");

if (!homeHtml.includes("./shared/safe-content.js")) {
    fail("Home does not load the shared safe-content layer");
}

if (!homeHtml.includes("./shared/validation.js")) {
    fail("Home does not load the shared validation layer");
}

for (const schema of schemaScripts) {
    if (!homeHtml.includes(`./shared/validation-schemas/${schema.filename}`)) {
        fail(`Home does not load the ${schema.label} schema`);
    }
}

if (!homeHtml.includes("./data-manager/app.js")) {
    fail("Home does not load the shared data manager");
}

if (
    homeHtml.indexOf("./shared/safe-content.js") >
    homeHtml.indexOf("./shared/validation.js")
) {
    fail("Home loads validation before safe-content");
}

const homeOrderedIndexes = [
    { label: "validation", index: homeHtml.indexOf("./shared/validation.js") },
    ...schemaScripts.map(schema => ({
        label: schema.label,
        index: homeHtml.indexOf(`./shared/validation-schemas/${schema.filename}`)
    })),
    { label: "data manager", index: homeHtml.indexOf("./data-manager/app.js") }
];
for (let index = 1; index < homeOrderedIndexes.length; index += 1) {
    const previous = homeOrderedIndexes[index - 1];
    const current = homeOrderedIndexes[index];
    if (previous.index !== -1 && current.index !== -1 && previous.index > current.index) {
        fail(`Home loads ${current.label} before ${previous.label}`);
    }
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
    const ignoredDirectories = new Set([
        ".git",
        ".firebase",
        ".venv",
        "node_modules",
        "venv"
    ]);

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
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
