(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation) {
        throw new Error("Calendar/Reminder schemas require the JAIMIE validation service.");
    }
    if (!safeContent) {
        throw new Error("Calendar/Reminder schemas require the JAIMIE safe-content service.");
    }

    const NOTIFICATION_MINUTES = new Set([0, 5, 10, 15]);
    const TITLE_LIMIT = 200;
    const NOTE_LIMIT = 5000;
    const ID_LIMIT = 128;

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

    function isTime(value) {
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    }

    function text(value, fallback = "") {
        return typeof value === "string"
            ? safeContent.normalizeText(value)
            : safeContent.normalizeText(fallback);
    }

    function boundedText(value, fallback, limit, path, label, issues) {
        if (value !== undefined && value !== null && typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const normalized = text(value, fallback);
        if (normalized.length > limit) {
            issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        }
        return safeContent.normalizeText(normalized, { maxLength: limit });
    }

    function optionalId(value, path, label, issues) {
        if (value === undefined || value === null || value === "") return null;
        return boundedText(value, "", ID_LIMIT, path, label, issues) || null;
    }

    function requiredId(value, path, label, issues, { legacyWarning = false } = {}) {
        const normalized = boundedText(value, "", ID_LIMIT, path, label, issues);
        if (!normalized) {
            issue(
                issues,
                "field.id-required",
                `${label} is missing an ID.`,
                path,
                legacyWarning ? "warning" : "error"
            );
        }
        return normalized;
    }

    function timestamp(value, path, label, issues) {
        if (value === undefined || value === null || value === "") return 0;
        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < 0) {
            issue(issues, "field.invalid-timestamp", `${label} must be a valid timestamp.`, path);
            return 0;
        }
        return normalized;
    }

    function notificationMinutes(value, path, issues) {
        if (value === undefined || value === null || value === "off") return null;
        const normalized = Number(value);
        if (!NOTIFICATION_MINUTES.has(normalized)) {
            issue(issues, "notification.invalid-offset", "Notification timing must be 0, 5, 10, or 15 minutes before.", path);
            return null;
        }
        return normalized;
    }

    function validateCalendarTask(value, index, issues) {
        const basePath = `[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "calendar.task.invalid", "Calendar tasks must be objects.", basePath);
            return null;
        }

        const id = requiredId(value.id, `${basePath}.id`, "Calendar task", issues);
        const title = boundedText(value.title, "", TITLE_LIMIT, `${basePath}.title`, "Task title", issues);
        if (!title) issue(issues, "calendar.title-required", "Task title is required.", `${basePath}.title`);

        const date = text(value.date);
        if (!isDateKey(date)) {
            issue(issues, "calendar.invalid-date", "Task date must be a real date in YYYY-MM-DD format.", `${basePath}.date`);
        }

        const time = text(value.time);
        if (time && !isTime(time)) {
            issue(issues, "calendar.invalid-time", "Task time must use 24-hour HH:MM format.", `${basePath}.time`);
        }

        const notifyMinutes = notificationMinutes(value.notifyMinutes, `${basePath}.notifyMinutes`, issues);
        if (notifyMinutes !== null && !isTime(time)) {
            issue(issues, "notification.time-required", "A valid time is required when notifications are enabled.", `${basePath}.time`);
        }

        if (value.completed !== undefined && typeof value.completed !== "boolean") {
            issue(issues, "calendar.completed.wrong-type", "Task completion must be true or false.", `${basePath}.completed`);
        }

        return {
            ...value,
            id,
            title,
            date,
            time,
            category: boundedText(value.category, "Personal", 50, `${basePath}.category`, "Task category", issues),
            notes: boundedText(value.notes, "", NOTE_LIMIT, `${basePath}.notes`, "Task notes", issues),
            notifyMinutes,
            linkedReminderId: optionalId(value.linkedReminderId, `${basePath}.linkedReminderId`, "Linked reminder ID", issues),
            completed: Boolean(value.completed),
            createdAt: timestamp(value.createdAt, `${basePath}.createdAt`, "Created timestamp", issues),
            updatedAt: timestamp(value.updatedAt, `${basePath}.updatedAt`, "Updated timestamp", issues)
        };
    }

    function validateCalendar(value) {
        const issues = [];
        if (!Array.isArray(value)) {
            issue(issues, "calendar.dataset.invalid", "Calendar data must be an array of tasks.", "");
            return { value: [], issues };
        }

        const normalized = value.map((task, index) => validateCalendarTask(task, index, issues));
        const ids = new Set();
        const linkedReminderIds = new Set();

        normalized.forEach((task, index) => {
            if (!task) return;
            if (task.id && ids.has(task.id)) {
                issue(issues, "calendar.duplicate-id", "Calendar task IDs must be unique.", `[${index}].id`);
            }
            if (task.id) ids.add(task.id);

            if (task.linkedReminderId && linkedReminderIds.has(task.linkedReminderId)) {
                issue(issues, "calendar.duplicate-reminder-link", "A reminder cannot be linked to multiple Calendar tasks.", `[${index}].linkedReminderId`);
            }
            if (task.linkedReminderId) linkedReminderIds.add(task.linkedReminderId);
        });

        return { value: normalized, issues };
    }

    function validateReminder(value, index, issues) {
        const basePath = `reminders[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "reminder.invalid", "Reminders must be objects.", basePath);
            return null;
        }

        const id = requiredId(value.id, `${basePath}.id`, "Reminder", issues, { legacyWarning: true });
        const title = boundedText(value.title, "", TITLE_LIMIT, `${basePath}.title`, "Reminder title", issues);
        if (!title) issue(issues, "reminder.title-required", "Reminder title is required.", `${basePath}.title`);

        const date = text(value.date);
        if (!date) {
            issue(issues, "reminder.legacy-undated", "This legacy reminder has no date and cannot sync with Calendar or send a notification until edited.", `${basePath}.date`, "warning");
        } else if (!isDateKey(date)) {
            issue(issues, "reminder.invalid-date", "Reminder date must be a real date in YYYY-MM-DD format.", `${basePath}.date`);
        }

        const time = text(value.time);
        if (time && !isTime(time)) {
            issue(issues, "reminder.invalid-time", "Reminder time must use 24-hour HH:MM format.", `${basePath}.time`);
        }

        const notifyMinutes = notificationMinutes(value.notifyMinutes, `${basePath}.notifyMinutes`, issues);
        if (notifyMinutes !== null && (!isDateKey(date) || !isTime(time))) {
            issue(issues, "notification.date-time-required", "A valid date and time are required when reminder notifications are enabled.", basePath);
        }

        if (value.done !== undefined && typeof value.done !== "boolean") {
            issue(issues, "reminder.done.wrong-type", "Reminder completion must be true or false.", `${basePath}.done`);
        }

        return {
            ...value,
            id,
            title,
            date,
            time,
            note: boundedText(value.note, "", NOTE_LIMIT, `${basePath}.note`, "Reminder notes", issues),
            notifyMinutes,
            linkedCalendarTaskId: optionalId(value.linkedCalendarTaskId, `${basePath}.linkedCalendarTaskId`, "Linked Calendar task ID", issues),
            done: Boolean(value.done),
            createdAt: timestamp(value.createdAt, `${basePath}.createdAt`, "Created timestamp", issues),
            updatedAt: timestamp(value.updatedAt, `${basePath}.updatedAt`, "Updated timestamp", issues)
        };
    }

    function validateDay(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "day.dataset.invalid", "Day data must be an object.", "");
            return { value: {}, issues };
        }

        const normalized = { ...value };
        if (value.reminders !== undefined && !Array.isArray(value.reminders)) {
            issue(issues, "reminder.dataset.invalid", "Day reminders must be an array.", "reminders");
            normalized.reminders = [];
            return { value: normalized, issues };
        }

        if (Array.isArray(value.reminders)) {
            normalized.reminders = value.reminders.map((reminder, index) =>
                validateReminder(reminder, index, issues)
            );

            const ids = new Set();
            const linkedTaskIds = new Set();
            normalized.reminders.forEach((reminder, index) => {
                if (!reminder) return;
                if (reminder.id && ids.has(reminder.id)) {
                    issue(issues, "reminder.duplicate-id", "Reminder IDs must be unique.", `reminders[${index}].id`);
                }
                if (reminder.id) ids.add(reminder.id);

                if (reminder.linkedCalendarTaskId && linkedTaskIds.has(reminder.linkedCalendarTaskId)) {
                    issue(issues, "reminder.duplicate-calendar-link", "A Calendar task cannot be linked to multiple reminders.", `reminders[${index}].linkedCalendarTaskId`);
                }
                if (reminder.linkedCalendarTaskId) linkedTaskIds.add(reminder.linkedCalendarTaskId);
            });
        }

        return { value: normalized, issues };
    }

    validation.register("calendar", validateCalendar);
    validation.register("day", validateDay);
})();
