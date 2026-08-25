/* =========================================================
   JAIMIE — DAY PAGE
   Centralized data storage via JAIMIEData
   ========================================================= */

const DATA_KEY = "day";

const LEGACY_KEY = "jaimie-day-v1";

let state = {
    date: new Date(),
    data: {}
};

let mode = "quest";

const $ = (selector) => document.querySelector(selector);


/* =========================================================
   STORAGE
   ========================================================= */

async function loadData() {

    /*
     * First try the centralized JAIMIE database.
     */
    const stored = await JAIMIEData.load(DATA_KEY);

    if (stored) {
        state.data = stored;
        return;
    }


    /*
     * One-time migration from the old localStorage system.
     *
     * This means existing Day data is not lost.
     */
    try {

        const legacy = localStorage.getItem(LEGACY_KEY);

        if (legacy) {

            const parsed = JSON.parse(legacy);

            state.data = parsed || {};

            await JAIMIEData.save(
                DATA_KEY,
                state.data
            );

            console.log(
                "JAIMIE Day: migrated legacy data to JAIMIEData."
            );

            return;
        }

    } catch (error) {

        console.warn(
            "JAIMIE Day: could not migrate legacy data.",
            error
        );

    }


    /*
     * Nothing existed yet.
     */
    state.data = {};
}


async function saveData() {

    await JAIMIEData.save(
        DATA_KEY,
        state.data
    );
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function key(date) {

    return date.toISOString().slice(0, 10);

}


function current() {

    const k = key(state.date);

    if (!state.data[k]) {

        state.data[k] = {
            schedule: [],
            quests: []
        };

    }

    return state.data[k];

}


function reminders() {

    if (!state.data.reminders) {

        state.data.reminders = [];

    }

    return state.data.reminders;

}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function esc(value) {

    return String(value ?? "").replace(
        /[&<>"]/g,
        (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;"
        }[char])
    );

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

    const date = state.date;
    const day = current();


    /* -----------------------------------------------------
       DATE
    ----------------------------------------------------- */

    $("#date").textContent =
        date.toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "2-digit",
                year: "numeric"
            }
        ).toUpperCase();


    $("#weekday").textContent =
        date.toLocaleDateString(
            undefined,
            {
                weekday: "long"
            }
        );


    /* -----------------------------------------------------
       SCHEDULE
    ----------------------------------------------------- */

    $("#schedule").innerHTML =
        day.schedule.length

            ? day.schedule.map((item, index) => `

                <div class="entry">

                    <div class="time">
                        ${esc(item.time || "--:--")}
                    </div>

                    <div>

                        <div class="title">
                            ${esc(item.title)}
                        </div>

                        ${
                            item.note
                                ? `
                                    <div class="note">
                                        ${esc(item.note)}
                                    </div>
                                  `
                                : ""
                        }

                    </div>

                    <button
                        class="mini"
                        data-del="schedule,${index}"
                    >
                        ×
                    </button>

                </div>

            `).join("")

            : `
                <div class="note">
                    NO SCHEDULE ENTRIES
                </div>
            `;


    /* -----------------------------------------------------
       MAIN QUEST
    ----------------------------------------------------- */

    $("#quests").innerHTML =
        day.quests.length

            ? day.quests.map((item, index) => `

                <div class="task">

                    <button
                        class="check ${item.done ? "done" : ""}"
                        data-check="${index}"
                    >
                        ${item.done ? "✓" : ""}
                    </button>

                    <div>

                        <div
                            class="title ${
                                item.done
                                    ? "doneText"
                                    : ""
                            }"
                        >
                            ${esc(item.title)}
                        </div>

                        ${
                            item.note
                                ? `
                                    <div class="note">
                                        ${esc(item.note)}
                                    </div>
                                  `
                                : ""
                        }

                    </div>

                    <div>

                        <button
                            class="mini"
                            data-post="${index}"
                        >
                            →
                        </button>

                        <button
                            class="mini"
                            data-del="quests,${index}"
                        >
                            ×
                        </button>

                    </div>

                </div>

            `).join("")

            : `
                <div class="note">
                    NO ACTIVE OBJECTIVES
                </div>
            `;


    /* -----------------------------------------------------
       PROGRESS
    ----------------------------------------------------- */

    const done =
        day.quests.filter(
            item => item.done
        ).length;


    const percent =
        day.quests.length
            ? Math.round(
                done / day.quests.length * 100
            )
            : 0;


    $("#percent").textContent =
        percent + "%";


    $("#bar").style.width =
        percent + "%";


    /* -----------------------------------------------------
       PERSISTENT REMINDERS
    ----------------------------------------------------- */

    const list = reminders();


    $("#reminders").innerHTML =
        list.length

            ? list.map((item, index) => `

                <div class="task">

                    <button
                        class="check ${item.done ? "done" : ""}"
                        data-rem="${index}"
                    >
                        ${item.done ? "✓" : ""}
                    </button>

                    <div>

                        <div
                            class="title ${
                                item.done
                                    ? "doneText"
                                    : ""
                            }"
                        >
                            ${esc(item.title)}
                        </div>

                        ${
                            item.note
                                ? `
                                    <div class="note">
                                        ${esc(item.note)}
                                    </div>
                                  `
                                : ""
                        }

                    </div>

                    <button
                        class="mini"
                        data-rdel="${index}"
                    >
                        ×
                    </button>

                </div>

            `).join("")

            : `
                <div class="note">
                    NO ACTIVE REMINDERS
                </div>
            `;

}


/* =========================================================
   MODAL
   ========================================================= */

function openModal(type) {

    mode = type;


    if (type === "schedule") {

        $("#modalTitle").textContent =
            "Add Schedule Entry";

        $("#modalType").textContent =
            "01 / TIME GRID";

    }

    else if (type === "quest") {

        $("#modalTitle").textContent =
            "Add Main Quest";

        $("#modalType").textContent =
            "02 / ACTIVE OBJECTIVES";

    }

    else {

        $("#modalTitle").textContent =
            "Add Persistent Reminder";

        $("#modalType").textContent =
            "03 / PERSISTENT";

    }


    $("#timeRow").style.display =
        type === "schedule"
            ? "block"
            : "none";


    $("#title").value = "";
    $("#note").value = "";
    $("#time").value = "";


    $("#modal").hidden = false;


    $("#title").focus();

}


function closeModal() {

    $("#modal").hidden = true;

}


/* =========================================================
   DATE NAVIGATION
   ========================================================= */

$("#prevDay").onclick = () => {

    state.date.setDate(
        state.date.getDate() - 1
    );

    render();

};


$("#nextDay").onclick = () => {

    state.date.setDate(
        state.date.getDate() + 1
    );

    render();

};


$("#today").onclick = () => {

    state.date = new Date();

    render();

};


/* =========================================================
   ADD BUTTONS
   ========================================================= */

$("#addSchedule").onclick = () => {

    openModal("schedule");

};


$("#addQuest").onclick = () => {

    openModal("quest");

};


$("#addReminder").onclick = () => {

    openModal("reminder");

};


$("#close").onclick = () => {

    closeModal();

};


/* =========================================================
   FORM SUBMISSION
   ========================================================= */

$("#form").onsubmit = async (event) => {

    event.preventDefault();


    const title =
        $("#title").value.trim();


    if (!title) return;


    const item = {

        title,

        note:
            $("#note").value.trim(),

        time:
            $("#time").value,

        done: false

    };


    if (mode === "schedule") {

        current().schedule.push(item);

    }

    else if (mode === "quest") {

        current().quests.push(item);

    }

    else {

        reminders().push(item);

    }


    await saveData();


    render();


    closeModal();

};


/* =========================================================
   CLICK HANDLERS
   ========================================================= */

document.addEventListener(
    "click",
    async (event) => {


        /* -------------------------------------------------
           QUEST CHECKBOX
        ------------------------------------------------- */

        const check =
            event.target.closest(
                "[data-check]"
            );


        if (check) {

            const index =
                Number(check.dataset.check);


            current().quests[index].done =
                !current().quests[index].done;


            await saveData();

            render();

            return;

        }


        /* -------------------------------------------------
           REMINDER CHECKBOX
        ------------------------------------------------- */

        const reminder =
            event.target.closest(
                "[data-rem]"
            );


        if (reminder) {

            const index =
                Number(reminder.dataset.rem);


            reminders()[index].done =
                !reminders()[index].done;


            await saveData();

            render();

            return;

        }


        /* -------------------------------------------------
           DELETE SCHEDULE / QUEST
        ------------------------------------------------- */

        const del =
            event.target.closest(
                "[data-del]"
            );


        if (del) {

            const [
                type,
                index
            ] = del.dataset.del.split(",");


            current()[type].splice(
                Number(index),
                1
            );


            await saveData();

            render();

            return;

        }


        /* -------------------------------------------------
           DELETE REMINDER
        ------------------------------------------------- */

        const reminderDelete =
            event.target.closest(
                "[data-rdel]"
            );


        if (reminderDelete) {

            reminders().splice(
                Number(reminderDelete.dataset.rdel),
                1
            );


            await saveData();

            render();

            return;

        }


        /* -------------------------------------------------
           POSTPONE QUEST TO NEXT DAY
        ------------------------------------------------- */

        const post =
            event.target.closest(
                "[data-post]"
            );


        if (post) {

            const index =
                Number(post.dataset.post);


            const item =
                current().quests.splice(
                    index,
                    1
                )[0];


            if (!item) return;


            const nextDate =
                new Date(state.date);


            nextDate.setDate(
                nextDate.getDate() + 1
            );


            const nextKey =
                key(nextDate);


            if (!state.data[nextKey]) {

                state.data[nextKey] = {
                    schedule: [],
                    quests: []
                };

            }


            state.data[nextKey].quests.push(
                item
            );


            await saveData();

            render();

        }

    }
);


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Escape") {

            closeModal();

        }

    }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

    try {

        /*
         * Wait for centralized storage.
         */
        await loadData();


        /*
         * Now render the page.
         */
        render();


        console.log(
            "JAIMIE Day: centralized storage active."
        );

    }

    catch (error) {

        console.error(
            "JAIMIE Day initialization failed:",
            error
        );


        alert(
            "Could not load JAIMIE Day data."
        );

    }

}


init();