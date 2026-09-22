globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/habits.js");

const validation = globalThis.JAIMIEValidation;
const current = {
    futureRootField: { version: 2 },
    habits: {
        "habit-1": {
            id: "habit-1",
            name: "  Multi-vitamin  ",
            color: "#FF8A2A",
            createdAt: "2026-09-01",
            futureHabitField: "daily-dose"
        }
    },
    foodTrackers: {
        "food-1": {
            id: "food-1",
            name: "Spinach",
            intervalDays: 10,
            lastEaten: "2026-09-05",
            futureFoodField: true
        }
    },
    completions: {
        "2026-09-08": { "habit-1": true }
    }
};

const valid = validation.validate("habits", current, { source: "test" });
if (!valid.valid || valid.issues.length) throw new Error("A current Habits dataset failed validation.");
if (
    valid.value.futureRootField?.version !== 2 ||
    valid.value.habits["habit-1"].futureHabitField !== "daily-dose" ||
    valid.value.foodTrackers["food-1"].futureFoodField !== true
) {
    throw new Error("Habits normalization discarded forward-compatible fields.");
}
if (valid.value.habits["habit-1"].name !== "Multi-vitamin" || valid.value.habits["habit-1"].color !== "#ff8a2a") {
    throw new Error("Habit text/color normalization did not run.");
}

const legacy = validation.validate("habits", {
    habits: { legacy: { name: "Walk", color: "#123456", createdAt: "2026-09-01" } },
    foodTrackers: {},
    completions: {}
});
if (!legacy.valid || !legacy.issues.some(issue => issue.code === "field.legacy-id-derived" && issue.severity === "warning")) {
    throw new Error("Supported legacy Habit IDs were not treated as warnings.");
}

const invalid = validation.validate("habits", {
    habits: {
        bad: { id: "different", name: "", color: "orange", createdAt: "yesterday" }
    },
    foodTrackers: {
        food: { id: "food", name: "", intervalDays: 0, lastEaten: "2026-02-30" }
    },
    completions: {
        "not-a-date": {},
        "2026-09-08": { bad: "yes", missing: true }
    }
});
const codes = new Set(invalid.issues.map(issue => issue.code));
for (const code of [
    "field.id-key-mismatch",
    "habit.name-required",
    "habit.color.invalid",
    "habit.created-at.invalid",
    "habit.food.name-required",
    "habit.food.interval.invalid",
    "habit.food.last-eaten.invalid",
    "habit.completion-date.invalid",
    "habit.completion-value.invalid",
    "habit.completion.orphaned"
]) {
    if (!codes.has(code)) throw new Error(`Missing Habits validation issue: ${code}`);
}

const compatible = validation.inspect("habits", invalid, { mode: "compatibility", source: "test" });
if (compatible.value !== invalid) throw new Error("Habits compatibility mode changed existing data.");

console.log("Habits schema passed: habits, 1-year history, food recency, legacy data, and future fields behave correctly.");
