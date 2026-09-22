(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Workout schema requires JAIMIE validation and safe-content services.");
    }

    const ID_LIMIT = 128;
    const NAME_LIMIT = 200;
    const MAX_REPS = 100000;
    const MAX_SETS = 1000;
    const MAX_WEIGHT = 1000000;
    const PR_REPS = new Set([1, 3, 5]);
    const PR_UNITS = new Set(["kg", "lb"]);

    function issue(issues, code, message, path, severity = "error") {
        issues.push({ code, message, path, severity });
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function isDateKey(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    function text(value, fallback, limit, path, label, issues) {
        if (value !== undefined && value !== null && typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const normalized = safeContent.normalizeText(
            typeof value === "string" ? value : fallback,
            { maxLength: limit }
        );
        if (typeof value === "string" && safeContent.normalizeText(value).length > limit) {
            issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        }
        return normalized;
    }

    function requiredText(value, limit, path, label, issues) {
        const normalized = text(value, "", limit, path, label, issues);
        if (!normalized) issue(issues, "field.required", `${label} is required.`, path);
        return normalized;
    }

    function id(value, path, label, issues) {
        const normalized = text(value, "", ID_LIMIT, path, `${label} ID`, issues);
        if (!normalized) {
            issue(
                issues,
                "field.legacy-id-missing",
                `${label} has no ID; edit or resave it before strict enforcement.`,
                path,
                "warning"
            );
        }
        return normalized;
    }

    function number(value, fallback, { min, max, integer = false }, path, label, issues) {
        const normalized = Number(value);
        if (
            value === "" || value === null || value === undefined ||
            !Number.isFinite(normalized) ||
            normalized < min || normalized > max ||
            (integer && !Number.isInteger(normalized))
        ) {
            issue(issues, "field.invalid-number", `${label} must be a valid number from ${min} to ${max}.`, path);
            return fallback;
        }
        return normalized;
    }

    function boolean(value, fallback, path, label, issues) {
        if (typeof value !== "boolean") {
            issue(issues, "field.wrong-type", `${label} must be true or false.`, path);
            return fallback;
        }
        return value;
    }

    function validateSet(value, path, issues) {
        if (!isRecord(value)) {
            issue(issues, "workout.set.invalid", "Workout sets must be objects.", path);
            return null;
        }
        return {
            ...value,
            reps: number(value.reps, 0, { min: 0, max: MAX_REPS, integer: true }, `${path}.reps`, "Set reps", issues),
            done: boolean(value.done, false, `${path}.done`, "Set completion", issues)
        };
    }

    function validateExercise(value, path, issues) {
        if (!isRecord(value)) {
            issue(issues, "workout.exercise.invalid", "Exercises must be objects.", path);
            return null;
        }
        if (!Array.isArray(value.sets)) {
            issue(issues, "workout.sets.invalid", "Exercise sets must be an array.", `${path}.sets`);
        }
        return {
            ...value,
            id: id(value.id, `${path}.id`, "Exercise", issues),
            name: requiredText(value.name, NAME_LIMIT, `${path}.name`, "Exercise name", issues),
            targetReps: number(value.targetReps, 0, { min: 0, max: MAX_REPS, integer: true }, `${path}.targetReps`, "Target reps", issues),
            sets: (Array.isArray(value.sets) ? value.sets : [])
                .map((set, index) => validateSet(set, `${path}.sets[${index}]`, issues))
                .filter(Boolean)
        };
    }

    function validateDay(value, date, issues) {
        const path = `days.${date}`;
        if (!isRecord(value)) {
            issue(issues, "workout.day.invalid", "Workout days must be objects.", path);
            return null;
        }
        if (!Array.isArray(value.exercises)) {
            issue(issues, "workout.exercises.invalid", "Daily exercises must be an array.", `${path}.exercises`);
        }
        const exercises = (Array.isArray(value.exercises) ? value.exercises : [])
            .map((exercise, index) => validateExercise(exercise, `${path}.exercises[${index}]`, issues))
            .filter(Boolean);
        reportDuplicateIds(exercises, `${path}.exercises`, "Exercise", issues);
        return {
            ...value,
            rest: boolean(value.rest, false, `${path}.rest`, "Rest day", issues),
            exercises
        };
    }

    function validateTemplateExercise(value, path, issues) {
        if (!isRecord(value)) {
            issue(issues, "workout.template-exercise.invalid", "Template exercises must be objects.", path);
            return null;
        }
        return {
            ...value,
            name: requiredText(value.name, NAME_LIMIT, `${path}.name`, "Template exercise name", issues),
            sets: number(value.sets, 1, { min: 1, max: MAX_SETS, integer: true }, `${path}.sets`, "Template sets", issues),
            reps: number(value.reps, 0, { min: 0, max: MAX_REPS, integer: true }, `${path}.reps`, "Template reps", issues)
        };
    }

    function validateTemplate(value, index, issues) {
        const path = `workouts[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "workout.template.invalid", "Saved workouts must be objects.", path);
            return null;
        }
        if (!Array.isArray(value.exercises)) {
            issue(issues, "workout.template-exercises.invalid", "Saved workout exercises must be an array.", `${path}.exercises`);
        }
        return {
            ...value,
            id: id(value.id, `${path}.id`, "Saved workout", issues),
            name: requiredText(value.name, NAME_LIMIT, `${path}.name`, "Workout name", issues),
            exercises: (Array.isArray(value.exercises) ? value.exercises : [])
                .map((exercise, exerciseIndex) => validateTemplateExercise(exercise, `${path}.exercises[${exerciseIndex}]`, issues))
                .filter(Boolean)
        };
    }

    function validatePersonalRecord(value, index, issues) {
        const path = `personalRecords[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "workout.pr.invalid", "Personal records must be objects.", path);
            return null;
        }
        const reps = Number(value.reps);
        if (!PR_REPS.has(reps)) {
            issue(issues, "workout.pr.invalid-type", "A personal record must be 1RM, 3RM, or 5RM.", `${path}.reps`);
        }
        const unit = safeContent.normalizeText(value.unit || "kg").toLowerCase();
        if (!PR_UNITS.has(unit)) {
            issue(issues, "workout.pr.invalid-unit", "Personal record unit must be kg or lb.", `${path}.unit`);
        }
        const date = safeContent.normalizeText(value.date || "");
        if (!isDateKey(date)) {
            issue(issues, "workout.pr.invalid-date", "Personal record date must be a real YYYY-MM-DD date.", `${path}.date`);
        }
        return {
            ...value,
            id: id(value.id, `${path}.id`, "Personal record", issues),
            lift: requiredText(value.lift, NAME_LIMIT, `${path}.lift`, "Lift name", issues),
            reps: PR_REPS.has(reps) ? reps : 1,
            weight: number(value.weight, 0, { min: 0.1, max: MAX_WEIGHT }, `${path}.weight`, "PR weight", issues),
            unit: PR_UNITS.has(unit) ? unit : "kg",
            date
        };
    }

    function reportDuplicateIds(values, path, label, issues) {
        const seen = new Set();
        values.forEach((value, index) => {
            if (!value?.id) return;
            if (seen.has(value.id)) {
                issue(issues, "field.duplicate-id", `${label} IDs must be unique.`, `${path}[${index}].id`);
            }
            seen.add(value.id);
        });
    }

    function validateWorkout(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "workout.dataset.invalid", "Workout data must be an object.", "");
            return { value: {}, issues };
        }

        const selectedDate = safeContent.normalizeText(value.selectedDate || "");
        if (!isDateKey(selectedDate)) {
            issue(issues, "workout.selected-date.invalid", "Selected workout date must be a real YYYY-MM-DD date.", "selectedDate");
        }

        if (!isRecord(value.days)) issue(issues, "workout.days.invalid", "Workout days must be an object.", "days");
        const days = {};
        for (const [date, day] of Object.entries(isRecord(value.days) ? value.days : {})) {
            if (!isDateKey(date)) {
                issue(issues, "workout.day-key.invalid", "Workout day keys must be real YYYY-MM-DD dates.", `days.${date}`);
                continue;
            }
            const normalizedDay = validateDay(day, date, issues);
            if (normalizedDay) days[date] = normalizedDay;
        }

        if (!Array.isArray(value.workouts)) issue(issues, "workout.templates.invalid", "Saved workouts must be an array.", "workouts");
        const workouts = (Array.isArray(value.workouts) ? value.workouts : [])
            .map((workout, index) => validateTemplate(workout, index, issues))
            .filter(Boolean);
        reportDuplicateIds(workouts, "workouts", "Saved workout", issues);

        if (!Array.isArray(value.personalRecords)) issue(issues, "workout.prs.invalid", "Personal records must be an array.", "personalRecords");
        const personalRecords = (Array.isArray(value.personalRecords) ? value.personalRecords : [])
            .map((record, index) => validatePersonalRecord(record, index, issues))
            .filter(Boolean);
        reportDuplicateIds(personalRecords, "personalRecords", "Personal record", issues);

        return {
            value: {
                ...value,
                selectedDate,
                days,
                workouts,
                personalRecords
            },
            issues
        };
    }

    validation.register("workout", validateWorkout);
})();
