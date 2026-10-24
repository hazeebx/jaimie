globalThis.window = globalThis;

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/journal.js");
await import("../shared/validation-schemas/inventory.js");
await import("../shared/validation-schemas/packing.js");
await import("../journal/notes-model.js");

const validation = globalThis.JAIMIEValidation;

const journal = {
    futureRootField: { version: 2 },
    folders: {
        research: { id: "research", name: "Research", createdAt: "2026-09-21T10:00:00.000Z", futureFolderField: true }
    },
    notes: {
        "note-one": {
            id: "note-one",
            title: "First Note",
            content: "Links to [[Second Note]] with #project notes.",
            folderId: "research",
            createdAt: "2026-09-21T10:00:00.000Z",
            updatedAt: "2026-09-21T12:00:00.000Z",
            futureNoteField: 7
        },
        "note-two": {
            id: "note-two",
            title: "Second Note",
            content: "Backlink target.",
            folderId: "",
            createdAt: "2026-09-21T11:00:00.000Z",
            updatedAt: "2026-09-21T12:30:00.000Z"
        }
    },
    selectedNoteId: "note-one",
    entries: {
        "2026-09-21": {
            date: "2026-09-21",
            howDay: "Productive",
            howDayHtml: "<div><strong>Productive</strong></div>",
            tomorrow: "Continue",
            updatedAt: "2026-09-21T12:00:00.000Z",
            futureEntryField: "preserve"
        }
    }
};
const validJournal = validation.validate("journal", journal, { source: "test" });
if (!validJournal.valid || validJournal.issues.length) throw new Error("A current Journal dataset failed validation.");
if (validJournal.value.futureRootField?.version !== 2 || validJournal.value.entries["2026-09-21"].futureEntryField !== "preserve" || validJournal.value.notes["note-one"].futureNoteField !== 7 || validJournal.value.folders.research.futureFolderField !== true) {
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

const invalidJournalNotes = validation.validate("journal", {
    entries: {},
    folders: { alpha: { id: "wrong", name: "" } },
    notes: { first: { id: "other", title: "", content: 7, folderId: "missing", updatedAt: "never" } },
    selectedNoteId: "missing-note"
});
for (const code of ["journal.folder.id-mismatch", "journal.note.id-mismatch", "journal.note.folder-missing", "journal.selected-note.missing", "field.required"]) {
    if (!invalidJournalNotes.issues.some(issue => issue.code === code)) throw new Error(`Missing Journal notes validation issue: ${code}`);
}

const notesModel = globalThis.JAIMIEJournalNotes;
if (notesModel.extractWikiLinks("[[Alpha]] and [[alpha]] and [[Beta]]").join(",") !== "Alpha,Beta") {
    throw new Error("Journal wikilink extraction did not deduplicate note titles.");
}
if (notesModel.extractTags("#work #Work #deep-focus").join(",") !== "work,deep-focus") {
    throw new Error("Journal tag extraction did not normalize duplicate tags.");
}
const renderedMarkdown = notesModel.renderMarkdown("# Safe\n<script>alert(1)</script>\n[[Second Note]]");
if (renderedMarkdown.includes("<script>") || !renderedMarkdown.includes("&lt;script&gt;") || !renderedMarkdown.includes("data-wikilink=\"Second Note\"")) {
    throw new Error("Journal Markdown rendering did not safely escape HTML or render wikilinks.");
}
if (notesModel.getBacklinks(journal.notes, journal.notes["note-two"])[0]?.id !== "note-one") {
    throw new Error("Journal backlinks did not resolve linked notes.");
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
