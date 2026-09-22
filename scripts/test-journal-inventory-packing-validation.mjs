globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/journal.js");
await import("../shared/validation-schemas/inventory.js");
await import("../shared/validation-schemas/packing.js");

const validation = globalThis.JAIMIEValidation;

const journal = {
    futureRootField: { version: 2 },
    entries: {
        "2026-09-21": {
            date: "2026-09-21",
            howDay: "Productive",
            tomorrow: "Continue",
            updatedAt: "2026-09-21T12:00:00.000Z",
            futureEntryField: "preserve"
        }
    }
};
const validJournal = validation.validate("journal", journal, { source: "test" });
if (!validJournal.valid || validJournal.issues.length) throw new Error("A current Journal dataset failed validation.");
if (validJournal.value.futureRootField?.version !== 2 || validJournal.value.entries["2026-09-21"].futureEntryField !== "preserve") {
    throw new Error("Journal normalization discarded forward-compatible fields.");
}
const legacyJournal = validation.validate("journal", { entries: { "2026-09-20": { howDay: "Legacy" } } });
if (!legacyJournal.valid || !legacyJournal.issues.some(issue => issue.code === "field.legacy-date-derived")) {
    throw new Error("Supported legacy Journal entries were not handled as warnings.");
}
const invalidJournal = validation.validate("journal", {
    entries: {
        "bad-date": {},
        "2026-09-21": { date: "2026-09-20", howDay: 12, updatedAt: "not-a-date" }
    }
});
for (const code of ["journal.entry-key.invalid", "journal.entry.date-mismatch", "field.wrong-type", "field.invalid-timestamp"]) {
    if (!invalidJournal.issues.some(issue => issue.code === code)) throw new Error(`Missing Journal validation issue: ${code}`);
}
if (validation.inspect("journal", invalidJournal, { mode: "compatibility" }).value !== invalidJournal) {
    throw new Error("Journal compatibility mode changed existing data.");
}

const inventory = {
    futureRootField: true,
    items: [{ id: "item-1", name: "Rice", category: "groceries", unit: "kg", qty: 3, min: 1, notes: "", futureItemField: 9 }],
    shopping: [{ id: "shop-1", name: "Soap", qty: 2, unit: "pcs", done: false, aisle: 4 }]
};
const validInventory = validation.validate("inventory", inventory, { source: "test" });
if (!validInventory.valid || validInventory.issues.length) throw new Error("A current Inventory dataset failed validation.");
if (validInventory.value.futureRootField !== true || validInventory.value.items[0].futureItemField !== 9 || validInventory.value.shopping[0].aisle !== 4) {
    throw new Error("Inventory normalization discarded forward-compatible fields.");
}
const invalidInventory = validation.validate("inventory", {
    items: [
        { id: "same", name: "", category: "", unit: "", qty: -1, min: -2 },
        { id: "same", name: "Second", category: "other", unit: "pcs", qty: 1, min: 0 }
    ],
    shopping: [{ id: "shop", name: "", qty: -1, unit: "pcs", done: "yes" }]
});
for (const code of ["field.required", "field.invalid-number", "field.duplicate-id", "field.wrong-type"]) {
    if (!invalidInventory.issues.some(issue => issue.code === code)) throw new Error(`Missing Inventory validation issue: ${code}`);
}
if (validation.inspect("inventory", invalidInventory, { mode: "compatibility" }).value !== invalidInventory) {
    throw new Error("Inventory compatibility mode changed existing data.");
}

const packing = {
    futureRootField: "keep",
    profiles: [{ id: "travel", name: "Travel", color: "#ff8a2a" }],
    items: [{ id: "passport", profileId: "travel", name: "Passport", category: "ESSENTIALS", qty: 1, packedAt: null }],
    checks: { "travel:packing:passport": true }
};
const validPacking = validation.validate("packing", packing, { source: "test" });
if (!validPacking.valid || validPacking.issues.length) throw new Error("A current Packing dataset failed validation.");
if (validPacking.value.futureRootField !== "keep" || validPacking.value.profiles[0].color !== "#ff8a2a" || !Object.hasOwn(validPacking.value.items[0], "packedAt")) {
    throw new Error("Packing normalization discarded forward-compatible fields.");
}
const invalidPacking = validation.validate("packing", {
    profiles: [{ id: "same", name: "" }, { id: "same", name: "Duplicate" }],
    items: [{ id: "item", profileId: "missing", name: "", category: "", qty: 0 }],
    checks: { broken: "yes" }
});
for (const code of ["field.required", "field.invalid-number", "field.duplicate-id", "packing.item.profile-missing", "packing.check-key.invalid", "field.wrong-type"]) {
    if (!invalidPacking.issues.some(issue => issue.code === code)) throw new Error(`Missing Packing validation issue: ${code}`);
}
if (validation.inspect("packing", invalidPacking, { mode: "compatibility" }).value !== invalidPacking) {
    throw new Error("Packing compatibility mode changed existing data.");
}

console.log("Journal/Inventory/Packing schemas passed: current, legacy, malformed, linked, and future-extension records behave correctly.");
