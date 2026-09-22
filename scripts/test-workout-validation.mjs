globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/workout.js");

const validation = globalThis.JAIMIEValidation;
const current = {
    selectedDate: "2026-09-08",
    futureRootField: { enabled: true },
    days: {
        "2026-09-08": {
            rest: false,
            futureDayField: "preserve me",
            exercises: [{
                id: "exercise-1",
                name: "  Back Squat  ",
                targetReps: 5,
                equipment: "barbell",
                sets: [{ reps: 5, done: true, rpe: 8 }]
            }]
        }
    },
    workouts: [{
        id: "workout-1",
        name: "Strength",
        futureTemplateField: 42,
        exercises: [{ name: "Back Squat", sets: 3, reps: 5, tempo: "3010" }]
    }],
    personalRecords: [{
        id: "pr-1",
        lift: "Back Squat",
        reps: 1,
        weight: 180,
        unit: "kg",
        date: "2026-09-08",
        federation: "local"
    }]
};

const valid = validation.validate("workout", current, { source: "test" });
if (!valid.valid || valid.issues.length) throw new Error("A current Workout dataset failed validation.");
if (
    valid.value.futureRootField?.enabled !== true ||
    valid.value.days["2026-09-08"].futureDayField !== "preserve me" ||
    valid.value.days["2026-09-08"].exercises[0].equipment !== "barbell" ||
    valid.value.workouts[0].exercises[0].tempo !== "3010" ||
    valid.value.personalRecords[0].federation !== "local"
) {
    throw new Error("Workout normalization discarded forward-compatible fields.");
}
if (valid.value.days["2026-09-08"].exercises[0].name !== "Back Squat") {
    throw new Error("Workout text normalization did not run.");
}

const legacy = validation.validate("workout", {
    selectedDate: "2026-09-08",
    days: { "2026-09-08": { rest: false, exercises: [{ name: "Push-up", targetReps: 10, sets: [{ reps: 10, done: false }] }] } },
    workouts: [],
    personalRecords: []
});
if (!legacy.valid || !legacy.issues.some(issue => issue.code === "field.legacy-id-missing" && issue.severity === "warning")) {
    throw new Error("Supported legacy Workout records were not handled as warnings.");
}

const invalid = validation.validate("workout", {
    selectedDate: "2026-02-30",
    days: {
        "not-a-date": {},
        "2026-09-08": {
            rest: "no",
            exercises: [
                { id: "duplicate", name: "", targetReps: -1, sets: [{ reps: "lots", done: "yes" }] },
                { id: "duplicate", name: "Squat", targetReps: 5, sets: [] }
            ]
        }
    },
    workouts: [{ id: "same", name: "A", exercises: [] }, { id: "same", name: "B", exercises: [] }],
    personalRecords: [{ id: "pr", lift: "Squat", reps: 2, weight: 0, unit: "stone", date: "2026-13-01" }]
});

const codes = new Set(invalid.issues.map(issue => issue.code));
for (const code of [
    "workout.selected-date.invalid",
    "workout.day-key.invalid",
    "field.wrong-type",
    "field.required",
    "field.invalid-number",
    "field.duplicate-id",
    "workout.pr.invalid-type",
    "workout.pr.invalid-unit",
    "workout.pr.invalid-date"
]) {
    if (!codes.has(code)) throw new Error(`Missing Workout validation issue: ${code}`);
}

const compatible = validation.inspect("workout", invalid, { mode: "compatibility", source: "test" });
if (compatible.value !== invalid) throw new Error("Workout compatibility mode changed existing data.");

console.log("Workout schema passed: current, legacy, malformed, nested, and future-extension records behave correctly.");
