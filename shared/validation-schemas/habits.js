(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Habits schema requires JAIMIE validation and safe-content services.");
    }

    const ID_LIMIT = 128;
    const NAME_LIMIT = 200;
    const MAX_INTERVAL_DAYS = 36500;
    const DEFAULT_COLOR = "#ff8a2a";

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

    function boundedText(value, fallback, limit, path, label, issues) {
        if (value !== undefined && value !== null && typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const source = typeof value === "string" ? value : fallback;
        const unbounded = safeContent.normalizeText(source);
        if (unbounded.length > limit) {
            issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        }
        return safeContent.normalizeText(source, { maxLength: limit });
    }

    function recordId(value, mapKey, path, label, issues) {
        const source = value === undefined || value === null || value === "" ? mapKey : value;
        const normalized = boundedText(source, "", ID_LIMIT, path, `${label} ID`, issues);
        if (!normalized) issue(issues, "field.id-required", `${label} requires an ID.`, path);
        if (!value && normalized) {
            issue(issues, "field.legacy-id-derived", `${label} ID was derived from its collection key.`, path, "warning");
        }
        if (normalized && normalized !== mapKey) {
            issue(issues, "field.id-key-mismatch", `${label} ID must match its collection key.`, path);
        }
        return normalized;
    }

    function habitColor(value, path, issues) {
        const normalized = safeContent.normalizeText(value || DEFAULT_COLOR).toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(normalized)) {
            issue(issues, "habit.color.invalid", "Habit color must be a six-digit hex color.", path);
            return DEFAULT_COLOR;
        }
        return normalized;
    }

    function createdAt(value, path, issues) {
        if (isDateKey(value)) return value;
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
        if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
            issue(issues, "habit.created-at.legacy", "Habit creation date uses a legacy timestamp format.", path, "warning");
            return safeContent.normalizeText(value);
        }
        issue(issues, "habit.created-at.invalid", "Habit creation date must be a date key or timestamp.", path);
        return "";
    }

    function validateHabit(value, mapKey, issues) {
        const path = `habits.${mapKey}`;
        if (!isRecord(value)) {
            issue(issues, "habit.invalid", "Habits must be objects.", path);
            return null;
        }
        const name = boundedText(value.name, "", NAME_LIMIT, `${path}.name`, "Habit name", issues);
        if (!name) issue(issues, "habit.name-required", "Habit name is required.", `${path}.name`);
        return {
            ...value,
            id: recordId(value.id, mapKey, `${path}.id`, "Habit", issues),
            name,
            color: habitColor(value.color, `${path}.color`, issues),
            createdAt: createdAt(value.createdAt, `${path}.createdAt`, issues)
        };
    }

    function validateFood(value, mapKey, issues) {
        const path = `foodTrackers.${mapKey}`;
        if (!isRecord(value)) {
            issue(issues, "habit.food.invalid", "Tracked foods must be objects.", path);
            return null;
        }
        const name = boundedText(value.name, "", NAME_LIMIT, `${path}.name`, "Food name", issues);
        if (!name) issue(issues, "habit.food.name-required", "Food name is required.", `${path}.name`);

        const intervalDays = Number(value.intervalDays);
        if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > MAX_INTERVAL_DAYS) {
            issue(issues, "habit.food.interval.invalid", `Food interval must be a whole number from 1 to ${MAX_INTERVAL_DAYS}.`, `${path}.intervalDays`);
        }

        const lastEaten = value.lastEaten === null || value.lastEaten === undefined || value.lastEaten === ""
            ? null
            : safeContent.normalizeText(value.lastEaten);
        if (lastEaten !== null && !isDateKey(lastEaten)) {
            issue(issues, "habit.food.last-eaten.invalid", "Last-eaten date must be a real YYYY-MM-DD date.", `${path}.lastEaten`);
        }

        return {
            ...value,
            id: recordId(value.id, mapKey, `${path}.id`, "Tracked food", issues),
            name,
            intervalDays: Number.isInteger(intervalDays) && intervalDays >= 1 && intervalDays <= MAX_INTERVAL_DAYS
                ? intervalDays
                : 1,
            lastEaten
        };
    }

    function validateRecordMap(value, key, validator, issues) {
        if (!isRecord(value)) {
            issue(issues, `habit.${key}.invalid`, `${key} must be an object.`, key);
            return {};
        }
        const normalized = {};
        for (const [mapKey, record] of Object.entries(value)) {
            const safeKey = safeContent.normalizeText(mapKey, { maxLength: ID_LIMIT });
            if (!safeKey || safeKey !== mapKey) {
                issue(issues, "field.collection-key.invalid", "Collection keys must be normalized IDs of 128 characters or fewer.", `${key}.${mapKey}`);
            }
            const normalizedRecord = validator(record, safeKey || mapKey, issues);
            if (normalizedRecord) normalized[safeKey || mapKey] = normalizedRecord;
        }
        return normalized;
    }

    function validateCompletions(value, habitIds, issues) {
        if (!isRecord(value)) {
            issue(issues, "habit.completions.invalid", "Habit completions must be an object.", "completions");
            return {};
        }
        const normalized = {};
        for (const [date, bucket] of Object.entries(value)) {
            const path = `completions.${date}`;
            if (!isDateKey(date)) {
                issue(issues, "habit.completion-date.invalid", "Completion keys must be real YYYY-MM-DD dates.", path);
                continue;
            }
            if (!isRecord(bucket)) {
                issue(issues, "habit.completion-bucket.invalid", "A completion day must contain a habit map.", path);
                continue;
            }
            normalized[date] = {};
            for (const [habitId, completed] of Object.entries(bucket)) {
                const safeId = safeContent.normalizeText(habitId, { maxLength: ID_LIMIT });
                if (!safeId || safeId !== habitId) {
                    issue(issues, "habit.completion-id.invalid", "Completion habit IDs must be normalized and at most 128 characters.", `${path}.${habitId}`);
                }
                if (typeof completed !== "boolean") {
                    issue(issues, "habit.completion-value.invalid", "Habit completion must be true or false.", `${path}.${habitId}`);
                }
                if (safeId && !habitIds.has(safeId)) {
                    issue(issues, "habit.completion.orphaned", "Completion references a habit that is no longer present.", `${path}.${habitId}`, "warning");
                }
                if (safeId) normalized[date][safeId] = Boolean(completed);
            }
        }
        return normalized;
    }

    function validateHabits(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "habit.dataset.invalid", "Habits data must be an object.", "");
            return { value: {}, issues };
        }

        const habits = validateRecordMap(value.habits, "habits", validateHabit, issues);
        const foodTrackers = validateRecordMap(value.foodTrackers, "foodTrackers", validateFood, issues);
        const completions = validateCompletions(value.completions, new Set(Object.keys(habits)), issues);

        return {
            value: {
                ...value,
                habits,
                foodTrackers,
                completions
            },
            issues
        };
    }

    validation.register("habits", validateHabits);
})();
