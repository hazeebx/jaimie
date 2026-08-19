const STORAGE_KEY = "jetbrains-event-countdown-events";

const state = {
  screen: "home",
  events: loadEvents()
};

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
}

function daysRemaining(dateString) {
  const target = new Date(dateString + "T23:59:59");
  const now = new Date();
  const diff = target - now;
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(dateString + "T12:00:00"));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function render() {
  document.querySelector("#app").innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand"><div class="logo"></div> Event Countdown</div>
        <nav class="nav">
          <button class="${state.screen === "home" ? "active" : ""}" data-action="home">Events</button>
          <button data-action="add">+ Add New</button>
        </nav>
      </header>
      <main class="main">${state.screen === "home" ? renderHome() : renderAdd()}</main>
    </div>
  `;

  bindEvents();
}

function renderHome() {
  return `
    <section>
      <div class="screen-title">
        <div>
          <div class="eyebrow">Countdown / Overview</div>
          <h1>Upcoming Events</h1>
          <p class="subtitle">${state.events.length} saved event${state.events.length === 1 ? "" : "s"}</p>
        </div>
        <button class="primary" data-action="add">+ Add New</button>
      </div>

      ${state.events.length ? `
        <div class="cards">
          ${state.events.map(renderCard).join("")}
        </div>
      ` : `
        <div class="empty">
          <div>
            <div class="empty-icon">◌</div>
            <strong>No countdowns yet</strong>
            <p>Create your first event to start counting down.</p>
            <button class="primary" data-action="add">+ Add New</button>
          </div>
        </div>
      `}
    </section>
  `;
}

function renderCard(event) {
  const days = daysRemaining(event.date);
  const created = new Date(event.createdAt);
  const ageDays = Math.max(1, Math.ceil((new Date(event.date) - created) / 86400000));
  const progress = Math.min(360, Math.max(0, ((ageDays - days) / ageDays) * 360));

  return `
    <article class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">${escapeHtml(event.name)}</h2>
          <div class="card-date">${formatDate(event.date)}</div>
        </div>
        <div class="menu">
          <button class="menu-btn" data-menu="${event.id}">⋮</button>
          <div class="menu-panel" id="menu-${event.id}">
            <button data-action="delete" data-id="${event.id}" class="delete">Delete</button>
          </div>
        </div>
      </div>

      <div class="dial-wrap">
        <div class="dial" style="--progress:${progress}deg">
          <div class="dial-inner">
            <div class="days">
              <strong>${days}</strong>
              <span>${days === 1 ? "day left" : "days left"}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card-footer">
        <span>${days === 0 ? "Event day" : "Counting down"}</span>
        <span>${days === 0 ? "Today" : formatDate(event.date)}</span>
      </div>
    </article>
  `;
}

function renderAdd() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <section class="form-screen">
      <div class="screen-title">
        <div>
          <div class="eyebrow">Countdown / New Event</div>
          <h1>Add New Event</h1>
          <p class="subtitle">Create a countdown and track the days remaining.</p>
        </div>
      </div>

      <form class="form-panel" id="event-form">
        <div class="field">
          <label for="event-name">Event name</label>
          <input id="event-name" name="name" type="text" maxlength="80"
                 placeholder="e.g. Vacation, Exam, Project Launch" autocomplete="off" required>
        </div>

        <div class="field">
          <label for="event-date">Event date</label>
          <input id="event-date" name="date" type="date" min="${today}" required>
        </div>

        <div class="field">
          <label>Days remaining</label>
          <div class="days-preview">
            <div class="preview-number" id="preview-days">—</div>
            <div class="preview-copy" id="preview-copy">Choose an event date to calculate the countdown.</div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="secondary" data-action="home">Cancel</button>
          <button type="submit" class="primary">Create Countdown</button>
        </div>
      </form>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action='home']").forEach(btn =>
    btn.addEventListener("click", () => {
      state.screen = "home";
      render();
    })
  );

  document.querySelectorAll("[data-action='add']").forEach(btn =>
    btn.addEventListener("click", () => {
      state.screen = "add";
      render();
    })
  );

  document.querySelectorAll("[data-menu]").forEach(btn =>
    btn.addEventListener("click", e => {
      e.stopPropagation();
      document.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
      btn.parentElement.classList.toggle("open");
    })
  );

  document.querySelectorAll("[data-action='delete']").forEach(btn =>
    btn.addEventListener("click", () => {
      state.events = state.events.filter(e => e.id !== btn.dataset.id);
      saveEvents();
      render();
    })
  );

  document.addEventListener("click", closeMenusOnce, { once: true });

  const form = document.querySelector("#event-form");
  if (form) {
    const dateInput = form.querySelector("#event-date");
    dateInput.addEventListener("input", updatePreview);
    form.addEventListener("submit", createEvent);
  }
}

function closeMenusOnce() {
  document.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
}

function updatePreview() {
  const date = document.querySelector("#event-date").value;
  const number = document.querySelector("#preview-days");
  const copy = document.querySelector("#preview-copy");

  if (!date) {
    number.textContent = "—";
    copy.textContent = "Choose an event date to calculate the countdown.";
    return;
  }

  const days = daysRemaining(date);
  number.textContent = days;
  copy.textContent = days === 0
    ? "The event is today."
    : `${days} day${days === 1 ? "" : "s"} remaining until ${formatDate(date)}.`;
}

function createEvent(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const name = form.querySelector("#event-name").value.trim();
  const date = form.querySelector("#event-date").value;

  if (!name || !date) return;

  state.events.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    name,
    date,
    createdAt: new Date().toISOString()
  });

  saveEvents();
  state.screen = "home";
  render();
}

render();
