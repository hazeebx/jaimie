(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) throw new Error("Journal schema requires JAIMIE validation and safe-content services.");

    const TEXT_LIMIT = 500000;
    const TITLE_LIMIT = 200;

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

    function text(value, path, label, issues) {
        if (value === undefined || value === null) return "";
        if (typeof value !== "string") issue(issues, "field.wrong-type", `${label} must be text.`, path);
        const source = typeof value === "string" ? value : "";
        if (safeContent.normalizeText(source).length > TEXT_LIMIT) {
            issue(issues, "field.too-long", `${label} cannot exceed ${TEXT_LIMIT} characters.`, path);
        }
        return safeContent.normalizeText(source, { trim: false, maxLength: TEXT_LIMIT });
    }

    function validateEntry(value, dateKey, issues) {
        const path = `entries.${dateKey}`;
        if (!isRecord(value)) {
            issue(issues, "journal.entry.invalid", "Journal entries must be objects.", path);
            return null;
        }

        const entryDate = value.date === undefined || value.date === null || value.date === ""
            ? dateKey
            : String(value.date);
        if (value.date === undefined || value.date === null || value.date === "") {
            issue(issues, "field.legacy-date-derived", "Journal entry date was derived from its collection key.", `${path}.date`, "warning");
        } else if (entryDate !== dateKey) {
            issue(issues, "journal.entry.date-mismatch", "Journal entry date must match its date key.", `${path}.date`);
        }

        const normalized = { ...value, date: entryDate };
        for (const field of ["howDay", "howDayHtml", "tomorrow", "whatHappened", "thinking", "grateful"]) {
            if (Object.hasOwn(value, field)) normalized[field] = text(value[field], `${path}.${field}`, field, issues);
        }
        if (value.updatedAt !== undefined && value.updatedAt !== null && value.updatedAt !== "") {
            const timestamp = String(value.updatedAt);
            if (Number.isNaN(Date.parse(timestamp))) issue(issues, "field.invalid-timestamp", "Updated time must be an ISO timestamp.", `${path}.updatedAt`);
            normalized.updatedAt = timestamp;
        }
        return normalized;
    }

    function shortText(value, path, label, issues, { required = false } = {}) {
        if (value !== undefined && value !== null && typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const normalized = safeContent.normalizeText(typeof value === "string" ? value : "", { maxLength: TITLE_LIMIT });
        if (required && !normalized) issue(issues, "field.required", `${label} is required.`, path);
        if (typeof value === "string" && safeContent.normalizeText(value).length > TITLE_LIMIT) {
            issue(issues, "field.too-long", `${label} cannot exceed ${TITLE_LIMIT} characters.`, path);
        }
        return normalized;
    }

    function timestamp(value, path, label, issues) {
        if (value === undefined || value === null || value === "") return "";
        const normalized = String(value);
        if (Number.isNaN(Date.parse(normalized))) issue(issues, "field.invalid-timestamp", `${label} must be an ISO timestamp.`, path);
        return normalized;
    }

    function validateFolder(value, folderId, issues) {
        const path = `folders.${folderId}`;
        if (!isRecord(value)) {
            issue(issues, "journal.folder.invalid", "Note folders must be objects.", path);
            return null;
        }

        const id = value.id === undefined || value.id === null || value.id === "" ? folderId : String(value.id);
        if (id !== folderId) issue(issues, "journal.folder.id-mismatch", "Folder ID must match its collection key.", `${path}.id`);

        return {
            ...value,
            id,
            name: shortText(value.name, `${path}.name`, "Folder name", issues, { required: true }),
            createdAt: timestamp(value.createdAt, `${path}.createdAt`, "Created time", issues),
            updatedAt: timestamp(value.updatedAt, `${path}.updatedAt`, "Updated time", issues)
        };
    }

    function validateNote(value, noteId, folderIds, issues) {
        const path = `notes.${noteId}`;
        if (!isRecord(value)) {
            issue(issues, "journal.note.invalid", "Notes must be objects.", path);
            return null;
        }

        const id = value.id === undefined || value.id === null || value.id === "" ? noteId : String(value.id);
        if (id !== noteId) issue(issues, "journal.note.id-mismatch", "Note ID must match its collection key.", `${path}.id`);

        const folderId = value.folderId === undefined || value.folderId === null ? "" : String(value.folderId);
        if (folderId && !folderIds.has(folderId)) {
            issue(issues, "journal.note.folder-missing", "Note folder does not exist.", `${path}.folderId`);
        }

        return {
            ...value,
            id,
            title: shortText(value.title, `${path}.title`, "Note title", issues, { required: true }),
            content: text(value.content, `${path}.content`, "Note content", issues),
            folderId,
            createdAt: timestamp(value.createdAt, `${path}.createdAt`, "Created time", issues),
            updatedAt: timestamp(value.updatedAt, `${path}.updatedAt`, "Updated time", issues)
        };
    }

    function validateJournal(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "journal.dataset.invalid", "Journal data must be an object.", "");
            return { value: { entries: {}, folders: {}, notes: {} }, issues };
        }
        if (!isRecord(value.entries)) issue(issues, "journal.entries.invalid", "Journal entries must be an object keyed by date.", "entries");
        const entries = {};
        for (const [dateKey, entry] of Object.entries(isRecord(value.entries) ? value.entries : {})) {
            if (!isDateKey(dateKey)) {
                issue(issues, "journal.entry-key.invalid", "Journal entry keys must be real YYYY-MM-DD dates.", `entries.${dateKey}`);
                continue;
            }
            const normalized = validateEntry(entry, dateKey, issues);
            if (normalized) entries[dateKey] = normalized;
        }

        if (value.folders !== undefined && !isRecord(value.folders)) {
            issue(issues, "journal.folders.invalid", "Journal note folders must be an object keyed by ID.", "folders");
        }
        const folders = {};
        for (const [folderId, folder] of Object.entries(isRecord(value.folders) ? value.folders : {})) {
            const normalized = validateFolder(folder, folderId, issues);
            if (normalized) folders[folderId] = normalized;
        }

        if (value.notes !== undefined && !isRecord(value.notes)) {
            issue(issues, "journal.notes.invalid", "Journal notes must be an object keyed by ID.", "notes");
        }
        const notes = {};
        const folderIds = new Set(Object.keys(folders));
        for (const [noteId, note] of Object.entries(isRecord(value.notes) ? value.notes : {})) {
            const normalized = validateNote(note, noteId, folderIds, issues);
            if (normalized) notes[noteId] = normalized;
        }

        const selectedNoteId = value.selectedNoteId === undefined || value.selectedNoteId === null
            ? ""
            : String(value.selectedNoteId);
        if (selectedNoteId && !Object.hasOwn(notes, selectedNoteId)) {
            issue(issues, "journal.selected-note.missing", "Selected note does not exist.", "selectedNoteId", "warning");
        }

        return { value: { ...value, entries, folders, notes, selectedNoteId }, issues };
    }

    validation.register("journal", validateJournal);
})();
