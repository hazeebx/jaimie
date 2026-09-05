(() => {
    "use strict";

    const DAY_KEY = "day";
    const CALENDAR_KEY = "calendar";
    let activeSync = null;

    function uid() {
        return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function validDate(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    }

    function validNotify(value) {
        return [0, 5, 10, 15].includes(value) ? value : null;
    }

    function timestamp(value) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function taskToReminder(task, reminder = {}) {
        return {
            ...reminder,
            id: reminder.id || task.linkedReminderId || uid(),
            linkedCalendarTaskId: task.id,
            title: String(task.title || ""),
            date: String(task.date || ""),
            time: String(task.time || ""),
            note: String(task.notes || ""),
            done: Boolean(task.completed),
            notifyMinutes: validNotify(task.notifyMinutes),
            createdAt: reminder.createdAt || task.createdAt || Date.now(),
            updatedAt: task.updatedAt || Date.now()
        };
    }

    function reminderToTask(reminder, task = {}) {
        return {
            ...task,
            id: task.id || reminder.linkedCalendarTaskId || uid(),
            linkedReminderId: reminder.id,
            title: String(reminder.title || ""),
            date: String(reminder.date || ""),
            time: String(reminder.time || ""),
            category: task.category || "Personal",
            notes: String(reminder.note || ""),
            completed: Boolean(reminder.done),
            notifyMinutes: validNotify(reminder.notifyMinutes),
            createdAt: task.createdAt || reminder.createdAt || Date.now(),
            updatedAt: reminder.updatedAt || Date.now()
        };
    }

    async function runSync(preferredSource = null) {
        const originalDay = await JAIMIEData.load(DAY_KEY);
        const originalCalendar = await JAIMIEData.load(CALENDAR_KEY);
        const originalDayJson = JSON.stringify(originalDay || {});
        const originalCalendarJson = JSON.stringify(originalCalendar || []);
        const day = originalDay && typeof originalDay === "object" ? originalDay : {};
        const reminders = Array.isArray(day.reminders) ? day.reminders : [];
        const tasks = Array.isArray(originalCalendar) ? originalCalendar : [];
        day.reminders = reminders;

        reminders.forEach(reminder => {
            reminder.id ||= uid();
            reminder.updatedAt ||= reminder.createdAt || Date.now();
        });

        const reminderById = new Map(reminders.map(reminder => [reminder.id, reminder]));
        const taskById = new Map(tasks.map(task => [task.id, task]));

        tasks.forEach(task => {
            let reminder = task.linkedReminderId ? reminderById.get(task.linkedReminderId) : null;
            if (!reminder) {
                reminder = taskToReminder(task);
                task.linkedReminderId = reminder.id;
                reminders.push(reminder);
                reminderById.set(reminder.id, reminder);
            }
        });

        reminders.forEach(reminder => {
            if (!validDate(reminder.date)) return;
            let task = reminder.linkedCalendarTaskId ? taskById.get(reminder.linkedCalendarTaskId) : null;
            if (!task) {
                task = reminderToTask(reminder);
                reminder.linkedCalendarTaskId = task.id;
                tasks.push(task);
                taskById.set(task.id, task);
                task.linkedReminderId = reminder.id;
            }

            const reminderWins = preferredSource === "day" || (
                preferredSource !== "calendar" && timestamp(reminder.updatedAt) > timestamp(task.updatedAt)
            );

            if (reminderWins) {
                Object.assign(task, reminderToTask(reminder, task));
            } else {
                Object.assign(reminder, taskToReminder(task, reminder));
            }
            task.linkedReminderId = reminder.id;
            reminder.linkedCalendarTaskId = task.id;
        });

        if (originalDayJson !== JSON.stringify(day)) {
            await JAIMIEData.save(DAY_KEY, day);
        }
        if (originalCalendarJson !== JSON.stringify(tasks)) {
            await JAIMIEData.save(CALENDAR_KEY, tasks);
        }

        return { day, calendar: tasks };
    }

    function sync(preferredSource = null) {
        if (!activeSync) {
            activeSync = runSync(preferredSource).finally(() => { activeSync = null; });
        }
        return activeSync;
    }

    async function removeCalendarTaskForReminder(reminderId) {
        if (!reminderId) return;
        const stored = await JAIMIEData.load(CALENDAR_KEY);
        const tasks = Array.isArray(stored) ? stored : [];
        const filtered = tasks.filter(task => task.linkedReminderId !== reminderId);
        if (filtered.length !== tasks.length) await JAIMIEData.save(CALENDAR_KEY, filtered);
    }

    async function removeReminderForCalendarTask(taskId) {
        if (!taskId) return;
        const stored = await JAIMIEData.load(DAY_KEY);
        if (!stored || typeof stored !== "object" || !Array.isArray(stored.reminders)) return;
        const filtered = stored.reminders.filter(reminder => reminder.linkedCalendarTaskId !== taskId);
        if (filtered.length !== stored.reminders.length) {
            await JAIMIEData.save(DAY_KEY, { ...stored, reminders: filtered });
        }
    }

    window.JAIMIEReminderCalendarSync = Object.freeze({
        sync,
        removeCalendarTaskForReminder,
        removeReminderForCalendarTask
    });
})();
