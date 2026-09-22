(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) throw new Error("Journal schema requires JAIMIE validation and safe-content services.");

    const TEXT_LIMIT = 100000;

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

    function text(value, path, label, issues) {
        if (value === undefined || value === null) return "";
        if (typeof value !== "string") issue(issues, "field.wrong-type", `${label} must be text.`, path);
        const source = typeof value === "string" ? value : "";
        if (safeContent.normalizeText(source).length > TEXT_LIMIT) {
            issue(issues, "field.too-long", `${label} cannot exceed ${TEXT_LIMIT} characters.`, path);
        }
        return safeContent.normalizeText(source, { trim: false, maxLength: TEXT_LIMIT });
    }

    function validateEntry(value, dateKey, issues) {
        const path = `entries.${dateKey}`;
        if (!isRecord(value)) {
            issue(issues, "journal.entry.invalid", "Journal entries must be objects.", path);
            return null;
        }

        const entryDate = value.date === undefined || value.date === null || value.date === ""
            ? dateKey
            : String(value.date);
        if (value.date === undefined || value.date === null || value.date === "") {
            issue(issues, "field.legacy-date-derived", "Journal entry date was derived from its collection key.", `${path}.date`, "warning");
        } else if (entryDate !== dateKey) {
            issue(issues, "journal.entry.date-mismatch", "Journal entry date must match its date key.", `${path}.date`);
        }

        const normalized = { ...value, date: entryDate };
        for (const field of ["howDay", "tomorrow", "whatHappened", "thinking", "grateful"]) {
            if (Object.hasOwn(value, field)) normalized[field] = text(value[field], `${path}.${field}`, field, issues);
        }
        if (value.updatedAt !== undefined && value.updatedAt !== null && value.updatedAt !== "") {
            const timestamp = String(value.updatedAt);
            if (Number.isNaN(Date.parse(timestamp))) issue(issues, "field.invalid-timestamp", "Updated time must be an ISO timestamp.", `${path}.updatedAt`);
            normalized.updatedAt = timestamp;
        }
        return normalized;
    }

    function validateJournal(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "journal.dataset.invalid", "Journal data must be an object.", "");
            return { value: { entries: {} }, issues };
        }
        if (!isRecord(value.entries)) issue(issues, "journal.entries.invalid", "Journal entries must be an object keyed by date.", "entries");
        const entries = {};
        for (const [dateKey, entry] of Object.entries(isRecord(value.entries) ? value.entries : {})) {
            if (!isDateKey(dateKey)) {
                issue(issues, "journal.entry-key.invalid", "Journal entry keys must be real YYYY-MM-DD dates.", `entries.${dateKey}`);
                continue;
            }
            const normalized = validateEntry(entry, dateKey, issues);
            if (normalized) entries[dateKey] = normalized;
        }
        return { value: { ...value, entries }, issues };
    }

    validation.register("journal", validateJournal);
})();
