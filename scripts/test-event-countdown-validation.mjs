globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/event-countdown.js");

const validation = globalThis.JAIMIEValidation;
const current = [{
    id: "event-1",
    name: "  UPSC  ",
    date: "2027-05-27",
    color: "#FF9D45",
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T13:00:00.000Z",
    futureEventField: { category: "exam" }
}];

const valid = validation.validate("event-countdown", current, { source: "test" });
if (!valid.valid || valid.issues.length) throw new Error("A current Event Countdown dataset failed validation.");
if (valid.value[0].name !== "UPSC" || valid.value[0].color !== "#ff9d45") {
    throw new Error("Event Countdown normalization did not run.");
}
if (valid.value[0].futureEventField?.category !== "exam") {
    throw new Error("Event Countdown normalization discarded a future field.");
}

const legacy = validation.validate("event-countdown", [{
    id: "legacy-event",
    name: "Legacy",
    date: "2027-01-01",
    color: "#123456"
}]);
if (!legacy.valid || !legacy.issues.some(issue => issue.code === "event.timestamp.legacy-missing" && issue.severity === "warning")) {
    throw new Error("A supported legacy countdown was not handled as a warning.");
}

const invalid = validation.validate("event-countdown", [
    { id: "duplicate", name: "", date: "2026-02-30", color: "orange", createdAt: "yesterday" },
    { id: "duplicate", name: "Second", date: "2027-01-01", color: "#123456", createdAt: "2026-09-08T00:00:00Z" },
    null
]);
const codes = new Set(invalid.issues.map(issue => issue.code));
for (const code of [
    "event.name-required",
    "event.date.invalid",
    "event.color.invalid",
    "event.timestamp.invalid",
    "event.id.duplicate",
    "event.invalid"
]) {
    if (!codes.has(code)) throw new Error(`Missing Event Countdown validation issue: ${code}`);
}

const compatible = validation.inspect("event-countdown", invalid, { mode: "compatibility", source: "test" });
if (compatible.value !== invalid) throw new Error("Event Countdown compatibility mode changed existing data.");

console.log("Event Countdown schema passed: current, legacy, malformed, duplicate, and future-extension records behave correctly.");
