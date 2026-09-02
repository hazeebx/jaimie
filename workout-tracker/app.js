/* =========================================================
   JAIMIE — WORKOUT TRACKER
   =========================================================
   PRIMARY STORAGE
       jaimie-data → "workout"

   TEMPORARY LEGACY BACKUP
       localStorage → jetbrains-workout-tracker-v1

   Data structure
       {
           selectedDate: "YYYY-MM-DD",
           days: {},
           workouts: []
       }
   ========================================================= */


const JAIMIE_DATA_KEY =
    "workout";


const LEGACY_KEY =
    "jetbrains-workout-tracker-v1";


/* =========================================================
   DEFAULT STATE
   ========================================================= */

const fresh = () => ({

    selectedDate:
        key(new Date()),

    days: {},

    workouts: []

});


/* =========================================================
   STATE
   ========================================================= */

let state = fresh();


/* =========================================================
   STORAGE
   ========================================================= */

async function loadData() {

    /*
     * First attempt:
     * centralized JAIMIE storage.
     */
    const stored =
        await JAIMIEData.load(
            JAIMIE_DATA_KEY
        );


    if (
        stored &&
        typeof stored === "object"
    ) {

        state = {
            ...fresh(),
            ...stored
        };


        /*
         * Make sure malformed/missing
         * collections don't break the page.
         */
        if (
            !state.days ||
            typeof state.days !== "object"
        ) {

            state.days = {};

        }


        if (
            !Array.isArray(
                state.workouts
            )
        ) {

            state.workouts = [];

        }


        return;

    }


    /*
     * No centralized data exists yet.
     *
     * Migrate the old localStorage
     * dataset.
     */
    try {

        const legacy =
            localStorage.getItem(
                LEGACY_KEY
            );


        if (legacy) {

            const parsed =
                JSON.parse(
                    legacy
                );


            state = {
                ...fresh(),
                ...(parsed || {})
            };


            if (
                !state.days ||
                typeof state.days !==
                    "object"
            ) {

                state.days = {};

            }


            if (
                !Array.isArray(
                    state.workouts
                )
            ) {

                state.workouts = [];

            }

        }

    }

    catch (error) {

        console.warn(
            "Could not migrate legacy workout data.",
            error
        );

        state = fresh();

    }


    /*
     * Save migrated data into
     * centralized JAIMIE storage.
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        state
    );

}


async function save() {

    /*
     * PRIMARY STORAGE
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        state
    );


    /*
     * TEMPORARY LEGACY BACKUP
     */
    try {

        localStorage.setItem(
            LEGACY_KEY,
            JSON.stringify(
                state
            )
        );

    }

    catch (error) {

        console.warn(
            "Could not update legacy workout storage.",
            error
        );

    }

}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function key(date) {

    date =
        new Date(date);


    return `${date.getFullYear()}-${
        String(
            date.getMonth() + 1
        ).padStart(2, "0")
    }-${
        String(
            date.getDate()
        ).padStart(2, "0")
    }`;

}


function currentDate() {

    return new Date(
        state.selectedDate +
        "T12:00:00"
    );

}


function day() {

    if (
        !state.days[
            state.selectedDate
        ]
    ) {

        state.days[
            state.selectedDate
        ] = {

            rest: false,

            exercises: []

        };

    }


    return state.days[
        state.selectedDate
    ];

}


/* =========================================================
   HELPERS
   ========================================================= */

function uid() {

    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() +
          "-" +
          Math.random();

}


function fmt(date) {

    return new Intl.DateTimeFormat(
        undefined,
        {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    ).format(date);

}


function esc(value) {

    return String(value).replace(
        /[&<>"']/g,
        char => ({
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

    const current =
        day();

    const date =
        currentDate();

    const today =
        state.selectedDate ===
        key(new Date());


    document.querySelector(
        "#app"
    ).innerHTML = `

        <div class="app">


            <header class="topbar">

                <div class="brand">

                    <div class="logo"></div>

                    Workout Tracker

                </div>


                <nav class="nav">

                    <button class="active">
                        Workout
                    </button>

                </nav>

            </header>


            <main class="main">


                <div class="day-header">

                    <button
                        class="day-nav"
                        data-a="prev"
                    >
                        ←
                    </button>


                    <div class="date-heading">

                        <div class="eyebrow">
                            Workout / Daily Log
                        </div>


                        <h1>
                            ${
                                today
                                    ? "Today's Workout"
                                    : fmt(date)
                            }
                        </h1>


                        <div class="date-label">
                            ${fmt(date)}
                        </div>


                        ${
                            !today
                                ? `
                                    <button
                                        class="today-btn"
                                        data-a="today"
                                    >
                                        Jump to today
                                    </button>
                                  `
                                : ""
                        }

                    </div>


                    <button
                        class="day-nav"
                        data-a="next"
                    >
                        →
                    </button>

                </div>


                <div class="layout">


                    <section class="workout-panel">

                        <div class="panel-header">

                            <div>

                                <div class="panel-title">

                                    ${
                                        current.rest
                                            ? "Rest Day"
                                            : "Workout Log"
                                    }

                                </div>


                                <div class="panel-subtitle">

                                    ${
                                        current.rest

                                            ? "Recovery day — no exercises scheduled."

                                            : `
                                                ${
                                                    current.exercises.length
                                                }
                                                exercise${
                                                    current.exercises.length ===
                                                    1
                                                        ? ""
                                                        : "s"
                                                }
                                                logged
                                              `
                                    }

                                </div>

                            </div>


                            <div class="actions">

                                <button
                                    class="secondary"
                                    data-a="rest"
                                >
                                    ${
                                        current.rest
                                            ? "Undo Rest Day"
                                            : "Mark Rest Day"
                                    }
                                </button>


                                <button
                                    class="secondary"
                                    data-a="pick"
                                >
                                    Select Workout
                                </button>


                                <button
                                    class="primary"
                                    data-a="add"
                                >
                                    + Add Exercise
                                </button>

                            </div>

                        </div>


                        ${
                            current.rest

                                ? `

                                    <div class="empty">

                                        <div>

                                            <div class="empty-icon">
                                                ◌
                                            </div>

                                            <strong>
                                                Recovery mode
                                            </strong>

                                            <p>
                                                This day is marked as a rest day.
                                            </p>

                                        </div>

                                    </div>

                                  `

                                : `

                                    <div class="exercise-list">

                                        ${
                                            current.exercises.length

                                                ? current.exercises
                                                    .map(
                                                        exercise
                                                    )
                                                    .join("")

                                                : `

                                                    <div class="empty">

                                                        <div>

                                                            <div class="empty-icon">
                                                                ＋
                                                            </div>

                                                            <strong>
                                                                No exercises yet
                                                            </strong>

                                                            <p>
                                                                Select a pre-made workout
                                                                or add exercises individually.
                                                            </p>

                                                        </div>

                                                    </div>

                                                  `
                                        }

                                    </div>

                                  `
                        }

                    </section>


                    <aside class="side-panel">

                        <div class="side-title">
                            Saved Workouts
                        </div>


                        <div class="side-copy">
                            Create reusable workouts with
                            full control over exercises,
                            sets and reps.
                        </div>


                        <div class="workout-library">

                            ${
                                state.workouts.length

                                    ? state.workouts
                                        .map(
                                            workout => `

                                                <div class="library-item">

                                                    <div>

                                                        <strong>
                                                            ${esc(
                                                                workout.name
                                                            )}
                                                        </strong>

                                                        <span>
                                                            ${
                                                                workout
                                                                    .exercises
                                                                    .length
                                                            }
                                                            exercises
                                                        </span>

                                                    </div>


                                                    <button
                                                        class="mini-btn"
                                                        data-use="${workout.id}"
                                                    >
                                                        Use
                                                    </button>

                                                </div>

                                              `
                                        )
                                        .join("")

                                    : `

                                        <div
                                            class="side-copy"
                                            style="padding:12px 2px"
                                        >
                                            No saved workouts yet.
                                        </div>

                                      `
                            }

                        </div>


                        <div
                            style="margin-top:14px"
                        >

                            <button
                                class="secondary"
                                data-a="manage"
                            >
                                Manage / Create Workouts
                            </button>

                        </div>

                    </aside>


                </div>


            </main>

        </div>

    `;


    bind();

}


/* =========================================================
   EXERCISE
   ========================================================= */

function exercise(exerciseData) {

    return `

        <article class="exercise">


            <button
                class="exercise-edit-menu"
                data-edit-exercise="${exerciseData.id}"
                aria-label="Edit ${esc(exerciseData.name)}"
                title="Edit exercise"
            >
                ⋮
            </button>


            <div class="exercise-main">


                <div>

                    <div class="exercise-name">

                        ${esc(
                            exerciseData.name
                        )}

                    </div>


                    <div class="exercise-meta">

                        ${
                            exerciseData.sets.length
                        }
                        sets planned · target
                        ${
                            exerciseData.targetReps ||
                            "—"
                        }
                        reps

                    </div>


                    <div class="set-counter">

                        ${
                            exerciseData
                                .sets
                                .map(
                                    (
                                        set,
                                        index
                                    ) => `

                                        <div
                                            class="set-chip ${
                                                set.done
                                                    ? "done"
                                                    : ""
                                            }"
                                        >

                                            <small>
                                                SET ${
                                                    index + 1
                                                }
                                            </small>

                                            ${
                                                set.reps
                                            }
                                            reps

                                        </div>

                                      `
                                )
                                .join("")
                        }


                        <button
                            class="counter-btn"
                            data-setadd="${exerciseData.id}"
                        >
                            +
                        </button>

                    </div>

                </div>


                <div class="exercise-actions">

                    <button
                        class="mini-btn"
                        data-done="${exerciseData.id}"
                    >
                        1 Set Done
                    </button>


                    <button
                        class="mini-btn"
                        data-undo="${exerciseData.id}"
                    >
                        Undo 1
                    </button>


                    <button
                        class="danger-btn"
                        data-remove="${exerciseData.id}"
                    >
                        ×
                    </button>

                </div>


            </div>


            <div class="set-row">

                <span class="set-label">
                    Reps:
                </span>


                ${
                    exerciseData
                        .sets
                        .map(
                            (
                                set,
                                index
                            ) => `

                                <input
                                    class="rep-input"
                                    type="number"
                                    min="0"
                                    value="${set.reps}"
                                    data-reps="${exerciseData.id}"
                                    data-i="${index}"
                                >

                              `
                        )
                        .join("")
                }

            </div>


        </article>

    `;

}


/* =========================================================
   DATE SHIFT
   ========================================================= */

async function shift(
    amount
) {

    const date =
        currentDate();


    date.setDate(
        date.getDate() +
        amount
    );


    state.selectedDate =
        key(date);


    await save();

    render();

}


/* =========================================================
   EVENT BINDINGS
   ========================================================= */

function bind() {

    document
        .querySelector(
            "[data-a=prev]"
        )
        .onclick =
        () =>
            shift(-1);


    document
        .querySelector(
            "[data-a=next]"
        )
        .onclick =
        () =>
            shift(1);


    document
        .querySelector(
            "[data-a=today]"
        )
        ?.addEventListener(
            "click",
            async () => {

                state.selectedDate =
                    key(new Date());

                await save();

                render();

            }
        );


    document
        .querySelector(
            "[data-a=rest]"
        )
        .onclick =
        async () => {

            day().rest =
                !day().rest;


            await save();

            render();

        };


    document
        .querySelector(
            "[data-a=add]"
        )
        .onclick =
        addModal;


    document
        .querySelector(
            "[data-a=pick]"
        )
        .onclick =
        pickModal;


    document
        .querySelector(
            "[data-a=manage]"
        )
        .onclick =
        manageModal;


    document
        .querySelectorAll(
            "[data-use]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        apply(
                            state.workouts.find(
                                workout =>
                                    workout.id ===
                                    button.dataset.use
                            )
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-edit-exercise]"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        syncVisibleReps(
                            button.dataset.editExercise
                        );


                        editExerciseModal(
                            button.dataset.editExercise
                        );

                    };

            }
        );


    document
        .querySelectorAll(
            "[data-done]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        setDone(
                            button.dataset.done,
                            true
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-undo]"
        )
        .forEach(
            button => {

                button.onclick =
                    () =>
                        setDone(
                            button.dataset.undo,
                            false
                        );

            }
        );


    document
        .querySelectorAll(
            "[data-setadd]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        const item =
                            day()
                                .exercises
                                .find(
                                    exerciseData =>
                                        exerciseData.id ===
                                        button.dataset.setadd
                                );


                        if (!item) {
                            return;
                        }


                        item.sets.push({

                            reps:
                                +item.targetReps ||
                                0,

                            done:
                                false

                        });


                        await save();

                        render();

                    };

            }
        );


    document
        .querySelectorAll(
            "[data-remove]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        day().exercises =
                            day()
                                .exercises
                                .filter(
                                    exerciseData =>
                                        exerciseData.id !==
                                        button.dataset.remove
                                );


                        await save();

                        render();

                    };

            }
        );


    document
        .querySelectorAll(
            "[data-reps]"
        )
        .forEach(
            input => {

                input.onchange =
                    async () => {

                        const item =
                            day()
                                .exercises
                                .find(
                                    exerciseData =>
                                        exerciseData.id ===
                                        input.dataset.reps
                                );


                        if (!item) {
                            return;
                        }


                        item
                            .sets[
                                +input.dataset.i
                            ]
                            .reps =
                            +input.value ||
                            0;


                        await save();

                    };

            }
        );

}


/* =========================================================
   SET COMPLETION
   ========================================================= */

async function setDone(
    id,
    done
) {

    const item =
        day()
            .exercises
            .find(
                exerciseData =>
                    exerciseData.id ===
                    id
            );


    if (!item) {
        return;
    }


    const set =
        done

            ? item.sets.find(
                value =>
                    !value.done
            )

            : [
                ...item.sets
            ]
                .reverse()
                .find(
                    value =>
                        value.done
                );


    if (set) {

        set.done =
            done;

    }


    await save();

    render();

}


/* =========================================================
   MODAL
   ========================================================= */

function modal(html) {

    const modalBackdrop =
        document.createElement(
            "div"
        );


    modalBackdrop.className =
        "modal-backdrop";


    modalBackdrop.id =
        "modal";


    modalBackdrop.innerHTML =
        `
            <div class="modal">
                ${html}
            </div>
        `;


    document.body.appendChild(
        modalBackdrop
    );


    document
        .querySelectorAll(
            "[data-close]"
        )
        .forEach(
            button =>
                button.onclick =
                    () =>
                        modalBackdrop.remove()
        );

}


/* =========================================================
   ADD EXERCISE
   ========================================================= */

function addModal() {

    modal(`

        <div class="modal-header">

            <div class="modal-title">
                Add Individual Exercise
            </div>

            <button
                class="close"
                data-close
            >
                ×
            </button>

        </div>


        <form
            class="modal-body"
            id="ef"
        >

            <div class="field">

                <label>
                    Exercise name
                </label>

                <input
                    id="en"
                    placeholder="e.g. Pull-ups"
                    required
                >

            </div>


            <div class="field">

                <label>
                    Number of sets
                </label>

                <input
                    id="es"
                    type="number"
                    min="1"
                    value="3"
                    required
                >

            </div>


            <div class="field">

                <label>
                    Target reps per set
                </label>

                <input
                    id="er"
                    type="number"
                    min="0"
                    value="10"
                    required
                >

            </div>


            <div class="modal-footer">

                <button
                    type="button"
                    class="secondary"
                    data-close
                >
                    Cancel
                </button>


                <button class="primary">
                    Add Exercise
                </button>

            </div>

        </form>

    `);


    document
        .querySelector(
            "#ef"
        )
        .onsubmit =
        async event => {

            event.preventDefault();


            const name =
                document
                    .querySelector(
                        "#en"
                    )
                    .value
                    .trim();


            const sets =
                +document
                    .querySelector(
                        "#es"
                    )
                    .value;


            const reps =
                +document
                    .querySelector(
                        "#er"
                    )
                    .value;


            if (
                !name ||
                sets < 1
            ) {

                return;

            }


            day()
                .exercises
                .push({

                    id:
                        uid(),

                    name,

                    targetReps:
                        reps,

                    sets:
                        Array
                            .from(
                                {
                                    length:
                                        sets
                                },
                                () => ({
                                    reps,
                                    done:
                                        false
                                })
                            )

                });


            await save();


            document
                .querySelector(
                    "#modal"
                )
                .remove();


            render();

        };

}


/* =========================================================
   EDIT EXERCISE
   ========================================================= */

function editExerciseModal(id) {

    const item =
        day()
            .exercises
            .find(
                exerciseData =>
                    exerciseData.id === id
            );


    if (!item) {
        return;
    }


    modal(`

        <div class="modal-header">

            <div class="modal-title">
                Edit Exercise
            </div>

            <button
                class="close"
                data-close
                aria-label="Close"
            >
                ×
            </button>

        </div>


        <form
            class="modal-body"
            id="editExerciseForm"
        >

            <div class="field">

                <label for="editExerciseName">
                    Exercise name
                </label>

                <input
                    id="editExerciseName"
                    value="${esc(item.name)}"
                    required
                >

            </div>


            <div class="field">

                <label for="editExerciseSets">
                    Number of sets
                </label>

                <input
                    id="editExerciseSets"
                    type="number"
                    min="1"
                    value="${item.sets.length}"
                    required
                >

            </div>


            <div class="field">

                <label for="editExerciseReps">
                    Target reps per set
                </label>

                <input
                    id="editExerciseReps"
                    type="number"
                    min="0"
                    value="${item.targetReps || 0}"
                    required
                >

            </div>


            <div class="side-copy edit-exercise-note">
                Completed sets and manually adjusted reps are preserved.
            </div>


            <div class="modal-footer">

                <button
                    type="button"
                    class="secondary"
                    data-close
                >
                    Cancel
                </button>

                <button class="primary">
                    Save Changes
                </button>

            </div>

        </form>

    `);


    document
        .querySelector(
            "#editExerciseForm"
        )
        .onsubmit =
        async event => {

            event.preventDefault();


            const name =
                document
                    .querySelector(
                        "#editExerciseName"
                    )
                    .value
                    .trim();


            const setCount =
                +document
                    .querySelector(
                        "#editExerciseSets"
                    )
                    .value;


            const targetReps =
                +document
                    .querySelector(
                        "#editExerciseReps"
                    )
                    .value;


            if (
                !name ||
                setCount < 1 ||
                targetReps < 0
            ) {

                return;

            }


            const previousTarget =
                Number(item.targetReps) || 0;


            const preservedSets =
                item.sets
                    .slice(0, setCount)
                    .map(
                        set => ({

                            ...set,

                            reps:
                                !set.done &&
                                Number(set.reps) ===
                                    previousTarget

                                    ? targetReps
                                    : set.reps

                        })
                    );


            while (
                preservedSets.length <
                setCount
            ) {

                preservedSets.push({

                    reps:
                        targetReps,

                    done:
                        false

                });

            }


            item.name = name;
            item.targetReps = targetReps;
            item.sets = preservedSets;


            await save();


            document
                .querySelector(
                    "#modal"
                )
                .remove();


            render();

        };

}


function syncVisibleReps(id) {

    const item =
        day()
            .exercises
            .find(
                exerciseData =>
                    exerciseData.id === id
            );


    if (!item) {
        return;
    }


    [
        ...document.querySelectorAll(
            "[data-reps]"
        )
    ]
        .filter(
            input =>
                input.dataset.reps === id
        )
        .forEach(
            input => {

                const index =
                    Number(input.dataset.i);


                if (item.sets[index]) {

                    item.sets[index].reps =
                        Number(input.value) || 0;

                }

            }
        );

}


/* =========================================================
   PICK SAVED WORKOUT
   ========================================================= */

function pickModal() {

    modal(`

        <div class="modal-header">

            <div class="modal-title">
                Select Pre-made Workout
            </div>

            <button
                class="close"
                data-close
            >
                ×
            </button>

        </div>


        <div class="modal-body">

            ${
                state.workouts.length

                    ? state.workouts
                        .map(
                            workout => `

                                <div
                                    class="library-item"
                                    style="margin-bottom:8px"
                                >

                                    <div>

                                        <strong>
                                            ${esc(
                                                workout.name
                                            )}
                                        </strong>

                                        <span>
                                            ${
                                                workout
                                                    .exercises
                                                    .map(
                                                        exerciseData =>
                                                            `${esc(
                                                                exerciseData.name
                                                            )} ${
                                                                exerciseData
                                                                    .sets
                                                            }×${
                                                                exerciseData
                                                                    .reps
                                                            }`
                                                    )
                                                    .join(
                                                        " · "
                                                    )
                                            }
                                        </span>

                                    </div>


                                    <button
                                        class="primary"
                                        data-pick="${workout.id}"
                                    >
                                        Use
                                    </button>

                                </div>

                              `
                        )
                        .join("")

                    : `

                        <div
                            class="empty"
                            style="min-height:180px"
                        >
                            No workouts created yet.
                        </div>

                      `
            }

        </div>


        <div class="modal-footer">

            <button
                class="secondary"
                data-manage
            >
                Manage / Create
            </button>


            <button
                class="secondary"
                data-close
            >
                Close
            </button>

        </div>

    `);


    document
        .querySelectorAll(
            "[data-pick]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        apply(
                            state.workouts.find(
                                workout =>
                                    workout.id ===
                                    button.dataset.pick
                            )
                        );


                        document
                            .querySelector(
                                "#modal"
                            )
                            .remove();

                    };

            }
        );


    document
        .querySelector(
            "[data-manage]"
        )
        ?.addEventListener(
            "click",
            manageModal
        );

}


/* =========================================================
   WORKOUT LIBRARY
   ========================================================= */

function manageModal() {

    modal(`

        <div class="modal-header">

            <div class="modal-title">
                Workout Library
            </div>

            <button
                class="close"
                data-close
            >
                ×
            </button>

        </div>


        <div class="modal-body">

            <div
                class="side-copy"
                style="margin-bottom:15px"
            >
                Build reusable workouts with unlimited
                exercises and individual set/rep targets.
            </div>


            <form id="wf">

                <div class="field">

                    <label>
                        Workout name
                    </label>

                    <input
                        id="wn"
                        placeholder="e.g. Push Day"
                        required
                    >

                </div>


                <label>
                    Exercises
                </label>


                <div
                    id="builder"
                    class="builder"
                ></div>


                <button
                    type="button"
                    class="secondary"
                    id="badd"
                >
                    + Add Exercise
                </button>


                <div class="modal-footer">

                    <button
                        type="button"
                        class="secondary"
                        data-close
                    >
                        Cancel
                    </button>


                    <button class="primary">
                        Save Workout
                    </button>

                </div>

            </form>


            <hr
                style="
                    border-color:#3b3d44;
                    border-width:1px 0 0;
                    margin:18px 0
                "
            >


            ${
                state.workouts
                    .map(
                        workout => `

                            <div
                                class="library-item"
                                style="margin-bottom:7px"
                            >

                                <div>

                                    <strong>
                                        ${esc(
                                            workout.name
                                        )}
                                    </strong>

                                    <span>
                                        ${
                                            workout
                                                .exercises
                                                .length
                                        }
                                        exercises
                                    </span>

                                </div>


                                <button
                                    type="button"
                                    class="danger-btn"
                                    data-delw="${workout.id}"
                                >
                                    Delete
                                </button>

                            </div>

                          `
                    )
                    .join("")
            }

        </div>

    `);


    addRow();


    document
        .querySelector(
            "#badd"
        )
        .onclick =
        addRow;


    document
        .querySelector(
            "#wf"
        )
        .onsubmit =
        async event => {

            event.preventDefault();


            const rows =
                [
                    ...document
                        .querySelectorAll(
                            ".builder-row"
                        )
                ];


            const exercises =
                rows
                    .map(
                        row => ({

                            name:
                                row
                                    .querySelector(
                                        ".bn"
                                    )
                                    .value
                                    .trim(),

                            sets:
                                +row
                                    .querySelector(
                                        ".bs"
                                    )
                                    .value,

                            reps:
                                +row
                                    .querySelector(
                                        ".br"
                                    )
                                    .value

                        })
                    )
                    .filter(
                        value =>
                            value.name &&
                            value.sets > 0
                    );


            const workoutName =
                document
                    .querySelector(
                        "#wn"
                    )
                    .value
                    .trim();


            if (
                !workoutName ||
                !exercises.length
            ) {

                return;

            }


            state.workouts.push({

                id:
                    uid(),

                name:
                    workoutName,

                exercises

            });


            await save();


            /*
             * Re-open library showing
             * the updated workout list.
             */
            manageModal();

        };


    document
        .querySelectorAll(
            "[data-delw]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        state.workouts =
                            state.workouts.filter(
                                workout =>
                                    workout.id !==
                                    button.dataset.delw
                            );


                        await save();

                        manageModal();

                    };

            }
        );

}


/* =========================================================
   ADD BUILDER ROW
   ========================================================= */

function addRow() {

    const builder =
        document.querySelector(
            "#builder"
        );


    if (!builder) {
        return;
    }


    const row =
        document.createElement(
            "div"
        );


    row.className =
        "builder-row";


    row.innerHTML = `

        <input
            class="bn"
            placeholder="Exercise"
            required
        >

        <input
            class="bs"
            type="number"
            min="1"
            value="3"
            required
        >

        <input
            class="br"
            type="number"
            min="0"
            value="10"
            required
        >

        <button
            type="button"
            class="remove-row"
        >
            ×
        </button>

    `;


    row
        .querySelector(
            ".remove-row"
        )
        .onclick =
        () =>
            row.remove();


    builder.appendChild(
        row
    );

}


/* =========================================================
   APPLY SAVED WORKOUT
   ========================================================= */

async function apply(
    workout
) {

    if (!workout) {
        return;
    }


    workout
        .exercises
        .forEach(
            exerciseData => {

                day()
                    .exercises
                    .push({

                        id:
                            uid(),

                        name:
                            exerciseData.name,

                        targetReps:
                            exerciseData.reps,

                        sets:
                            Array.from(
                                {
                                    length:
                                        exerciseData.sets
                                },
                                () => ({

                                    reps:
                                        exerciseData.reps,

                                    done:
                                        false

                                })
                            )

                    });

            }
        );


    await save();

    render();

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

    try {

        await loadData();


        /*
         * Ensure selectedDate is valid.
         */
        if (
            !state.selectedDate
        ) {

            state.selectedDate =
                key(new Date());

        }


        /*
         * Ensure the current day
         * exists in memory without
         * unnecessarily saving it.
         */
        day();


        render();

    }

    catch (error) {

        console.error(
            "Workout Tracker initialization failed:",
            error
        );


        state =
            fresh();


        day();

        render();

    }

}


init();
