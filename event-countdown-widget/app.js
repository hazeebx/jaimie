/* =========================================================
   JAIMIE — EVENT COUNTDOWN
   =========================================================
   Centralized storage:
       jaimie-data → "event-countdown"

   Legacy storage:
       localStorage → jetbrains-event-countdown-events

   The legacy copy is intentionally retained during migration.
   ========================================================= */

const JAIMIE_DATA_KEY = "event-countdown";

const LEGACY_STORAGE_KEY =
  "jetbrains-event-countdown-events";


const state = {
  screen: "home",
  events: []
};


/* =========================================================
   STORAGE
   ========================================================= */

async function loadEvents() {

  /*
   * Primary source:
   * centralized JAIMIE data.
   */
  const stored =
    await JAIMIEData.load(
      JAIMIE_DATA_KEY
    );


  if (Array.isArray(stored)) {

    state.events = stored;

    return;

  }


  /*
   * Migration path:
   *
   * old localStorage
   *        ↓
   * JAIMIEData
   */
  let legacy = [];


  try {

    legacy =
      JSON.parse(
        localStorage.getItem(
          LEGACY_STORAGE_KEY
        )
      ) || [];

  }

  catch {

    legacy = [];

  }


  if (Array.isArray(legacy)) {

    state.events = legacy;

  }

  else {

    state.events = [];

  }


  /*
   * Save migrated data into
   * the centralized JAIMIE store.
   */
  await JAIMIEData.save(
    JAIMIE_DATA_KEY,
    state.events
  );

}


async function saveEvents() {

  /*
   * PRIMARY STORAGE
   */
  await JAIMIEData.save(
    JAIMIE_DATA_KEY,
    state.events
  );


  /*
   * TEMPORARY LEGACY BACKUP
   *
   * Keep the original localStorage
   * copy synchronized until migration
   * of the whole system is complete.
   */
  try {

    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify(
        state.events
      )
    );

  }

  catch (error) {

    console.warn(
      "Could not update legacy Event Countdown storage.",
      error
    );

  }

}


/* =========================================================
   COUNTDOWN
   ========================================================= */

function daysRemaining(
  dateString
) {

  const target =
    new Date(
      dateString +
      "T23:59:59"
    );

  const now =
    new Date();

  const diff =
    target - now;

  return Math.max(
    0,
    Math.ceil(
      diff /
      86400000
    )
  );

}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatDate(
  dateString
) {

  return new Intl.DateTimeFormat(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  ).format(
    new Date(
      dateString +
      "T12:00:00"
    )
  );

}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

  document.querySelector(
    "#app"
  ).innerHTML = `

    <div class="app">

      <header class="topbar">

        <div class="brand">
          <div class="logo"></div>
          Event Countdown
        </div>

        <nav class="nav">

          <button
            class="${
              state.screen === "home"
                ? "active"
                : ""
            }"
            data-action="home"
          >
            Events
          </button>

          <button data-action="add">
            + Add New
          </button>

        </nav>

      </header>


      <main class="main">

        ${
          state.screen === "home"
            ? renderHome()
            : renderAdd()
        }

      </main>

    </div>

  `;


  bindEvents();

}


/* =========================================================
   HOME
   ========================================================= */

function renderHome() {

  return `

    <section>

      <div class="screen-title">

        <div>

          <div class="eyebrow">
            Countdown / Overview
          </div>

          <h1>
            Upcoming Events
          </h1>

          <p class="subtitle">
            ${
              state.events.length
            }
            saved event${
              state.events.length === 1
                ? ""
                : "s"
            }
          </p>

        </div>

        <button
          class="primary"
          data-action="add"
        >
          + Add New
        </button>

      </div>


      ${
        state.events.length

          ? `

            <div class="cards">

              ${
                state.events
                  .map(renderCard)
                  .join("")
              }

            </div>

          `

          : `

            <div class="empty">

              <div>

                <div class="empty-icon">
                  ◌
                </div>

                <strong>
                  No countdowns yet
                </strong>

                <p>
                  Create your first event
                  to start counting down.
                </p>

                <button
                  class="primary"
                  data-action="add"
                >
                  + Add New
                </button>

              </div>

            </div>

          `
      }

    </section>

  `;

}


/* =========================================================
   EVENT CARD
   ========================================================= */

function renderCard(event) {

  const days =
    daysRemaining(
      event.date
    );


  const created =
    new Date(
      event.createdAt
    );


  const ageDays =
    Math.max(
      1,
      Math.ceil(
        (
          new Date(event.date) -
          created
        ) /
        86400000
      )
    );


  const progress =
    Math.min(
      360,
      Math.max(
        0,
        (
          (
            ageDays -
            days
          ) /
          ageDays
        ) *
        360
      )
    );


  return `

    <article class="card">

      <div class="card-head">

        <div>

          <h2 class="card-title">
            ${escapeHtml(
              event.name
            )}
          </h2>

          <div class="card-date">
            ${formatDate(
              event.date
            )}
          </div>

        </div>


        <div class="menu">

          <button
            class="menu-btn"
            data-menu="${event.id}"
          >
            ⋮
          </button>

          <div
            class="menu-panel"
            id="menu-${event.id}"
          >

            <button
              data-action="delete"
              data-id="${event.id}"
              class="delete"
            >
              Delete
            </button>

          </div>

        </div>

      </div>


      <div class="dial-wrap">

        <div
          class="dial"
          style="--progress:${progress}deg"
        >

          <div class="dial-inner">

            <div class="days">

              <strong>
                ${days}
              </strong>

              <span>
                ${
                  days === 1
                    ? "day left"
                    : "days left"
                }
              </span>

            </div>

          </div>

        </div>

      </div>


      <div class="card-footer">

        <span>
          ${
            days === 0
              ? "Event day"
              : "Counting down"
          }
        </span>

        <span>
          ${
            days === 0
              ? "Today"
              : formatDate(event.date)
          }
        </span>

      </div>

    </article>

  `;

}


/* =========================================================
   ADD EVENT
   ========================================================= */

function renderAdd() {

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);


  return `

    <section class="form-screen">

      <div class="screen-title">

        <div>

          <div class="eyebrow">
            Countdown / New Event
          </div>

          <h1>
            Add New Event
          </h1>

          <p class="subtitle">
            Create a countdown and
            track the days remaining.
          </p>

        </div>

      </div>


      <form
        class="form-panel"
        id="event-form"
      >

        <div class="field">

          <label for="event-name">
            Event name
          </label>

          <input
            id="event-name"
            name="name"
            type="text"
            maxlength="80"
            placeholder="e.g. Vacation, Exam, Project Launch"
            autocomplete="off"
            required
          >

        </div>


        <div class="field">

          <label for="event-date">
            Event date
          </label>

          <input
            id="event-date"
            name="date"
            type="date"
            min="${today}"
            required
          >

        </div>


        <div class="field">

          <label>
            Days remaining
          </label>

          <div class="days-preview">

            <div
              class="preview-number"
              id="preview-days"
            >
              —
            </div>

            <div
              class="preview-copy"
              id="preview-copy"
            >
              Choose an event date to
              calculate the countdown.
            </div>

          </div>

        </div>


        <div class="form-actions">

          <button
            type="button"
            class="secondary"
            data-action="home"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="primary"
          >
            Create Countdown
          </button>

        </div>

      </form>

    </section>

  `;

}


/* =========================================================
   EVENT BINDINGS
   ========================================================= */

function bindEvents() {

  /*
   * HOME buttons
   */
  document
    .querySelectorAll(
      "[data-action='home']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.screen =
              "home";

            render();

          }
        );

      }
    );


  /*
   * ADD buttons
   */
  document
    .querySelectorAll(
      "[data-action='add']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.screen =
              "add";

            render();

          }
        );

      }
    );


  /*
   * Event menu
   */
  document
    .querySelectorAll(
      "[data-menu]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            document
              .querySelectorAll(
                ".menu"
              )
              .forEach(
                menu =>
                  menu.classList.remove(
                    "open"
                  )
              );


            button.parentElement
              .classList
              .toggle(
                "open"
              );

          }
        );

      }
    );


  /*
   * Delete
   */
  document
    .querySelectorAll(
      "[data-action='delete']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            state.events =
              state.events.filter(
                event =>
                  event.id !==
                  button.dataset.id
              );


            await saveEvents();

            render();

          }
        );

      }
    );


  /*
   * Close open menus.
   */
  document.addEventListener(
    "click",
    closeMenusOnce,
    {
      once: true
    }
  );


  /*
   * Add form.
   */
  const form =
    document.querySelector(
      "#event-form"
    );


  if (form) {

    const dateInput =
      form.querySelector(
        "#event-date"
      );


    dateInput.addEventListener(
      "input",
      updatePreview
    );


    form.addEventListener(
      "submit",
      createEvent
    );

  }

}


/* =========================================================
   MENU CLOSE
   ========================================================= */

function closeMenusOnce() {

  document
    .querySelectorAll(
      ".menu"
    )
    .forEach(
      menu =>
        menu.classList.remove(
          "open"
        )
    );

}


/* =========================================================
   PREVIEW
   ========================================================= */

function updatePreview() {

  const date =
    document.querySelector(
      "#event-date"
    ).value;


  const number =
    document.querySelector(
      "#preview-days"
    );


  const copy =
    document.querySelector(
      "#preview-copy"
    );


  if (!date) {

    number.textContent =
      "—";

    copy.textContent =
      "Choose an event date to calculate the countdown.";

    return;

  }


  const days =
    daysRemaining(
      date
    );


  number.textContent =
    days;


  copy.textContent =
    days === 0

      ? "The event is today."

      : `${days} day${
          days === 1
            ? ""
            : "s"
        } remaining until ${
          formatDate(date)
        }.`;

}


/* =========================================================
   CREATE EVENT
   ========================================================= */

async function createEvent(event) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const name =
    form
      .querySelector(
        "#event-name"
      )
      .value
      .trim();


  const date =
    form
      .querySelector(
        "#event-date"
      )
      .value;


  if (!name || !date) {
    return;
  }


  state.events.unshift({

    id:
      crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(),

    name,

    date,

    createdAt:
      new Date()
        .toISOString()

  });


  await saveEvents();


  state.screen =
    "home";


  render();

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

  try {

    await loadEvents();

    render();

  }

  catch (error) {

    console.error(
      "Event Countdown initialization failed:",
      error
    );


    state.events = [];

    render();

  }

}


init();