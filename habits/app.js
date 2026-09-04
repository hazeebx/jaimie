/* =========================================================
   JAIMIE — HABITS
   ========================================================= */

"use strict";


const DATA_KEY =
    "habits";


let selectedDate =
    key(
        new Date()
    );


let state = {

    habits: {},

    foodTrackers: {},

    completions: {}

};


let editingHabitId =
    null;


let editingFoodId =
    null;


let historyHabitId =
    null;


const DEFAULT_HABIT_COLOR =
    "#ff8a2a";


/* =========================================================
   HELPERS
   ========================================================= */

function $(
    id
) {

    return document.getElementById(
        id
    );

}


function uid() {

    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() +
            "-" +
            Math.random();

}


function key(
    date
) {

    const d =
        new Date(
            date
        );


    return (
        d.getFullYear() +
        "-" +
        String(
            d.getMonth() + 1
        ).padStart(2, "0") +
        "-" +
        String(
            d.getDate()
        ).padStart(2, "0")
    );

}


function dateFromKey(
    value
) {

    const [
        year,
        month,
        day
    ] =
        value
            .split("-")
            .map(Number);


    return new Date(
        year,
        month - 1,
        day
    );

}


function formatDate(
    date
) {

    return date.toLocaleDateString(
        undefined,
        {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    );

}


function escapeHtml(
    value
) {

    return String(
        value
    ).replace(
        /[&<>"']/g,
        char =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            })[char]
    );

}


/* =========================================================
   LOAD
   ========================================================= */

async function load() {

    const stored =
        await JAIMIEData.load(
            DATA_KEY
        );


    if (
        stored &&
        typeof stored === "object"
    ) {

        state = {

            habits:
                stored.habits ||
                {},

            foodTrackers:
                stored.foodTrackers ||
                {},

            completions:
                stored.completions ||
                {}

        };

    }

}


/* =========================================================
   SAVE
   ========================================================= */

async function save() {

    $("saveStatus")
        .textContent =
        "SAVING...";


    try {

        await JAIMIEData.save(
            DATA_KEY,
            state
        );


        $("saveStatus")
            .textContent =
            "SAVED";

    }

    catch (error) {

        console.error(
            "JAIMIE Habits: save failed.",
            error
        );


        $("saveStatus")
            .textContent =
            "SAVE ERROR";

    }

}


/* =========================================================
   DATE
   ========================================================= */

function renderDate() {

    const date =
        dateFromKey(
            selectedDate
        );


    $("todayLabel")
        .textContent =
        formatDate(
            date
        ).toUpperCase();


    const isToday =
        selectedDate ===
        key(
            new Date()
        );


    $("todayBtn")
        .disabled =
        isToday;


    $("habitsHeading")
        .textContent =
        isToday
            ? "Today's Habits"
            : "Habits for This Day";

}


function habitColor(
    habit
) {

    const color =
        String(
            habit?.color ||
            DEFAULT_HABIT_COLOR
        );


    return /^#[0-9a-f]{6}$/i.test(
        color
    )
        ? color
        : DEFAULT_HABIT_COLOR;

}


function dateRangeEndingOn(
    endDateKey,
    count
) {

    const end =
        dateFromKey(
            endDateKey
        );


    return Array.from(
        { length: count },
        (_, index) => {

            const date =
                new Date(
                    end
                );


            date.setDate(
                date.getDate() -
                (count - index - 1)
            );


            return key(
                date
            );

        }
    );

}


/* =========================================================
   HABITS
   ========================================================= */

function getCompletionBucket() {

    if (
        !state.completions[
            selectedDate
        ]
    ) {

        state.completions[
            selectedDate
        ] = {};

    }


    return state.completions[
        selectedDate
    ];

}


function isHabitComplete(
    habitId
) {

    return !!getCompletionBucket()[
        habitId
    ];

}


function toggleHabit(
    habitId,
    dateKey = selectedDate
) {

    if (
        !state.completions[
            dateKey
        ]
    ) {

        state.completions[
            dateKey
        ] = {};

    }


    const bucket =
        state.completions[
            dateKey
        ];


    bucket[
        habitId
    ] =
        !bucket[
            habitId
        ];


    save();

    renderHabits();


    if (
        historyHabitId ===
        habitId
    ) {

        renderHabitHistory();

    }

}


function calculateHabitStreak(
    habitId
) {

    let streak =
        0;


    const date =
        dateFromKey(
            selectedDate
        );


    while (true) {

        const dateKey =
            key(
                date
            );


        if (
            state.completions?.[
                dateKey
            ]?.[
                habitId
            ]
        ) {

            streak += 1;

            date.setDate(
                date.getDate() -
                1
            );

        }

        else {

            break;

        }

    }


    return streak;

}


function habitDayCells(
    habit,
    days,
    className
) {

    return days
        .map(
            dateKey => {

                const marked =
                    !!state.completions?.[
                        dateKey
                    ]?.[
                        habit.id
                    ];


                const date =
                    dateFromKey(
                        dateKey
                    );


                const label =
                    `${formatDate(date)}: ${
                        marked
                            ? "completed"
                            : "not completed"
                    }`;


                return `

                    <button
                        class="${className} ${marked ? "marked" : ""} ${dateKey === selectedDate ? "selected" : ""}"
                        type="button"
                        data-habit-day="${escapeHtml(habit.id)}"
                        data-date="${dateKey}"
                        aria-label="${escapeHtml(label)}"
                        title="${escapeHtml(label)}"
                    >${
                        className === "habit-day"
                            ? `<span>${date.getDate()}</span>`
                            : ""
                    }</button>

                `;

            }
        )
        .join("");

}


function renderHabits() {

    const list =
        $("habitList");


    const habits =
        Object.values(
            state.habits
        )
        .sort(
            (
                a,
                b
            ) =>
                String(
                    a.createdAt
                ).localeCompare(
                    String(
                        b.createdAt
                    )
                )
        );


    if (!habits.length) {

        list.innerHTML = `

            <div class="empty-state">

                <div>

                    <strong>
                        No habits yet.
                    </strong>

                    Add your first habit to
                    start building consistency.

                </div>

            </div>

        `;

        return;

    }


    list.innerHTML =
        habits
            .map(
                habit => {

                    const complete =
                        isHabitComplete(
                            habit.id
                        );


                    const streak =
                        calculateHabitStreak(
                            habit.id
                        );


                    const color =
                        habitColor(
                            habit
                        );


                    const recentDays =
                        dateRangeEndingOn(
                            selectedDate,
                            28
                        );


                    return `

                        <article
                            class="habit-item ${
                                complete
                                    ? "completed"
                                    : ""
                            }"
                            style="--habit-color: ${color}"
                        >

                            <div class="habit-card-header">

                            <button
                                class="habit-check"
                                type="button"
                                data-habit-check="${escapeHtml(
                                    habit.id
                                )}"
                            >

                                <span
                                    class="habit-check-mark"
                                >
                                    ✓
                                </span>

                            </button>


                            <div
                                class="habit-main"
                            >

                                <div
                                    class="habit-name"
                                >
                                    ${escapeHtml(
                                        habit.name
                                    )}
                                </div>


                            </div>


                            <div
                                class="habit-actions"
                            >

                                <button
                                    class="habit-mini"
                                    type="button"
                                    title="Edit habit"
                                    data-edit-habit="${escapeHtml(
                                        habit.id
                                    )}"
                                >
                                    ✎
                                </button>


                                <button
                                    class="habit-mini"
                                    type="button"
                                    title="Delete habit"
                                    data-delete-habit="${escapeHtml(
                                        habit.id
                                    )}"
                                >
                                    ×
                                </button>

                            </div>

                            </div>


                            <div class="habit-grid-header">
                                <span class="habit-grid-streak">
                                    ${
                                        streak > 0
                                            ? `<strong>${streak}</strong> DAY STREAK`
                                            : "NO STREAK"
                                    }
                                </span>
                                <span>
                                    ${escapeHtml(
                                        dateFromKey(recentDays[0]).toLocaleDateString(
                                            undefined,
                                            { month: "short", day: "numeric" }
                                        ).toUpperCase()
                                    )}
                                    —
                                    ${escapeHtml(
                                        dateFromKey(recentDays[recentDays.length - 1]).toLocaleDateString(
                                            undefined,
                                            { month: "short", day: "numeric" }
                                        ).toUpperCase()
                                    )}
                                </span>
                            </div>


                            <div class="habit-grid" aria-label="Last 28 days">
                                ${habitDayCells(habit, recentDays, "habit-day")}
                            </div>


                            <button
                                class="history-button"
                                type="button"
                                data-show-history="${escapeHtml(habit.id)}"
                            >
                                SHOW 1 YEAR HISTORY
                            </button>

                        </article>

                    `;

                }
            )
            .join("");


    bindHabitButtons();

}


function bindHabitButtons() {

    document
        .querySelectorAll(
            "[data-habit-day]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        toggleHabit(
                            button.dataset.habitDay,
                            button.dataset.date
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-show-history]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        openHabitHistory(
                            button.dataset.showHistory
                        );

            }
        );

    document
        .querySelectorAll(
            "[data-habit-check]"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        toggleHabit(
                            button.dataset
                                .habitCheck
                        );

                    };

            }
        );


    document
        .querySelectorAll(
            "[data-edit-habit]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        openHabitModal(
                            button.dataset
                                .editHabit
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-delete-habit]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        const habit =
                            state.habits[
                                button.dataset
                                    .deleteHabit
                            ];


                        if (!habit) {

                            return;

                        }


                        if (
                            !confirm(
                                `Delete "${habit.name}"?`
                            )
                        ) {

                            return;

                        }


                        delete state.habits[
                            habit.id
                        ];


                        Object.keys(
                            state.completions
                        )
                        .forEach(
                            date => {

                                delete state
                                    .completions
                                    [date]
                                    [habit.id];

                            }
                        );


                        await save();

                        renderHabits();

                    };

            }
        );

}


function openHabitHistory(
    habitId
) {

    historyHabitId =
        habitId;


    renderHabitHistory();

    openModal(
        "habitHistoryModal"
    );

}


function renderHabitHistory() {

    const habit =
        state.habits[
            historyHabitId
        ];


    if (!habit) {

        closeModal(
            "habitHistoryModal"
        );

        return;

    }


    const days =
        dateRangeEndingOn(
            selectedDate,
            365
        );


    const markedCount =
        days.filter(
            dateKey =>
                !!state.completions?.[
                    dateKey
                ]?.[
                    habit.id
                ]
        ).length;


    const color =
        habitColor(
            habit
        );


    $("habitHistoryTitle")
        .textContent =
        `${habit.name} History`;


    $("habitHistorySummary")
        .innerHTML = `
            <span>365 DAYS ENDING ${escapeHtml(formatDate(dateFromKey(selectedDate)).toUpperCase())}</span>
            <strong>${markedCount} MARKED</strong>
        `;


    $("habitHistoryGrid")
        .style
        .setProperty(
            "--habit-color",
            color
        );


    $("habitHistoryGrid")
        .closest(
            ".history-modal"
        )
        .style
        .setProperty(
            "--habit-color",
            color
        );


    $("habitHistoryGrid")
        .innerHTML =
        habitDayCells(
            habit,
            days,
            "history-day"
        );


    $("habitHistoryGrid")
        .querySelectorAll(
            "[data-habit-day]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        toggleHabit(
                            button.dataset.habitDay,
                            button.dataset.date
                        );

            }
        );

}


/* =========================================================
   HABIT MODAL
   ========================================================= */

function openHabitModal(
    habitId = null
) {

    editingHabitId =
        habitId;


    const habit =
        habitId
            ? state.habits[
                habitId
              ]
            : null;


    $("habitModalTitle")
        .textContent =
        habit
            ? "Edit Habit"
            : "Add Habit";


    $("habitName")
        .value =
        habit?.name ||
        "";


    $("habitColor")
        .value =
        habitColor(
            habit
        );


    openModal(
        "habitModal"
    );

}


async function submitHabit(
    event
) {

    event.preventDefault();


    const name =
        $("habitName")
            .value
            .trim();


    const color =
        habitColor({
            color:
                $("habitColor")
                    .value
        });


    if (!name) {

        return;

    }


    const id =
        editingHabitId ||
        uid();


    state.habits[
        id
    ] = {

        id,

        name,

        color,

        createdAt:
            state.habits[
                id
            ]?.createdAt ||
            selectedDate

    };


    await save();


    closeModal(
        "habitModal"
    );


    renderHabits();

}


/* =========================================================
   FOOD RECENCY
   ========================================================= */

function daysSince(
    dateValue
) {

    if (!dateValue) {

        return null;

    }


    const today =
        dateFromKey(
            selectedDate
        );


    const last =
        dateFromKey(
            dateValue
        );


    today.setHours(
        0,
        0,
        0,
        0
    );


    last.setHours(
        0,
        0,
        0,
        0
    );


    return Math.floor(
        (
            today -
            last
        ) /
        86400000
    );

}


function getFoodStatus(
    food
) {

    if (
        !food.lastEaten
    ) {

        return {

            className:
                "unknown",

            label:
                "NOT YET EATEN"

        };

    }


    const elapsed =
        daysSince(
            food.lastEaten
        );


    const interval =
        Number(
            food.intervalDays
        ) ||
        1;


    const remaining =
        interval -
        elapsed;


    if (
        elapsed >=
        interval
    ) {

        return {

            className:
                "overdue",

            label:
                "OVERDUE"

        };

    }


    if (
        remaining <= 1
    ) {

        return {

            className:
                "due",

            label:
                "DUE SOON"

        };

    }


    return {

        className:
            "safe",

        label:
            "ON TRACK"

    };

}


function lastEatenText(
    food
) {

    if (
        !food.lastEaten
    ) {

        return "Never recorded";

    }


    if (
        food.lastEaten ===
        selectedDate
    ) {

        return "Eaten today";

    }


    const elapsed =
        daysSince(
            food.lastEaten
        );


    if (
        elapsed === 1
    ) {

        return "Eaten yesterday";

    }


    return `Eaten ${elapsed} days ago`;

}


function renderFoodTracker() {

    const tracker =
        $("foodTracker");


    const foods =
        Object.values(
            state.foodTrackers
        )
        .sort(
            (
                a,
                b
            ) =>
                String(
                    a.name
                ).localeCompare(
                    String(
                        b.name
                    )
                )
        );


    if (!foods.length) {

        tracker.innerHTML = `

            <div class="empty-state">

                <div>

                    <strong>
                        No foods are being tracked.
                    </strong>

                    Add foods that you want
                    to keep within a specific
                    time window.

                </div>

            </div>

        `;

        return;

    }


    tracker.innerHTML =
        foods
            .map(
                food => {

                    const status =
                        getFoodStatus(
                            food
                        );


                    const elapsed =
                        food.lastEaten
                            ? daysSince(
                                food.lastEaten
                            )
                            : null;


                    const interval =
                        Number(
                            food.intervalDays
                        ) ||
                        1;


                    let subtext =
                        `Every ${interval} ${
                            interval === 1
                                ? "day"
                                : "days"
                        }`;


                    if (
                        elapsed !== null
                    ) {

                        const remaining =
                            Math.max(
                                0,
                                interval -
                                elapsed
                            );


                        if (
                            remaining === 0
                        ) {

                            subtext +=
                                " · due now";

                        }

                        else {

                            subtext +=
                                ` · ${
                                    remaining
                                } ${
                                    remaining === 1
                                        ? "day"
                                        : "days"
                                } remaining`;

                        }

                    }


                    return `

                        <article
                            class="food-track-row"
                        >

                            <div
                                class="food-main"
                            >

                                <div
                                    class="food-name"
                                >
                                    ${escapeHtml(
                                        food.name
                                    )}
                                </div>

                                <div
                                    class="food-sub"
                                >
                                    ${escapeHtml(
                                        subtext
                                    )}
                                </div>

                            </div>


                            <div
                                class="food-last"
                            >
                                ${escapeHtml(
                                    lastEatenText(
                                        food
                                    )
                                )}
                            </div>


                            <div>

                                <span
                                    class="food-status ${
                                        status.className
                                    }"
                                >
                                    ${status.label}
                                </span>

                            </div>


                            <div
                                class="food-actions"
                            >

                                <button
                                    class="eat-btn"
                                    type="button"
                                    data-eaten="${escapeHtml(
                                        food.id
                                    )}"
                                >
                                    EATEN TODAY
                                </button>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");


    document
        .querySelectorAll(
            "[data-eaten]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        const food =
                            state.foodTrackers[
                                button.dataset
                                    .eaten
                            ];


                        if (!food) {

                            return;

                        }


                        food.lastEaten =
                            selectedDate;


                        await save();


                        renderFoodTracker();

                        renderFoodList();

                    };

            }
        );

}


/* =========================================================
   FOOD LIST
   ========================================================= */

function renderFoodList() {

    const list =
        $("foodList");


    const foods =
        Object.values(
            state.foodTrackers
        )
        .sort(
            (
                a,
                b
            ) =>
                String(
                    a.name
                ).localeCompare(
                    String(
                        b.name
                    )
                )
        );


    $("foodCount")
        .textContent =
        `${foods.length} ${
            foods.length === 1
                ? "FOOD"
                : "FOODS"
        }`;


    if (!foods.length) {

        list.innerHTML = `

            <div class="empty-state">

                No foods configured.

            </div>

        `;

        return;

    }


    list.innerHTML =
        foods
            .map(
                food => `

                    <div
                        class="food-list-row"
                    >

                        <div>

                            <div
                                class="food-name"
                            >
                                ${escapeHtml(
                                    food.name
                                )}
                            </div>

                        </div>


                        <div
                            class="food-interval"
                        >
                            EVERY ${
                                food.intervalDays
                            } ${
                                Number(
                                    food.intervalDays
                                ) === 1
                                    ? "DAY"
                                    : "DAYS"
                            }
                        </div>


                        <div
                            class="food-row-actions"
                        >

                            <button
                                class="habit-mini"
                                type="button"
                                title="Edit food"
                                data-edit-food="${escapeHtml(
                                    food.id
                                )}"
                            >
                                ✎
                            </button>


                            <button
                                class="habit-mini"
                                type="button"
                                title="Delete food"
                                data-delete-food="${escapeHtml(
                                    food.id
                                )}"
                            >
                                ×
                            </button>

                        </div>

                    </div>

                `
            )
            .join("");


    document
        .querySelectorAll(
            "[data-edit-food]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        openFoodModal(
                            button.dataset
                                .editFood
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-delete-food]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        const food =
                            state.foodTrackers[
                                button.dataset
                                    .deleteFood
                            ];


                        if (!food) {

                            return;

                        }


                        if (
                            !confirm(
                                `Stop tracking "${food.name}"?`
                            )
                        ) {

                            return;

                        }


                        delete state
                            .foodTrackers[
                                food.id
                            ];


                        await save();

                        renderFoodTracker();

                        renderFoodList();

                    };

            }
        );

}


/* =========================================================
   FOOD MODAL
   ========================================================= */

function openFoodModal(
    foodId = null
) {

    editingFoodId =
        foodId;


    const food =
        foodId
            ? state.foodTrackers[
                foodId
              ]
            : null;


    $("foodModalTitle")
        .textContent =
        food
            ? "Edit Food"
            : "Add Food to Track";


    $("foodName")
        .value =
        food?.name ||
        "";


    $("foodInterval")
        .value =
        food?.intervalDays ||
        3;


    $("foodLastEaten")
        .value =
        food?.lastEaten ||
        "";


    openModal(
        "foodModal"
    );

}


async function submitFood(
    event
) {

    event.preventDefault();


    const name =
        $("foodName")
            .value
            .trim();


    const intervalDays =
        Number(
            $("foodInterval")
                .value
        );


    const lastEaten =
        $("foodLastEaten")
            .value ||
        null;


    if (
        !name ||
        intervalDays < 1
    ) {

        return;

    }


    const id =
        editingFoodId ||
        uid();


    state.foodTrackers[
        id
    ] = {

        id,

        name,

        intervalDays,

        lastEaten

    };


    await save();


    closeModal(
        "foodModal"
    );


    renderFoodTracker();

    renderFoodList();

}


/* =========================================================
   MODAL HELPERS
   ========================================================= */

function openModal(
    id
) {

    $(id)
        .classList
        .remove(
            "hidden"
        );

}


function closeModal(
    id
) {

    $(id)
        .classList
        .add(
            "hidden"
        );

}


function bindModalClose() {

    document
        .querySelectorAll(
            "[data-close]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        closeModal(
                            button.dataset
                                .close
                        );

            }
        );


    document
        .querySelectorAll(
            ".modal-backdrop"
        )
        .forEach(
            backdrop => {

                backdrop.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target ===
                            backdrop
                        ) {

                            closeModal(
                                backdrop.id
                            );

                        }

                    }
                );

            }
        );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !==
                "Escape"
            ) {

                return;

            }


            document
                .querySelectorAll(
                    ".modal-backdrop"
                )
                .forEach(
                    modal => {

                        modal.classList
                            .add(
                                "hidden"
                            );

                    }
                );

        }
    );

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

    renderDate();

    renderHabits();

    renderFoodTracker();

    renderFoodList();

}


/* =========================================================
   BIND UI
   ========================================================= */

function bind() {

    $("addHabitBtn")
        .onclick =
        () =>
            openHabitModal();


    $("habitForm")
        .onsubmit =
        submitHabit;


    $("addFoodBtn")
        .onclick =
        () =>
            openFoodModal();


    $("foodForm")
        .onsubmit =
        submitFood;


    $("prevDay")?.addEventListener(
        "click",
        () => {
            changeDay(-1);
        }
    );


    $("nextDay")?.addEventListener(
        "click",
        () => {
            changeDay(1);
        }
    );


    $("todayBtn")
        .onclick =
        () => {

            selectedDate =
                key(
                    new Date()
                );


            render();

        };


    bindModalClose();

}


/* =========================================================
   DAY NAVIGATION
   ========================================================= */

function changeDay(
    amount
) {

    const date =
        dateFromKey(
            selectedDate
        );


    date.setDate(
        date.getDate() +
        amount
    );


    selectedDate =
        key(
            date
        );


    render();

}


/* =========================================================
   BOOT
   ========================================================= */

async function init() {

    if (
        !window.JAIMIEData
    ) {

        console.error(
            "JAIMIE Habits: JAIMIEData unavailable."
        );

        $("saveStatus")
            .textContent =
            "DATA ERROR";

        return;

    }


    await load();


    bind();

    render();

}


init();
