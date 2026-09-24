(() => {
    "use strict";

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function intensityLevel(completedSets) {
        const sets = Number(completedSets) || 0;
        if (sets >= 9) return 4;
        if (sets >= 6) return 3;
        if (sets >= 3) return 2;
        if (sets >= 1) return 1;
        return 0;
    }

    function summarizeDay(day) {
        const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
        let completedSets = 0;
        let completedReps = 0;
        let completedExercises = 0;

        for (const exercise of exercises) {
            const completed = (Array.isArray(exercise?.sets) ? exercise.sets : [])
                .filter(set => set?.done === true);
            if (completed.length) completedExercises += 1;
            completedSets += completed.length;
            completedReps += completed.reduce((total, set) => total + Math.max(0, Number(set.reps) || 0), 0);
        }

        return {
            completedSets,
            completedReps,
            completedExercises,
            level: intensityLevel(completedSets),
            rest: day?.rest === true
        };
    }

    function build(days, { endDate = new Date(), length = 365 } = {}) {
        const safeDays = days && typeof days === "object" && !Array.isArray(days) ? days : {};
        const count = Math.max(1, Math.min(366, Number(length) || 365));
        const end = new Date(endDate);
        end.setHours(12, 0, 0, 0);
        const start = new Date(end);
        start.setDate(start.getDate() - (count - 1));

        return Array.from({ length: count }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const key = dateKey(date);
            return {
                date: key,
                weekday: date.getDay(),
                ...summarizeDay(safeDays[key])
            };
        });
    }

    window.JAIMIEWorkoutHistory = Object.freeze({ dateKey, intensityLevel, summarizeDay, build });
})();
