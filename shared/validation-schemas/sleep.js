(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Sleep schema requires JAIMIE validation and safe-content services.");
    }

    const FELL_ASLEEP_VALUES = new Set(["Easily", "Normally", "With difficulty"]);

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

    function time(value, path, label, issues) {
        const normalized = safeContent.normalizeText(value || "");
        if (!normalized) {
            issue(issues, "sleep.time.legacy-missing", `${label} is missing from a legacy entry.`, path, "warning");
        } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
            issue(issues, "sleep.time.invalid", `${label} must use 24-hour HH:MM format.`, path);
        }
        return normalized;
    }

    function number(value, fallback, min, max, path, label, issues, { integer = false, nullable = false } = {}) {
        if (nullable && (value === null || value === undefined || value === "")) return null;
        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < min || normalized > max || (integer && !Number.isInteger(normalized))) {
            issue(issues, "field.invalid-number", `${label} must be a valid number from ${min} to ${max}.`, path);
            return fallback;
        }
        return normalized;
    }

    function validateEntry(value, dateKey, issues) {
        const path = `days.${dateKey}`;
        if (!isRecord(value)) {
            issue(issues, "sleep.entry.invalid", "Sleep entries must be objects.", path);
            return null;
        }

        const date = safeContent.normalizeText(value.date || dateKey);
        if (!value.date) issue(issues, "sleep.date.legacy-derived", "Sleep entry date was derived from its collection key.", `${path}.date`, "warning");
        if (!isDateKey(date) || date !== dateKey) issue(issues, "sleep.date.invalid", "Sleep entry date must match its date key.", `${path}.date`);

        const fellAsleep = safeContent.normalizeText(value.fellAsleep || "Easily", { maxLength: 50 });
        if (!FELL_ASLEEP_VALUES.has(fellAsleep)) {
            issue(issues, "sleep.fell-asleep.invalid", "Fell-asleep value is not currently supported.", `${path}.fellAsleep`);
        }
        if (typeof value.rested !== "boolean") issue(issues, "field.wrong-type", "Rested must be true or false.", `${path}.rested`);

        return {
            ...value,
            date,
            bedtime: time(value.bedtime, `${path}.bedtime`, "Bedtime", issues),
            wakeTime: time(value.wakeTime, `${path}.wakeTime`, "Wake time", issues),
            duration: number(value.duration, null, 0, 1440, `${path}.duration`, "Sleep duration", issues, { integer: true, nullable: true }),
            quality: number(value.quality, 5, 1, 10, `${path}.quality`, "Sleep quality", issues, { integer: true }),
            fellAsleep: FELL_ASLEEP_VALUES.has(fellAsleep) ? fellAsleep : "Easily",
            wakeups: number(value.wakeups, 0, 0, 1000, `${path}.wakeups`, "Wake-ups", issues, { integer: true }),
            rested: Boolean(value.rested)
        };
    }

    function validateSleep(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "sleep.dataset.invalid", "Sleep data must be an object.", "");
            return { value: {}, issues };
        }
        if (!isRecord(value.days)) issue(issues, "sleep.days.invalid", "Sleep days must be an object.", "days");
        const days = {};
        for (const [date, entry] of Object.entries(isRecord(value.days) ? value.days : {})) {
            if (!isDateKey(date)) {
                issue(issues, "sleep.day-key.invalid", "Sleep day keys must be real YYYY-MM-DD dates.", `days.${date}`);
                continue;
            }
            const normalizedEntry = validateEntry(entry, date, issues);
            if (normalizedEntry) days[date] = normalizedEntry;
        }
        return { value: { ...value, days }, issues };
    }

    validation.register("sleep", validateSleep);
})();
