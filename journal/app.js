"use strict";

const JOURNAL_KEY = "journal";
const $ = id => document.getElementById(id);
const safeContent = window.JAIMIESafeContent;
const notesModel = window.JAIMIEJournalNotes;
const richText = window.JAIMIEJournalRichText;

let selectedDate = dateKey(new Date());
const requestedView = new URLSearchParams(window.location.search).get("view");
const storedView = localStorage.getItem("jaimie.journal.view");
let activeView = ["daily", "notes", "braindump"].includes(requestedView)
    ? requestedView
    : (["daily", "notes", "braindump"].includes(storedView) ? storedView : "daily");
let activeNoteId = "";
let noteQuery = "";
let noteMode = localStorage.getItem("jaimie.journal.note-mode") || "edit";
let entrySaveTimer = null;
let noteSaveTimer = null;
let journalData = { entries: {}, folders: {}, notes: {}, selectedNoteId: "" };

function dateKey(date) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatDate(date) {
    return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function escapeHtml(value) {
    return safeContent.escapeHtml(value);
}

function makeId(prefix) {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function loadJournal() {
    try {
        const stored = await JAIMIEData.load(JOURNAL_KEY);
        journalData = isRecord(stored) ? {
            ...stored,
            entries: isRecord(stored.entries) ? stored.entries : {},
            folders: isRecord(stored.folders) ? stored.folders : {},
            notes: isRecord(stored.notes) ? stored.notes : {},
            selectedNoteId: typeof stored.selectedNoteId === "string" ? stored.selectedNoteId : ""
        } : { entries: {}, folders: {}, notes: {}, selectedNoteId: "" };
    } catch (error) {
        console.error("JAIMIE Journal: failed to load.", error);
        journalData = { entries: {}, folders: {}, notes: {}, selectedNoteId: "" };
    }

    activeNoteId = Object.hasOwn(journalData.notes, journalData.selectedNoteId)
        ? journalData.selectedNoteId
        : sortedNotes()[0]?.id || "";
}

async function persistJournal() {
    await JAIMIEData.save(JOURNAL_KEY, journalData);
}

/* Daily entry */
function currentEntry() {
    return journalData.entries[selectedDate] || null;
}

function setEntrySaveState(text) {
    $("saveState").textContent = text;
    $("saveState").classList.toggle("pending", text === "UNSAVED");
}

async function saveEntry() {
    clearTimeout(entrySaveTimer);
    entrySaveTimer = null;
    const dailyText = richText.textContent($("howDay"));
    const dailyHtml = dailyText ? richText.sanitizeHtml($("howDay").innerHTML) : "";
    const entry = {
        ...(currentEntry() || {}),
        date: selectedDate,
        howDay: dailyText,
        howDayHtml: dailyHtml,
        updatedAt: new Date().toISOString()
    };
    const hasContent = Object.keys(entry).some(field => !["date", "updatedAt"].includes(field) && entry[field]);
    if (hasContent) journalData.entries[selectedDate] = entry;
    else delete journalData.entries[selectedDate];

    try {
        await persistJournal();
        renderHistory();
        setEntrySaveState("SAVED");
    } catch (error) {
        console.error("JAIMIE Journal: entry save failed.", error);
        setEntrySaveState("SAVE FAILED");
    }
}

function renderDailyEntry() {
    const entry = currentEntry();
    $("entryTitle").textContent = formatDate(dateFromKey(selectedDate)).toUpperCase();
    $("howDay").innerHTML = entry?.howDayHtml
        ? richText.sanitizeHtml(entry.howDayHtml)
        : (entry?.howDay ? richText.plainTextToHtml(entry.howDay) : "");
    $("dateStatus").textContent = selectedDate;
    updateCharCount();
    setEntrySaveState(entry ? "SAVED" : "NOT WRITTEN");
}

function formatDailySelection(format) {
    const editor = $("howDay");
    editor.focus();
    if (format === "heading") {
        const currentBlock = String(document.queryCommandValue("formatBlock")).toLowerCase();
        document.execCommand("formatBlock", false, currentBlock === "h2" ? "div" : "h2");
    } else {
        const command = format === "bold"
            ? "bold"
            : (format === "italic" ? "italic" : "insertUnorderedList");
        document.execCommand(command, false, null);
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    updateDailyToolbarState();
}

function selectedBlock(editor, range) {
    let node = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
    while (node && node !== editor) {
        if (["DIV", "P", "H1", "H2", "H3", "BLOCKQUOTE", "LI"].includes(node.tagName)) return node;
        node = node.parentElement;
    }
    return editor;
}

function convertTypedMarkerToList(event) {
    if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return false;
    const editor = $("howDay");
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return false;
    const range = selection.getRangeAt(0);
    const block = selectedBlock(editor, range);
    if (block.closest?.("li")) return false;

    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(block);
    beforeCaret.setEnd(range.startContainer, range.startOffset);
    if (!["*", "-"].includes(beforeCaret.toString())) return false;

    event.preventDefault();
    beforeCaret.deleteContents();
    beforeCaret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(beforeCaret);
    document.execCommand("insertUnorderedList", false, null);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}

function updateDailyToolbarState() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !$("howDay").contains(selection.anchorNode)) return;
    const states = {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        bullet: document.queryCommandState("insertUnorderedList"),
        heading: String(document.queryCommandValue("formatBlock")).toLowerCase() === "h2"
    };
    document.querySelectorAll("[data-daily-format]").forEach(button => {
        const active = Boolean(states[button.dataset.dailyFormat]);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function handleDailyEditorKeydown(event) {
    if (convertTypedMarkerToList(event)) return;
    if (event.key !== "Tab") return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement;
    if (!anchor?.closest?.("li")) return;
    event.preventDefault();
    document.execCommand(event.shiftKey ? "outdent" : "indent", false, null);
    $("howDay").dispatchEvent(new Event("input", { bubbles: true }));
}

function entryPreview(entry) {
    const content = String(entry?.howDay || "").trim();
    return content ? String(content).replace(/\s+/g, " ").slice(0, 90) : "Entry recorded.";
}

function renderHistory() {
    const dates = Object.keys(journalData.entries).sort().reverse();
    $("entryCount").textContent = `${dates.length} ${dates.length === 1 ? "ENTRY" : "ENTRIES"}`;
    $("historyList").innerHTML = dates.length ? dates.map(value => {
        const date = dateFromKey(value);
        return `<button class="history-item ${value === selectedDate ? "active" : ""}" data-date="${escapeHtml(value)}" type="button">
            <div class="history-date"><div class="history-month">${date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</div><div class="history-day">${date.getDate()}</div></div>
            <div class="history-main"><div class="history-title">${escapeHtml(formatDate(date))}</div><div class="history-preview">${escapeHtml(entryPreview(journalData.entries[value]))}</div></div>
            <div class="history-arrow">›</div>
        </button>`;
    }).join("") : `<div class="empty">No journal entries yet.</div>`;
}

function updateCharCount() {
    const total = richText.textContent($("howDay")).length;
    $("charCount").textContent = `${total.toLocaleString()} ${total === 1 ? "character" : "characters"}`;
}

async function flushPendingEntry() {
    if (!entrySaveTimer) return;
    await saveEntry();
}

async function shiftDay(amount) {
    await flushPendingEntry();
    const date = dateFromKey(selectedDate);
    date.setDate(date.getDate() + amount);
    selectedDate = dateKey(date);
    renderDailyEntry();
    renderHistory();
}

/* Notes vault */
function sortedNotes() {
    return Object.values(journalData.notes).sort((left, right) =>
        String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) || String(left.title).localeCompare(String(right.title))
    );
}

function sortedFolders() {
    return Object.values(journalData.folders).sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function activeNote() {
    return journalData.notes[activeNoteId] || null;
}

function uniqueNoteTitle(base = "Untitled Note") {
    const titles = new Set(Object.values(journalData.notes).map(note => String(note.title).toLocaleLowerCase()));
    if (!titles.has(base.toLocaleLowerCase())) return base;
    let number = 2;
    while (titles.has(`${base} ${number}`.toLocaleLowerCase())) number += 1;
    return `${base} ${number}`;
}

async function createNote(title = "Untitled Note", folderId = activeNote()?.folderId || "") {
    const now = new Date().toISOString();
    const id = makeId("note");
    journalData.notes[id] = { id, title: uniqueNoteTitle(notesModel.normalizeTitle(title)), content: "", folderId, createdAt: now, updatedAt: now };
    activeNoteId = id;
    journalData.selectedNoteId = id;
    await saveNotesNow();
    renderNotesWorkspace();
    $("noteTitle").focus();
    $("noteTitle").select();
}

async function createFolder(name) {
    const normalized = safeContent.normalizeText(name, { maxLength: 200 });
    if (!normalized) return;
    const duplicate = Object.values(journalData.folders).some(folder => folder.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
    if (duplicate) {
        $("folderName").setCustomValidity("A folder with this name already exists.");
        $("folderName").reportValidity();
        return;
    }
    const now = new Date().toISOString();
    const id = makeId("folder");
    journalData.folders[id] = { id, name: normalized, createdAt: now, updatedAt: now };
    await saveNotesNow();
    $("folderDialog").close();
    renderNotesWorkspace();
}

async function deleteFolder(folderId) {
    const folder = journalData.folders[folderId];
    if (!folder || !confirm(`Delete the folder “${folder.name}”? Its notes will be moved to the vault root.`)) return;
    Object.values(journalData.notes).forEach(note => {
        if (note.folderId === folderId) note.folderId = "";
    });
    delete journalData.folders[folderId];
    await saveNotesNow();
    renderNotesWorkspace();
}

async function deleteActiveNote() {
    const note = activeNote();
    if (!note || !confirm(`Delete “${note.title}”? This cannot be undone.`)) return;
    delete journalData.notes[note.id];
    activeNoteId = sortedNotes()[0]?.id || "";
    journalData.selectedNoteId = activeNoteId;
    await saveNotesNow();
    renderNotesWorkspace();
}

function scheduleNoteSave() {
    $("noteSaveState").textContent = "UNSAVED";
    $("noteSaveState").classList.add("pending");
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(saveNotesNow, 700);
}

async function saveNotesNow() {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
    try {
        await persistJournal();
        if ($("noteSaveState")) {
            $("noteSaveState").textContent = "SAVED";
            $("noteSaveState").classList.remove("pending", "failed");
        }
    } catch (error) {
        console.error("JAIMIE Journal: note save failed.", error);
        if ($("noteSaveState")) {
            $("noteSaveState").textContent = "SAVE FAILED";
            $("noteSaveState").classList.add("failed");
        }
    }
}

async function selectNote(noteId) {
    if (!Object.hasOwn(journalData.notes, noteId)) return;
    if (noteSaveTimer) await saveNotesNow();
    activeNoteId = noteId;
    journalData.selectedNoteId = noteId;
    renderNotesWorkspace();
    scheduleNoteSave();
}

function filteredNotes() {
    const query = noteQuery.trim().toLocaleLowerCase();
    if (!query) return sortedNotes();
    return sortedNotes().filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(query));
}

function renderVault() {
    const notes = filteredNotes();
    const groups = [{ id: "", name: "Vault", notes: notes.filter(note => !note.folderId) }]
        .concat(sortedFolders().map(folder => ({ ...folder, notes: notes.filter(note => note.folderId === folder.id) })));
    $("noteCount").textContent = Object.keys(journalData.notes).length;

    const visibleGroups = noteQuery ? groups.filter(group => group.notes.length) : groups;
    $("vaultTree").innerHTML = visibleGroups.length ? visibleGroups.map(group => `
        <section class="folder-group">
            <div class="folder-row">
                <span class="folder-name"><span aria-hidden="true">▾</span>${escapeHtml(group.name)}</span>
                ${group.id ? `<button class="folder-delete" type="button" data-delete-folder="${escapeHtml(group.id)}" aria-label="Delete ${escapeHtml(group.name)}">×</button>` : ""}
            </div>
            <div class="folder-notes">
                ${group.notes.length ? group.notes.map(note => `<button class="note-row ${note.id === activeNoteId ? "active" : ""}" type="button" data-note-id="${escapeHtml(note.id)}"><span class="note-file-icon">◇</span><span><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.content.replace(/[#*`\[\]]/g, "").replace(/\s+/g, " ").slice(0, 52) || "Empty note")}</small></span></button>`).join("") : `<div class="folder-empty">No notes</div>`}
            </div>
        </section>`).join("") : `<div class="vault-empty">No notes match “${escapeHtml(noteQuery)}”.</div>`;
}

function renderFolderSelect(note) {
    $("noteFolder").innerHTML = `<option value="">Vault root</option>${sortedFolders().map(folder => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join("")}`;
    $("noteFolder").value = note.folderId || "";
}

function renderNoteContext(note) {
    const links = notesModel.extractWikiLinks(note.content);
    const tags = notesModel.extractTags(note.content);
    const backlinks = notesModel.getBacklinks(journalData.notes, note);
    $("wordCount").textContent = notesModel.wordCount(note.content).toLocaleString();
    $("linkCount").textContent = links.length.toLocaleString();
    $("updatedAt").textContent = note.updatedAt ? `Updated ${new Date(note.updatedAt).toLocaleString()}` : "Not saved yet";
    $("tagList").innerHTML = tags.length ? tags.map(tag => `<button type="button" class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join("") : `<span class="context-empty">No tags in this note.</span>`;
    $("backlinkList").innerHTML = backlinks.length ? backlinks.map(link => `<button type="button" data-note-id="${escapeHtml(link.id)}"><strong>${escapeHtml(link.title)}</strong><span>Links to this note</span></button>`).join("") : `<span class="context-empty">No notes link here yet.</span>`;
}

function renderPreview(note) {
    $("notePreview").innerHTML = note.content.trim()
        ? notesModel.renderMarkdown(note.content)
        : `<div class="preview-empty">Nothing to preview yet.</div>`;
}

function applyNoteMode() {
    if (!["edit", "split", "preview"].includes(noteMode)) noteMode = "edit";
    $("editorStage").className = `editor-stage mode-${noteMode}`;
    document.querySelectorAll(".mode-button").forEach(button => button.classList.toggle("active", button.dataset.mode === noteMode));
}

function renderNotesWorkspace() {
    renderVault();
    const note = activeNote();
    $("noteEmpty").hidden = Boolean(note);
    $("noteEditor").hidden = !note;
    $("noteContext").hidden = !note;
    $("dateStatus").textContent = `${Object.keys(journalData.notes).length} NOTES · ${Object.keys(journalData.folders).length} FOLDERS`;
    if (!note) return;

    $("noteTitle").value = note.title;
    $("noteContent").value = note.content;
    renderFolderSelect(note);
    renderPreview(note);
    renderNoteContext(note);
    applyNoteMode();
}

async function followWikiLink(title) {
    const existing = notesModel.findNoteByTitle(journalData.notes, title);
    if (existing) await selectNote(existing.id);
    else await createNote(title, activeNote()?.folderId || "");
}

function updateActiveNoteFromEditor(field, value) {
    const note = activeNote();
    if (!note) return;
    note[field] = field === "title"
        ? safeContent.normalizeText(value, { trim: false, maxLength: 200 }) || "Untitled Note"
        : value;
    note.updatedAt = new Date().toISOString();
    renderVault();
    renderPreview(note);
    renderNoteContext(note);
    scheduleNoteSave();
}

/* View and events */
async function setView(view) {
    if (view === activeView) return;
    if (entrySaveTimer) {
        clearTimeout(entrySaveTimer);
        entrySaveTimer = null;
        await saveEntry();
    }
    if (noteSaveTimer) await saveNotesNow();
    activeView = view;
    localStorage.setItem("jaimie.journal.view", view);
    renderView();
}

function renderView() {
    const notesActive = activeView === "notes";
    const braindumpActive = activeView === "braindump";
    $("dailyView").hidden = notesActive || braindumpActive;
    $("notesView").hidden = !notesActive;
    $("braindumpView").hidden = !braindumpActive;
    $("dailyTab").classList.toggle("active", !notesActive && !braindumpActive);
    $("notesTab").classList.toggle("active", notesActive);
    $("braindumpTab").classList.toggle("active", braindumpActive);
    $("dayNav").hidden = notesActive || braindumpActive;
    $("readyStatus").textContent = notesActive
        ? "NOTES VAULT READY"
        : (braindumpActive ? "BRAINDUMP READY" : "JOURNAL READY");
    if (notesActive) renderNotesWorkspace();
    else if (braindumpActive) {
        $("dateStatus").textContent = "FREEFORM CANVAS";
        requestAnimationFrame(() => window.JAIMIEBraindump?.refresh());
    }
    else {
        renderDailyEntry();
        renderHistory();
    }
}

function bindEvents() {
    [$("howDay")].forEach(field => field.addEventListener("input", () => {
        setEntrySaveState("UNSAVED");
        updateCharCount();
        clearTimeout(entrySaveTimer);
        entrySaveTimer = setTimeout(saveEntry, 900);
    }));
    $("howDay").addEventListener("keydown", handleDailyEditorKeydown);
    $("howDay").addEventListener("paste", event => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || "");
    });
    document.addEventListener("selectionchange", updateDailyToolbarState);

    $("historyList").addEventListener("click", async event => {
        const button = event.target.closest("[data-date]");
        if (!button) return;
        await flushPendingEntry();
        selectedDate = button.dataset.date;
        renderDailyEntry();
        renderHistory();
    });
    $("prevDay").onclick = () => shiftDay(-1);
    $("nextDay").onclick = () => shiftDay(1);
    $("todayBtn").onclick = async () => { await flushPendingEntry(); selectedDate = dateKey(new Date()); renderDailyEntry(); renderHistory(); };
    $("saveBtn").onclick = saveEntry;
    document.querySelector(".daily-format-toolbar").addEventListener("click", event => {
        const button = event.target.closest("[data-daily-format]");
        if (button) formatDailySelection(button.dataset.dailyFormat);
    });
    document.querySelector(".daily-format-toolbar").addEventListener("mousedown", event => {
        if (event.target.closest("button")) event.preventDefault();
    });
    $("dailyTab").onclick = () => setView("daily");
    $("notesTab").onclick = () => setView("notes");
    $("braindumpTab").onclick = () => setView("braindump");

    $("newNoteBtn").onclick = () => createNote();
    $("emptyNewNoteBtn").onclick = () => createNote();
    $("newFolderBtn").onclick = () => { $("folderName").value = ""; $("folderName").setCustomValidity(""); $("folderDialog").showModal(); $("folderName").focus(); };
    $("cancelFolderBtn").onclick = () => $("folderDialog").close();
    $("folderName").addEventListener("input", () => $("folderName").setCustomValidity(""));
    $("folderForm").addEventListener("submit", event => { event.preventDefault(); createFolder($("folderName").value); });
    $("noteSearch").addEventListener("input", event => { noteQuery = event.target.value; renderVault(); });

    $("vaultTree").addEventListener("click", event => {
        const deleteButton = event.target.closest("[data-delete-folder]");
        if (deleteButton) { deleteFolder(deleteButton.dataset.deleteFolder); return; }
        const noteButton = event.target.closest("[data-note-id]");
        if (noteButton) selectNote(noteButton.dataset.noteId);
    });

    $("noteTitle").addEventListener("input", event => updateActiveNoteFromEditor("title", event.target.value));
    $("noteTitle").addEventListener("blur", event => {
        const normalized = notesModel.normalizeTitle(event.target.value);
        event.target.value = normalized;
        updateActiveNoteFromEditor("title", normalized);
    });
    $("noteContent").addEventListener("input", event => updateActiveNoteFromEditor("content", event.target.value));
    $("noteFolder").addEventListener("change", event => updateActiveNoteFromEditor("folderId", event.target.value));
    $("saveNoteBtn").onclick = saveNotesNow;
    $("deleteNoteBtn").onclick = deleteActiveNote;

    document.querySelector(".mode-switch").addEventListener("click", event => {
        const button = event.target.closest("[data-mode]");
        if (!button) return;
        noteMode = button.dataset.mode;
        localStorage.setItem("jaimie.journal.note-mode", noteMode);
        applyNoteMode();
    });

    $("notePreview").addEventListener("click", event => {
        const link = event.target.closest("[data-wikilink]");
        if (link) followWikiLink(link.dataset.wikilink);
    });
    $("tagList").addEventListener("click", event => {
        const tag = event.target.closest("[data-tag]");
        if (!tag) return;
        noteQuery = `#${tag.dataset.tag}`;
        $("noteSearch").value = noteQuery;
        renderVault();
    });
    $("backlinkList").addEventListener("click", event => {
        const backlink = event.target.closest("[data-note-id]");
        if (backlink) selectNote(backlink.dataset.noteId);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && noteSaveTimer) saveNotesNow();
    });
}

async function init() {
    if (!window.JAIMIEData || !safeContent || !notesModel || !richText) {
        console.error("JAIMIE Journal: required services are unavailable.");
        $("readyStatus").textContent = "JOURNAL DATA ERROR";
        return;
    }
    await loadJournal();
    bindEvents();
    renderView();
}

init();
