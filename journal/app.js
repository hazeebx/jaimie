/* =========================================================
   JAIMIE — JOURNAL
   ========================================================= */

"use strict";


const JOURNAL_KEY =
    "journal";


const $ =
    id =>
        document.getElementById(id);


let selectedDate =
    key(
        new Date()
    );


let journalData = {

    entries: {}

};


/* =========================================================
   DATE HELPERS
   ========================================================= */

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


function formatHistoryDate(
    date
) {

    return {

        month:
            date.toLocaleDateString(
                undefined,
                {
                    month: "short"
                }
            ).toUpperCase(),

        day:
            date.getDate()

    };

}


/* =========================================================
   ESCAPE
   ========================================================= */

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

async function loadJournal() {

    try {

        const stored =
            await JAIMIEData.load(
                JOURNAL_KEY
            );


        if (
            stored &&
            typeof stored === "object"
        ) {

            journalData = {

                entries:
                    stored.entries ||
                    {}

            };

        }

        else {

            journalData = {

                entries: {}

            };

        }


    }

    catch (error) {

        console.error(
            "JAIMIE Journal: failed to load.",
            error
        );


        journalData = {

            entries: {}

        };

    }

}


/* =========================================================
   CURRENT ENTRY
   ========================================================= */

function currentEntry() {

    return (
        journalData.entries[
            selectedDate
        ] ||
        null
    );

}


/* =========================================================
   SAVE
   ========================================================= */

async function saveEntry() {

    const entry = {

        date:
            selectedDate,

        howDay:
            $("howDay").value
                .trim(),

        whatHappened:
            $("whatHappened").value
                .trim(),

        thinking:
            $("thinking").value
                .trim(),

        grateful:
            $("grateful").value
                .trim(),

        tomorrow:
            $("tomorrow").value
                .trim(),

        updatedAt:
            new Date().toISOString()

    };


    /*
     * If the entire entry is empty,
     * remove it instead of storing
     * an empty journal entry.
     */
    const hasContent =
        Object.keys(entry)
            .some(
                field =>
                    [
                        "howDay",
                        "whatHappened",
                        "thinking",
                        "grateful",
                        "tomorrow"
                    ].includes(field) &&
                    entry[field]
            );


    if (!hasContent) {

        delete journalData.entries[
            selectedDate
        ];

    }

    else {

        journalData.entries[
            selectedDate
        ] =
            entry;

    }


    await JAIMIEData.save(
        JOURNAL_KEY,
        journalData
    );


    renderEntry();

    renderHistory();


    setSaveState(
        "SAVED"
    );

}


/* =========================================================
   RENDER ENTRY
   ========================================================= */

function renderEntry() {

    const date =
        dateFromKey(
            selectedDate
        );


    const entry =
        currentEntry();


    $("entryTitle")
        .textContent =
        formatDate(
            date
        ).toUpperCase();


    $("howDay").value =
        entry?.howDay ||
        "";


    $("whatHappened").value =
        entry?.whatHappened ||
        "";


    $("thinking").value =
        entry?.thinking ||
        "";


    $("grateful").value =
        entry?.grateful ||
        "";


    $("tomorrow").value =
        entry?.tomorrow ||
        "";


    $("dateStatus")
        .textContent =
        selectedDate;


    updateCharCount();


    setSaveState(
        entry
            ? "SAVED"
            : "NOT WRITTEN"
    );

}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

    const list =
        $("historyList");


    const dates =
        Object.keys(
            journalData.entries
        )
        .sort()
        .reverse();


    $("entryCount")
        .textContent =
        `${dates.length} ${
            dates.length === 1
                ? "ENTRY"
                : "ENTRIES"
        }`;


    if (!dates.length) {

        list.innerHTML = `
            <div class="empty">
                No journal entries yet.
            </div>
        `;

        return;

    }


    list.innerHTML =
        dates
            .map(
                dateKey => {

                    const entry =
                        journalData.entries[
                            dateKey
                        ];


                    const date =
                        dateFromKey(
                            dateKey
                        );


                    const formatted =
                        formatHistoryDate(
                            date
                        );


                    const preview =
                        getPreview(
                            entry
                        );


                    return `

                        <button
                            class="history-item ${
                                dateKey ===
                                selectedDate
                                    ? "active"
                                    : ""
                            }"
                            data-date="${escapeHtml(
                                dateKey
                            )}"
                            type="button"
                        >

                            <div
                                class="history-date"
                            >

                                <div
                                    class="history-month"
                                >
                                    ${formatted.month}
                                </div>

                                <div
                                    class="history-day"
                                >
                                    ${formatted.day}
                                </div>

                            </div>


                            <div
                                class="history-main"
                            >

                                <div
                                    class="history-title"
                                >
                                    ${formatDate(
                                        date
                                    )}
                                </div>

                                <div
                                    class="history-preview"
                                >
                                    ${escapeHtml(
                                        preview
                                    )}
                                </div>

                            </div>


                            <div
                                class="history-arrow"
                            >
                                ›
                            </div>

                        </button>

                    `;

                }
            )
            .join("");


    list
        .querySelectorAll(
            ".history-item"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        selectedDate =
                            button.dataset.date;

                        renderEntry();

                        renderHistory();

                    };

            }
        );

}


/* =========================================================
   PREVIEW
   ========================================================= */

function getPreview(
    entry
) {

    const fields = [

        entry?.howDay,
        entry?.whatHappened,
        entry?.thinking,
        entry?.grateful,
        entry?.tomorrow

    ];


    const content =
        fields.find(
            value =>
                String(
                    value ||
                    ""
                ).trim()
        );


    if (!content) {

        return "Entry recorded.";

    }


    return String(
        content
    )
        .replace(
            /\s+/g,
            " "
        )
        .slice(
            0,
            90
        );

}


/* =========================================================
   CHARACTER COUNT
   ========================================================= */

function updateCharCount() {

    const total =
        [
            $("howDay"),
            $("whatHappened"),
            $("thinking"),
            $("grateful"),
            $("tomorrow")
        ]
            .reduce(
                (
                    count,
                    field
                ) =>
                    count +
                    field.value.length,
                0
            );


    $("charCount")
        .textContent =
        `${total.toLocaleString()} ${
            total === 1
                ? "character"
                : "characters"
        }`;

}


/* =========================================================
   SAVE STATE
   ========================================================= */

let saveStateTimer =
    null;


function setSaveState(
    text
) {

    const element =
        $("saveState");


    element.textContent =
        text;


    element.classList.toggle(
        "pending",
        text === "UNSAVED"
    );

}


/* =========================================================
   DAY NAVIGATION
   ========================================================= */

function shiftDay(
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


    renderEntry();

    renderHistory();

}


/* =========================================================
   INPUT EVENTS
   ========================================================= */

function bindInputs() {

    [
        $("howDay"),
        $("whatHappened"),
        $("thinking"),
        $("grateful"),
        $("tomorrow")
    ]
        .forEach(
            field => {

                field.addEventListener(
                    "input",
                    () => {

                        setSaveState(
                            "UNSAVED"
                        );


                        updateCharCount();


                        clearTimeout(
                            saveStateTimer
                        );


                        /*
                         * Local save after a
                         * short pause so the
                         * page never loses
                         * your writing.
                         */
                        saveStateTimer =
                            setTimeout(
                                async () => {

                                    await saveEntry();

                                },
                                900
                            );

                    }
                );

            }
        );

}


/* =========================================================
   BOOT
   ========================================================= */

async function init() {

    if (
        !window.JAIMIEData
    ) {

        console.error(
            "JAIMIE Journal: JAIMIEData is unavailable."
        );

        setSaveState(
            "DATA ERROR"
        );

        return;

    }


    await loadJournal();


    renderEntry();

    renderHistory();

    bindInputs();


    $("prevDay").onclick =
        () =>
            shiftDay(
                -1
            );


    $("nextDay").onclick =
        () =>
            shiftDay(
                1
            );


    $("todayBtn").onclick =
        () => {

            selectedDate =
                key(
                    new Date()
                );


            renderEntry();

            renderHistory();

        };


    $("saveBtn").onclick =
        async () => {

            clearTimeout(
                saveStateTimer
            );


            await saveEntry();

        };

}


init();