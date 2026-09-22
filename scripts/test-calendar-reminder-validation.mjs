globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/calendar-reminders.js");

const validation = globalThis.JAIMIEValidation;

const calendar = [{
    id: "calendar-1",
    title: "Dentist",
    date: "2026-09-10",
    time: "14:30",
    category: "Personal",
    notes: "Bring insurance card",
    notifyMinutes: 10,
    linkedReminderId: "reminder-1",
    completed: false,
    createdAt: 1,
    updatedAt: 2
}];

const validCalendar = validation.validate("calendar", calendar, { source: "test" });
if (!validCalendar.valid || validCalendar.issues.length) {
    throw new Error("A current Calendar task failed validation.");
}

const legacyCalendar = validation.validate("calendar", [{
    id: "legacy-task",
    title: "Legacy task",
    date: "2026-09-11",
    category: "Personal",
    notes: "",
    completed: false,
    createdAt: 1
}]);
if (!legacyCalendar.valid) {
    throw new Error("A supported legacy Calendar task failed validation.");
}

const invalidCalendar = validation.validate("calendar", [{
    id: "duplicate",
    title: "",
    date: "2026-02-30",
    time: "29:90",
    notifyMinutes: 7,
    completed: "yes"
}, {
    id: "duplicate",
    title: "Second",
    date: "2026-09-12"
}]);
const calendarCodes = new Set(invalidCalendar.issues.map(issue => issue.code));
for (const code of [
    "calendar.title-required",
    "calendar.invalid-date",
    "calendar.invalid-time",
    "notification.invalid-offset",
    "calendar.completed.wrong-type",
    "calendar.duplicate-id"
]) {
    if (!calendarCodes.has(code)) throw new Error(`Missing Calendar validation issue: ${code}`);
}

const day = {
    reminders: [{
        id: "reminder-1",
        title: "Dentist",
        date: "2026-09-10",
        time: "14:30",
        note: "Bring insurance card",
        notifyMinutes: 10,
        linkedCalendarTaskId: "calendar-1",
        done: false,
        createdAt: 1,
        updatedAt: 2
    }],
    "2026-09-10": {
        schedule: [],
        quests: []
    }
};

const validDay = validation.validate("day", day, { source: "test" });
if (!validDay.valid || validDay.issues.length) {
    throw new Error("A current dated Reminder failed validation.");
}

const legacyDay = {
    reminders: [{ title: "Old reminder", note: "", time: "", done: false }]
};
const compatibleLegacy = validation.inspect("day", legacyDay, {
    source: "test-legacy",
    mode: "compatibility"
});
if (!compatibleLegacy.valid || compatibleLegacy.value !== legacyDay) {
    throw new Error("A legacy undated Reminder was blocked or rewritten.");
}
if (!compatibleLegacy.issues.some(issue => issue.code === "reminder.legacy-undated")) {
    throw new Error("The legacy undated Reminder warning was not reported.");
}

const invalidDay = validation.validate("day", {
    reminders: [{
        id: "reminder-2",
        title: "Notify without time",
        date: "2026-09-12",
        time: "",
        notifyMinutes: 5,
        done: false
    }]
});
if (!invalidDay.issues.some(issue => issue.code === "notification.date-time-required")) {
    throw new Error("A Reminder notification without time was not rejected by the schema.");
}

console.log("Calendar/Reminder schemas passed: current, legacy, malformed, linked, and notification records behave correctly.");
