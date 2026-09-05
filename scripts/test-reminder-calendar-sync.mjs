globalThis.window = globalThis;

const records = new Map([
    ["day", { reminders: [] }],
    ["calendar", [{
        id: "calendar-1",
        title: "Calendar source",
        date: "2026-09-06",
        time: "09:30",
        category: "Work",
        notes: "Bring notes",
        completed: false,
        notifyMinutes: 10,
        createdAt: 1,
        updatedAt: 1
    }]]
]);

globalThis.JAIMIEData = {
    load: async key => records.has(key) ? structuredClone(records.get(key)) : null,
    save: async (key, value) => {
        records.set(key, structuredClone(value));
        return value;
    }
};

await import("../shared/reminder-calendar-sync.js");

let synced = await JAIMIEReminderCalendarSync.sync("calendar");
if (synced.day.reminders.length !== 1) throw new Error("Calendar task was not mirrored to Reminders.");
const linkedReminder = synced.day.reminders[0];
if (linkedReminder.title !== "Calendar source" || linkedReminder.time !== "09:30" || linkedReminder.notifyMinutes !== 10) {
    throw new Error("Calendar fields were not copied to the linked reminder.");
}

linkedReminder.title = "Edited from Day";
linkedReminder.done = true;
linkedReminder.updatedAt = 20;
await JAIMIEData.save("day", synced.day);
synced = await JAIMIEReminderCalendarSync.sync("day");
const updatedTask = synced.calendar.find(task => task.id === "calendar-1");
if (updatedTask.title !== "Edited from Day" || !updatedTask.completed) {
    throw new Error("Reminder changes were not mirrored back to Calendar.");
}

synced.day.reminders.push({
    id: "reminder-2",
    title: "Reminder source",
    date: "2026-09-07",
    time: "18:00",
    note: "Created in Day",
    done: false,
    notifyMinutes: 5,
    createdAt: 30,
    updatedAt: 30
});
await JAIMIEData.save("day", synced.day);
synced = await JAIMIEReminderCalendarSync.sync("day");
const createdTask = synced.calendar.find(task => task.linkedReminderId === "reminder-2");
if (!createdTask || createdTask.date !== "2026-09-07" || createdTask.notes !== "Created in Day") {
    throw new Error("Dated reminder was not mirrored to Calendar.");
}

await JAIMIEReminderCalendarSync.removeReminderForCalendarTask(createdTask.id);
const dayAfterDelete = await JAIMIEData.load("day");
if (dayAfterDelete.reminders.some(reminder => reminder.id === "reminder-2")) {
    throw new Error("Deleting a Calendar task did not remove its linked reminder.");
}

await JAIMIEReminderCalendarSync.removeCalendarTaskForReminder(linkedReminder.id);
const calendarAfterDelete = await JAIMIEData.load("calendar");
if (calendarAfterDelete.some(task => task.id === "calendar-1")) {
    throw new Error("Deleting a Reminder did not remove its linked Calendar task.");
}

console.log("Reminder/Calendar sync test passed: create, update, completion, and two-way linked deletion.");
