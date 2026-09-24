globalThis.window = globalThis;

await import("../workout-tracker/workout-history.js");

const history = globalThis.JAIMIEWorkoutHistory;
const summary = history.summarizeDay({
    rest: false,
    exercises: [
        { sets: [{ reps: 10, done: true }, { reps: 8, done: true }, { reps: 8, done: false }] },
        { sets: [{ reps: 5, done: true }, { reps: 5, done: false }] }
    ]
});

if (summary.completedSets !== 3 || summary.completedReps !== 23 || summary.completedExercises !== 2 || summary.level !== 2) {
    throw new Error("Workout history did not summarize completed work correctly.");
}

const days = {
    "2026-09-20": { rest: true, exercises: [] },
    "2026-09-21": { rest: false, exercises: [{ sets: Array.from({ length: 9 }, () => ({ reps: 5, done: true })) }] }
};
const result = history.build(days, { endDate: new Date("2026-09-22T12:00:00"), length: 365 });
if (result.length !== 365 || result[0].date !== "2025-09-23" || result.at(-1).date !== "2026-09-22") {
    throw new Error("Workout history did not create the requested one-year date range.");
}
if (!result.find(item => item.date === "2026-09-20")?.rest) throw new Error("Workout history lost a rest day.");
if (result.find(item => item.date === "2026-09-21")?.level !== 4) throw new Error("High-intensity workout level was incorrect.");
if (history.intensityLevel(0) !== 0 || history.intensityLevel(1) !== 1 || history.intensityLevel(3) !== 2 || history.intensityLevel(6) !== 3 || history.intensityLevel(9) !== 4) {
    throw new Error("Workout intensity thresholds changed unexpectedly.");
}

console.log("Workout history passed: 365-day range, completed-set intensity, reps, exercises, and rest days are correct.");
