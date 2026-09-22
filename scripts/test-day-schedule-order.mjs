globalThis.window = globalThis;

await import("../day_page/schedule-order.js");

const order = globalThis.JAIMIEScheduleOrder;
const items = [
    { id: "untimed-a", title: "Untimed A", time: "" },
    { id: "afternoon", title: "Afternoon", time: "14:30" },
    { id: "morning-a", title: "Morning A", time: "08:15" },
    { id: "midnight", title: "Midnight", time: "00:00" },
    { id: "morning-b", title: "Morning B", time: "08:15" },
    { id: "untimed-b", title: "Untimed B", time: "invalid" }
];

const ordered = order.sorted(items);
const ids = ordered.map(item => item.id);
const expected = ["midnight", "morning-a", "morning-b", "afternoon", "untimed-a", "untimed-b"];
if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(`Schedule order was ${ids.join(", ")} instead of ${expected.join(", ")}.`);
}
if (items[0].id !== "untimed-a") throw new Error("Non-mutating schedule sort changed its input array.");

const dayData = {
    reminders: [{ id: "reminder", time: "07:00" }],
    "2026-09-21": { schedule: [...items], quests: [{ id: "quest" }] },
    futureRootField: { preserve: true }
};
order.sortDayData(dayData);
if (dayData["2026-09-21"].schedule[0].id !== "midnight") throw new Error("Dated Schedule data was not sorted in place.");
if (dayData.reminders[0].id !== "reminder" || dayData["2026-09-21"].quests[0].id !== "quest") {
    throw new Error("Schedule sorting changed Reminders or Main Quest data.");
}
if (dayData.futureRootField.preserve !== true) throw new Error("Schedule sorting changed future fields.");

console.log("Day Schedule ordering passed: chronological, stable, untimed-last, and isolated from other sections.");
