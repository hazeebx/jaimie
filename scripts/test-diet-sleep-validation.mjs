globalThis.window = globalThis;

import { readFileSync } from "node:fs";

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/diet.js");
await import("../shared/validation-schemas/sleep.js");

const validation = globalThis.JAIMIEValidation;

const diet = {
    futureRootField: { version: 2 },
    targets: { calories: 2400, protein: 160, carbs: 300, fat: 70, water: 2.5, fiber: 30 },
    foods: [{
        id: "food-1",
        name: "  Chicken breast  ",
        serving: 100,
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        preparation: "grilled"
    }],
    days: {
        "2026-09-08": {
            id: "day:2026-09-08",
            water: 1000,
            mood: "good",
            meals: [{
                id: "meal-1",
                name: "Lunch",
                time: "13:30",
                location: "home",
                items: [{
                    id: "item-1",
                    name: "Chicken breast",
                    amount: 150,
                    calories: 247.5,
                    protein: 46.5,
                    sourceFoodId: "food-1"
                }]
            }]
        }
    }
};

const validDiet = validation.validate("diet", diet, { source: "test" });
if (!validDiet.valid || validDiet.issues.length) throw new Error("A current Diet dataset failed validation.");
if (
    validDiet.value.futureRootField?.version !== 2 ||
    validDiet.value.targets.fiber !== 30 ||
    validDiet.value.foods[0].preparation !== "grilled" ||
    validDiet.value.days["2026-09-08"].mood !== "good" ||
    validDiet.value.days["2026-09-08"].meals[0].location !== "home" ||
    validDiet.value.days["2026-09-08"].meals[0].items[0].sourceFoodId !== "food-1"
) {
    throw new Error("Diet normalization discarded forward-compatible fields.");
}
if (validDiet.value.foods[0].name !== "Chicken breast") throw new Error("Diet text normalization did not run.");

const invalidDiet = validation.validate("diet", {
    targets: { calories: -1, protein: 1, carbs: 1, fat: 1, water: 1 },
    foods: [
        { id: "same", name: "", serving: 0 },
        { id: "same", name: "Second", serving: 100 }
    ],
    days: {
        "bad-date": {},
        "2026-09-08": {
            id: "wrong",
            water: -1,
            meals: [{ id: "meal", name: "", time: "25:00", items: [{ id: "item", name: "", amount: 0 }] }]
        }
    }
});
const dietCodes = new Set(invalidDiet.issues.map(issue => issue.code));
for (const code of [
    "field.invalid-number", "field.required", "field.duplicate-id",
    "diet.day-key.invalid", "diet.day.id-mismatch", "diet.meal.time.invalid"
]) {
    if (!dietCodes.has(code)) throw new Error(`Missing Diet validation issue: ${code}`);
}
if (validation.inspect("diet", invalidDiet, { mode: "compatibility" }).value !== invalidDiet) {
    throw new Error("Diet compatibility mode changed existing data.");
}

const sleep = {
    futureRootField: true,
    days: {
        "2026-09-08": {
            date: "2026-09-08",
            bedtime: "23:15",
            wakeTime: "07:00",
            duration: 465,
            fellAsleep: "Normally",
            rested: true,
            dreamNotes: "preserve"
        }
    }
};
const validSleep = validation.validate("sleep", sleep, { source: "test" });
if (!validSleep.valid || validSleep.issues.length) throw new Error("A current Sleep dataset failed validation.");
if (validSleep.value.futureRootField !== true || validSleep.value.days["2026-09-08"].dreamNotes !== "preserve") {
    throw new Error("Sleep normalization discarded forward-compatible fields.");
}

const sleepHtml = readFileSync(new URL("../sleep_tracker/index.html", import.meta.url), "utf8");
const sleepApp = readFileSync(new URL("../sleep_tracker/app.js", import.meta.url), "utf8");
for (const retiredField of ["quality", "wakeups", "avgQuality"]) {
    if (sleepHtml.includes(`id="${retiredField}"`) || sleepApp.includes(`$("${retiredField}")`)) {
        throw new Error(`Retired Sleep field remains wired into the UI: ${retiredField}`);
    }
}

const legacySleep = validation.validate("sleep", {
    days: {
        "2026-09-08": {
            date: "2026-09-08",
            bedtime: "",
            wakeTime: "",
            duration: null,
            quality: 5,
            fellAsleep: "Easily",
            wakeups: 0,
            rested: false
        }
    }
});
if (!legacySleep.valid || !legacySleep.issues.some(issue => issue.code === "sleep.time.legacy-missing")) {
    throw new Error("Supported legacy Sleep entries were not handled as warnings.");
}
if (
    legacySleep.value.days["2026-09-08"].quality !== 5 ||
    legacySleep.value.days["2026-09-08"].wakeups !== 0
) {
    throw new Error("Retired Sleep fields were not preserved for legacy records.");
}

const invalidSleep = validation.validate("sleep", {
    days: {
        "bad-date": {},
        "2026-09-08": {
            date: "2026-09-07",
            bedtime: "29:00",
            wakeTime: "07:00",
            duration: 2000,
            quality: 11,
            fellAsleep: "Instantly",
            wakeups: -1,
            rested: "yes"
        }
    }
});
const sleepCodes = new Set(invalidSleep.issues.map(issue => issue.code));
for (const code of [
    "sleep.day-key.invalid", "sleep.date.invalid", "sleep.time.invalid",
    "field.invalid-number", "sleep.fell-asleep.invalid", "field.wrong-type"
]) {
    if (!sleepCodes.has(code)) throw new Error(`Missing Sleep validation issue: ${code}`);
}
if (validation.inspect("sleep", invalidSleep, { mode: "compatibility" }).value !== invalidSleep) {
    throw new Error("Sleep compatibility mode changed existing data.");
}

console.log("Diet/Sleep schemas passed: nested records, legacy entries, malformed values, and future fields behave correctly.");
