globalThis.window = globalThis;

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await import("../day_page/schedule-order.js");

const order = globalThis.JAIMIEScheduleOrder;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dayStyles = readFileSync(join(root, "day_page", "styles.css"), "utf8");
if (!/\.modal\s+\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/.test(dayStyles)) {
    throw new Error("Hidden Schedule/Reminder modal fields can be exposed by modal label styles.");
}
const selectedTime = order.composeTime("07", "05");
if (selectedTime !== "07:05" || order.composeTime("24", "00") !== "" || order.composeTime("07", "") !== "") {
    throw new Error("Schedule time selectors did not compose a valid HH:MM value.");
}
const splitTime = order.splitTime("19:47");
if (splitTime.hour !== "19" || splitTime.minute !== "47" || order.splitTime("bad").hour !== "") {
    throw new Error("Existing Schedule times were not restored into the selectors correctly.");
}
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

console.log("Day Schedule passed: time selectors, chronological ordering, stability, untimed-last, and section isolation are correct.");
