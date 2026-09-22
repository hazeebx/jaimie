(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Event Countdown schema requires JAIMIE validation and safe-content services.");
    }

    const ID_LIMIT = 128;
    const NAME_LIMIT = 80;
    const DEFAULT_COLOR = "#ff9d45";

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

    function boundedText(value, limit, path, label, issues) {
        if (typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const source = typeof value === "string" ? value : "";
        const normalized = safeContent.normalizeText(source);
        if (normalized.length > limit) {
            issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        }
        return safeContent.normalizeText(source, { maxLength: limit });
    }

    function timestamp(value, path, label, issues, { required = false } = {}) {
        if (value === undefined || value === null || value === "") {
            if (required) {
                issue(
                    issues,
                    "event.timestamp.legacy-missing",
                    `${label} is missing; JAIMIE will use the event date as a display fallback.`,
                    path,
                    "warning"
                );
            }
            return null;
        }
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            issue(issues, "event.timestamp.legacy-number", `${label} uses a legacy numeric timestamp.`, path, "warning");
            return value;
        }
        const normalized = safeContent.normalizeText(value);
        if (typeof value !== "string" || Number.isNaN(Date.parse(normalized))) {
            issue(issues, "event.timestamp.invalid", `${label} must be a valid timestamp.`, path);
            return null;
        }
        return normalized;
    }

    function eventId(value, path, issues) {
        if (value === undefined || value === null || value === "") {
            issue(issues, "event.id.legacy-missing", "Countdown event has no ID; edit or resave it before strict enforcement.", path, "warning");
            return "";
        }
        return boundedText(value, ID_LIMIT, path, "Event ID", issues);
    }

    function validateEvent(value, index, issues) {
        const path = `[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "event.invalid", "Countdown events must be objects.", path);
            return null;
        }

        const id = eventId(value.id, `${path}.id`, issues);

        const name = boundedText(value.name, NAME_LIMIT, `${path}.name`, "Event name", issues);
        if (!name) issue(issues, "event.name-required", "Event name is required.", `${path}.name`);

        const date = safeContent.normalizeText(value.date || "");
        if (!isDateKey(date)) {
            issue(issues, "event.date.invalid", "Event date must be a real YYYY-MM-DD date.", `${path}.date`);
        }

        const color = safeContent.normalizeText(value.color || DEFAULT_COLOR).toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(color)) {
            issue(issues, "event.color.invalid", "Event color must be a six-digit hex color.", `${path}.color`);
        }

        return {
            ...value,
            id,
            name,
            date,
            color: /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_COLOR,
            createdAt: timestamp(value.createdAt, `${path}.createdAt`, "Creation timestamp", issues, { required: true }),
            ...(value.updatedAt !== undefined
                ? { updatedAt: timestamp(value.updatedAt, `${path}.updatedAt`, "Update timestamp", issues) }
                : {})
        };
    }

    function validateEventCountdown(value) {
        const issues = [];
        if (!Array.isArray(value)) {
            issue(issues, "event.dataset.invalid", "Event Countdown data must be an array.", "");
            return { value: [], issues };
        }

        const normalized = value
            .map((event, index) => validateEvent(event, index, issues))
            .filter(Boolean);
        const ids = new Set();
        normalized.forEach((event, index) => {
            if (!event.id) return;
            if (ids.has(event.id)) {
                issue(issues, "event.id.duplicate", "Countdown event IDs must be unique.", `[${index}].id`);
            }
            ids.add(event.id);
        });

        return { value: normalized, issues };
    }

    validation.register("event-countdown", validateEventCountdown);
})();
