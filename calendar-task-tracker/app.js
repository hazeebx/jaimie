const DB_NAME = "calendar-task-tracker";
const DB_VERSION = 1;
const STORE = "tasks";

const state = {
  viewDate: startOfDay(new Date()),
  selectedDate: startOfDay(new Date()),
  tasks: [],
  editingTaskId: null
};

let database;
let toastTimer;

const $ = (id) => document.getElementById(id);

function startOfDay(value) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(value) {
  const d = startOfDay(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, amount) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function addMonths(date, amount) {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + amount);
  return d;
}

function sameDate(a, b) {
  return dateKey(a) === dateKey(b);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllTasks() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly")
      .objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putTask(task) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite")
      .objectStore(STORE).put(task);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteTask(id) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite")
      .objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function refreshTasks() {
  state.tasks = await getAllTasks();
  state.tasks.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt - b.createdAt;
  });
}

function tasksForDate(date) {
  const key = dateKey(date);
  return state.tasks.filter((task) => task.date === key);
}

function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", ...options
  }).format(date);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  }).format(date);
}

function monthLabel(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long", year: "numeric"
  }).format(date);
}

function render() {
  renderCalendar();
  renderUpcoming();
  renderSelectedDay();
}

function renderCalendar() {
  $("monthTitle").textContent = monthLabel(state.viewDate);
  const grid = $("calendarGrid");
  grid.innerHTML = "";

  const first = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const tasks = tasksForDate(date);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    if (date.getMonth() !== state.viewDate.getMonth()) cell.classList.add("outside");
    if (sameDate(date, new Date())) cell.classList.add("today");
    if (sameDate(date, state.selectedDate)) cell.classList.add("selected");
    cell.setAttribute("aria-label", `${formatLongDate(date)}, ${tasks.length} tasks`);

    const dots = tasks.slice(0, 5).map((task) =>
      `<span class="task-dot ${task.completed ? "completed" : ""}"></span>`
    ).join("");

    const info = tasks.length
      ? `<span class="info-point" title="${tasks.length} task${tasks.length === 1 ? "" : "s"}">i</span>`
      : "";

    cell.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      ${tasks.length ? `<div class="task-dots">${dots}</div><span class="day-task-count">${tasks.length} task${tasks.length === 1 ? "" : "s"}</span>` : ""}
      ${info}
    `;

    cell.addEventListener("click", () => {
      state.selectedDate = date;
      if (date.getMonth() !== state.viewDate.getMonth()) state.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    });

    grid.appendChild(cell);
  }
}

function renderUpcoming() {
  const list = $("upcomingList");
  const today = startOfDay(new Date());
  const groups = [];
  let total = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(today, offset);
    const tasks = tasksForDate(date);
    if (tasks.length) {
      groups.push({ date, tasks });
      total += tasks.length;
    }
  }

  $("upcomingCount").textContent = total;
  list.innerHTML = "";

  if (!groups.length) {
    list.innerHTML = `<div class="empty-state">Nothing scheduled for the next 7 days.</div>`;
    return;
  }

  groups.forEach(({ date, tasks }) => {
    const section = document.createElement("section");
    section.className = "upcoming-day";
    section.innerHTML = `
      <div class="upcoming-day-head">
        <strong>${sameDate(date, today) ? "TODAY" : new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date).toUpperCase()}</strong>
        <span>${formatDate(date, { year: undefined })}</span>
      </div>
    `;

    tasks.forEach((task) => {
      const row = document.createElement("div");
      row.className = "task-line";
      row.innerHTML = `
        <button class="task-check ${task.completed ? "completed" : ""}" aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}"></button>
        <button class="task-title ${task.completed ? "completed" : ""}" title="Open task">${escapeHtml(task.title)}</button>
      `;
      row.querySelector(".task-check").addEventListener("click", async (event) => {
        event.stopPropagation();
        await toggleTask(task.id);
      });
      row.querySelector(".task-title").addEventListener("click", () => openDetails(task.id));
      section.appendChild(row);
    });

    list.appendChild(section);
  });
}

function renderSelectedDay() {
  $("selectedDateTitle").textContent = formatLongDate(state.selectedDate);
  const container = $("selectedTasks");
  const tasks = tasksForDate(state.selectedDate);
  container.innerHTML = "";

  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state">No tasks on this date.</div>`;
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "selected-task";
    row.innerHTML = `
      <button class="task-check ${task.completed ? "completed" : ""}" aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}"></button>
      <div class="selected-task-main">
        <div class="selected-task-title ${task.completed ? "completed" : ""}">${escapeHtml(task.title)}</div>
        <div class="selected-task-meta">${escapeHtml(task.category)}${task.notes ? " · Has notes" : ""}</div>
      </div>
      <div class="task-actions">
        <button class="small-button edit-task">Edit</button>
        <button class="small-button details-task">Details</button>
      </div>
    `;

    row.querySelector(".task-check").addEventListener("click", () => toggleTask(task.id));
    row.querySelector(".edit-task").addEventListener("click", () => openTaskEditor(task.id));
    row.querySelector(".details-task").addEventListener("click", () => openDetails(task.id));
    container.appendChild(row);
  });
}

async function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = Date.now();
  await putTask(task);
  await refreshTasks();
  render();
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function openTaskEditor(id = null, date = state.selectedDate) {
  state.editingTaskId = id;
  const task = id ? state.tasks.find((item) => item.id === id) : null;

  $("taskModalTitle").textContent = task ? "Edit Task" : "Add Task";
  $("taskTitle").value = task?.title || "";
  $("taskDate").value = task?.date || dateKey(date);
  $("taskCategory").value = task?.category || "Personal";
  $("taskNotes").value = task?.notes || "";
  $("deleteTaskButton").classList.toggle("hidden", !task);
  openModal("taskModal");
  setTimeout(() => $("taskTitle").focus(), 0);
}

async function saveTask(event) {
  event.preventDefault();

  const title = $("taskTitle").value.trim();
  const date = $("taskDate").value;
  if (!title || !date) return;

  const existing = state.editingTaskId
    ? state.tasks.find((task) => task.id === state.editingTaskId)
    : null;

  const task = {
    id: existing?.id || createId(),
    title,
    date,
    category: $("taskCategory").value,
    notes: $("taskNotes").value.trim(),
    completed: existing?.completed || false,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  await putTask(task);
  await refreshTasks();

  state.selectedDate = dateFromKey(date);
  state.viewDate = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);

  closeModal("taskModal");
  render();
  showToast(existing ? "Task updated" : "Task added");
}

async function removeEditingTask() {
  if (!state.editingTaskId) return;
  if (!confirm("Delete this task?")) return;

  await deleteTask(state.editingTaskId);
  await refreshTasks();
  closeModal("taskModal");
  render();
  showToast("Task deleted");
}

function openDetails(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  $("detailsTitle").textContent = "Task details";
  $("detailsContent").innerHTML = `
    <div class="task-details">
      <div class="detail-title">${escapeHtml(task.title)}</div>
      <div class="detail-meta">
        <span class="chip">${escapeHtml(task.category)}</span>
        <span class="chip">${escapeHtml(formatDate(dateFromKey(task.date)))}</span>
        <span class="chip">${task.completed ? "Completed" : "Open"}</span>
      </div>
      ${task.notes ? `<div class="detail-notes">${escapeHtml(task.notes)}</div>` : `<div class="empty-state">No notes.</div>`}
      <div class="detail-actions">
        <button class="ghost-button" id="detailEdit">Edit</button>
        <button class="danger-button" id="detailDelete">Delete</button>
      </div>
    </div>
  `;

  $("detailEdit").onclick = () => {
    closeModal("detailsModal");
    openTaskEditor(task.id);
  };

  $("detailDelete").onclick = async () => {
    if (!confirm("Delete this task?")) return;
    await deleteTask(task.id);
    await refreshTasks();
    closeModal("detailsModal");
    render();
    showToast("Task deleted");
  };

  openModal("detailsModal");
}

function openSearch() {
  $("searchInput").value = "";
  renderSearchResults("");
  openModal("searchModal");
  setTimeout(() => $("searchInput").focus(), 0);
}

function renderSearchResults(query) {
  const q = query.trim().toLowerCase();
  const results = state.tasks.filter((task) => {
    if (!q) return true;
    return [task.title, task.notes, task.category, task.date].some((value) =>
      String(value || "").toLowerCase().includes(q)
    );
  }).slice(0, 100);

  const container = $("searchResults");
  container.innerHTML = "";

  if (!results.length) {
    container.innerHTML = `<div class="empty-state">No matching tasks.</div>`;
    return;
  }

  results.forEach((task) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "search-result";
    row.innerHTML = `
      <div class="search-result-title">${escapeHtml(task.title)}</div>
      <div class="search-result-meta">${escapeHtml(formatDate(dateFromKey(task.date)))} · ${escapeHtml(task.category)} · ${task.completed ? "Completed" : "Open"}</div>
    `;
    row.addEventListener("click", () => {
      const date = dateFromKey(task.date);
      state.selectedDate = date;
      state.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
      closeModal("searchModal");
      render();
    });
    container.appendChild(row);
  });
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function bindEvents() {
  $("prevMonth").addEventListener("click", () => {
    state.viewDate = addMonths(state.viewDate, -1);
    renderCalendar();
  });

  $("nextMonth").addEventListener("click", () => {
    state.viewDate = addMonths(state.viewDate, 1);
    renderCalendar();
  });

  const goToday = () => {
    const today = startOfDay(new Date());
    state.viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    state.selectedDate = today;
    render();
  };

  $("todayButton").addEventListener("click", goToday);
  $("monthToday").addEventListener("click", goToday);
  $("addTaskButton").addEventListener("click", () => openTaskEditor());
  $("addSelectedTask").addEventListener("click", () => openTaskEditor(null, state.selectedDate));
  $("taskForm").addEventListener("submit", saveTask);
  $("deleteTaskButton").addEventListener("click", removeEditingTask);
  $("searchButton").addEventListener("click", openSearch);
  $("searchInput").addEventListener("input", (event) => renderSearchResults(event.target.value));

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.close));
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal:not(.hidden)").forEach((modal) => closeModal(modal.id));
    }
  });
}

async function init() {
  try {
    database = await openDatabase();
    await refreshTasks();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    alert("Could not open the local task database. Please use a modern browser.");
  }
}

init();
