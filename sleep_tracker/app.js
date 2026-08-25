/* =========================================================
   JAIMIE — SLEEP TRACKER
   =========================================================
   PRIMARY STORAGE
       jaimie-data → "sleep"

   TEMPORARY LEGACY BACKUP
       SoloDashboardSleep

   Data structure
       {
           days: {
               "YYYY-MM-DD": {
                   date,
                   bedtime,
                   wakeTime,
                   duration,
                   quality,
                   fellAsleep,
                   wakeups,
                   rested
               }
           }
       }
   ========================================================= */

const DB_NAME = "SoloDashboardSleep";
const STORE = "sleep";

const JAIMIE_DATA_KEY = "sleep";


let db;

let selectedDate =
    toKey(new Date());

let range = 7;


let sleepData = {
    days: {}
};


const $ = id =>
    document.getElementById(id);


/* =========================================================
   DATE HELPERS
   ========================================================= */

function toKey(date) {

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


function parseKey(key) {

    const [
        year,
        month,
        day
    ] =
        key
            .split("-")
            .map(Number);


    return new Date(
        year,
        month - 1,
        day
    );

}


function fmtDate(date) {

    return date.toLocaleDateString(
        undefined,
        {
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    );

}


/* =========================================================
   LEGACY INDEXEDDB
   ========================================================= */

function openDB() {

    return new Promise(
        (resolve, reject) => {

            const request =
                indexedDB.open(
                    DB_NAME,
                    1
                );


            request.onupgradeneeded =
                () => {

                    const database =
                        request.result;


                    if (
                        !database
                            .objectStoreNames
                            .contains(STORE)
                    ) {

                        database.createObjectStore(
                            STORE,
                            {
                                keyPath: "date"
                            }
                        );

                    }

                };


            request.onsuccess =
                () => {

                    db =
                        request.result;

                    resolve();

                };


            request.onerror =
                () => {

                    reject(
                        request.error
                    );

                };

        }
    );

}


function getLegacy(key) {

    return new Promise(
        (resolve, reject) => {

            const request =
                db
                    .transaction(
                        STORE,
                        "readonly"
                    )
                    .objectStore(STORE)
                    .get(key);


            request.onsuccess =
                () =>
                    resolve(
                        request.result
                    );


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


function getAllLegacy() {

    return new Promise(
        (resolve, reject) => {

            const request =
                db
                    .transaction(
                        STORE,
                        "readonly"
                    )
                    .objectStore(STORE)
                    .getAll();


            request.onsuccess =
                () =>
                    resolve(
                        request.result || []
                    );


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


function putLegacy(value) {

    return new Promise(
        (resolve, reject) => {

            const request =
                db
                    .transaction(
                        STORE,
                        "readwrite"
                    )
                    .objectStore(STORE)
                    .put(value);


            request.onsuccess =
                () =>
                    resolve();


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


/* =========================================================
   LOAD / MIGRATION
   ========================================================= */

async function loadData() {

    /*
     * First load the centralized
     * JAIMIE sleep dataset.
     */
    const stored =
        await JAIMIEData.load(
            JAIMIE_DATA_KEY
        );


    if (
        stored &&
        typeof stored === "object"
    ) {

        sleepData = {

            days:
                stored.days ||
                {}

        };


        return;

    }


    /*
     * No centralized dataset yet.
     *
     * Migrate the old IndexedDB.
     */
    const legacyEntries =
        await getAllLegacy();


    const days = {};


    for (
        const entry
        of legacyEntries
    ) {

        if (
            !entry ||
            !entry.date
        ) {
            continue;
        }


        days[
            entry.date
        ] = {

            date:
                entry.date,

            bedtime:
                entry.bedtime || "",

            wakeTime:
                entry.wakeTime || "",

            duration:
                entry.duration ??
                null,

            quality:
                entry.quality ??
                5,

            fellAsleep:
                entry.fellAsleep ||
                "Easily",

            wakeups:
                entry.wakeups ??
                0,

            rested:
                !!entry.rested

        };

    }


    sleepData = {
        days
    };


    /*
     * Save migrated dataset
     * into centralized JAIMIE storage.
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        sleepData
    );

}


/* =========================================================
   CURRENT DAY
   ========================================================= */

function currentEntry() {

    return (
        sleepData.days[
            selectedDate
        ] ||
        null
    );

}


/* =========================================================
   SAVE
   ========================================================= */

async function saveData() {

    /*
     * PRIMARY STORAGE
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        sleepData
    );


    /*
     * TEMPORARY LEGACY BACKUP
     *
     * Mirror the current entry into
     * the original database.
     */
    const current =
        currentEntry();


    if (current) {

        await putLegacy(
            current
        );

    }

}


/* =========================================================
   SLEEP CALCULATION
   ========================================================= */

function duration(
    bedtime,
    wakeTime
) {

    if (
        !bedtime ||
        !wakeTime
    ) {

        return null;

    }


    const [
        bedtimeHour,
        bedtimeMinute
    ] =
        bedtime
            .split(":")
            .map(Number);


    const [
        wakeHour,
        wakeMinute
    ] =
        wakeTime
            .split(":")
            .map(Number);


    let minutes =
        (
            wakeHour * 60 +
            wakeMinute
        ) -
        (
            bedtimeHour * 60 +
            bedtimeMinute
        );


    if (minutes < 0) {

        minutes += 1440;

    }


    return minutes;

}


function human(minutes) {

    if (
        minutes == null
    ) {

        return "—";

    }


    return `${
        Math.floor(
            minutes / 60
        )
    }h ${
        minutes % 60
    }m`;

}


/* =========================================================
   QUALITY
   ========================================================= */

function renderDots() {

    const quality =
        +$("quality").value;


    $("qualityValue")
        .textContent =
        `${quality}/10`;


    $("qualityDots")
        .innerHTML =
        Array
            .from(
                {
                    length: 5
                },
                (_, index) =>
                    `
                        <span
                            class="dot ${
                                index <
                                Math.round(
                                    quality /
                                    2
                                )
                                    ? "on"
                                    : ""
                            }"
                        ></span>
                    `
            )
            .join("");

}


/* =========================================================
   TOTAL SLEEP
   ========================================================= */

function updateTotal() {

    $("totalSleep")
        .textContent =
        human(
            duration(
                $("bedtime").value,
                $("wakeTime").value
            )
        );

}


/* =========================================================
   LOAD CURRENT ENTRY INTO UI
   ========================================================= */

async function loadEntry() {

    const entry =
        currentEntry();


    $("entryTitle")
        .textContent =
        `SLEEP — ${
            fmtDate(
                parseKey(
                    selectedDate
                )
            ).toUpperCase()
        }`;


    $("savedState")
        .textContent =
        entry
            ? "Saved"
            : "Not saved";


    $("savedState")
        .className =
        entry
            ? "saved ok"
            : "saved";


    $("bedtime")
        .value =
        entry?.bedtime ||
        "";


    $("wakeTime")
        .value =
        entry?.wakeTime ||
        "";


    $("quality")
        .value =
        entry?.quality ||
        5;


    $("fellAsleep")
        .value =
        entry?.fellAsleep ||
        "Easily";


    $("wakeups")
        .value =
        entry?.wakeups ??
        0;


    $("rested")
        .checked =
        !!entry?.rested;


    renderDots();

    updateTotal();

}


/* =========================================================
   SAVE CURRENT SLEEP ENTRY
   ========================================================= */

async function save() {

    const bedtime =
        $("bedtime")
            .value;

    const wakeTime =
        $("wakeTime")
            .value;


    if (
        !bedtime ||
        !wakeTime
    ) {

        alert(
            "Enter both bedtime and wake-up time."
        );

        return;

    }


    const entry = {

        date:
            selectedDate,

        bedtime,

        wakeTime,

        duration:
            duration(
                bedtime,
                wakeTime
            ),

        quality:
            +$("quality")
                .value,

        fellAsleep:
            $("fellAsleep")
                .value,

        wakeups:
            +$("wakeups")
                .value || 0,

        rested:
            $("rested")
                .checked

    };


    sleepData.days[
        selectedDate
    ] = entry;


    await saveData();

    await loadEntry();

    await renderHistory();

}


/* =========================================================
   HISTORY
   ========================================================= */

async function renderHistory() {

    const list = [];

    const center =
        parseKey(
            selectedDate
        );


    for (
        let i = range - 1;
        i >= 0;
        i--
    ) {

        const date =
            new Date(center);


        date.setDate(
            center.getDate() -
            i
        );


        const dateKey =
            toKey(date);


        /*
         * Read from centralized
         * state instead of opening
         * the legacy DB.
         */
        const entry =
            sleepData.days[
                dateKey
            ] ||
            null;


        list.push({
            d: date,
            v: entry
        });

    }


    const entries =
        list.filter(
            item =>
                item.v
        );


    if (!entries.length) {

        $("historyList")
            .innerHTML =
            `
                <div class="empty">
                    No sleep entries
                    in this range.
                </div>
            `;

    }

    else {

        $("historyList")
            .innerHTML =
            list
                .map(
                    ({
                        d,
                        v
                    }) => {

                        const mins =
                            v?.duration ||
                            0;


                        const width =
                            Math.min(
                                100,
                                mins /
                                540 *
                                100
                            );


                        return `

                            <div
                                class="day ${
                                    v
                                        ? "clickable"
                                        : ""
                                }"
                                data-date="${toKey(d)}"
                            >

                                <div class="day-name">
                                    ${
                                        d.toLocaleDateString(
                                            undefined,
                                            {
                                                weekday:
                                                    "short"
                                            }
                                        )
                                    }

                                    <br>

                                    ${d.getDate()}

                                </div>


                                <div class="bar-wrap">

                                    <div
                                        class="bar"
                                        style="width:${
                                            v
                                                ? width
                                                : 0
                                        }%"
                                    ></div>

                                </div>


                                <div class="hours">
                                    ${
                                        v
                                            ? human(mins)
                                            : "—"
                                    }
                                </div>


                                <div class="q">
                                    ${
                                        v
                                            ? `${v.quality}/10`
                                            : ""
                                    }
                                </div>

                            </div>

                        `;

                    }
                )
                .join("");

    }


    const total =
        entries.reduce(
            (
                sum,
                item
            ) =>
                sum +
                (
                    item.v.duration ||
                    0
                ),
            0
        );


    const averageQuality =
        entries.length

            ? entries.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    item.v.quality,
                0
            ) /
            entries.length

            : 0;


    $("avgSleep")
        .textContent =
        entries.length
            ? human(
                Math.round(
                    total /
                    entries.length
                )
            )
            : "—";


    $("avgQuality")
        .textContent =
        entries.length
            ? `${averageQuality.toFixed(
                1
            )}/10`
            : "—";


    /*
     * Date selection.
     */
    document
        .querySelectorAll(
            ".day.clickable"
        )
        .forEach(
            element => {

                element.onclick =
                    async () => {

                        selectedDate =
                            element.dataset.date;

                        await loadEntry();

                        await renderHistory();

                    };

            }
        );

}


/* =========================================================
   RANGE BUTTONS
   ========================================================= */

document
    .querySelectorAll(
        "[data-range]"
    )
    .forEach(
        button => {

            button.onclick =
                async () => {

                    range =
                        +button
                            .dataset
                            .range;


                    document
                        .querySelectorAll(
                            "[data-range]"
                        )
                        .forEach(
                            element =>
                                element
                                    .classList
                                    .remove(
                                        "active"
                                    )
                        );


                    button
                        .classList
                        .add(
                            "active"
                        );


                    await renderHistory();

                };

        }
    );


/* =========================================================
   DAY NAVIGATION
   ========================================================= */

async function shiftDay(
    amount
) {

    const date =
        parseKey(
            selectedDate
        );


    date.setDate(
        date.getDate() +
        amount
    );


    selectedDate =
        toKey(date);


    await loadEntry();

    await renderHistory();

}


$("prevDay").onclick =
    () =>
        shiftDay(-1);


$("nextDay").onclick =
    () =>
        shiftDay(1);


$("todayBtn").onclick =
    async () => {

        selectedDate =
            toKey(
                new Date()
            );

        await loadEntry();

        await renderHistory();

    };


/* =========================================================
   LIVE FORM UPDATES
   ========================================================= */

$("saveBtn")
    .onclick =
    save;


$("quality")
    .oninput =
    renderDots;


$("bedtime")
    .oninput =
    updateTotal;


$("wakeTime")
    .oninput =
    updateTotal;


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

    try {

        await openDB();

        await loadData();

        await loadEntry();

        await renderHistory();

    }

    catch (error) {

        console.error(
            "Sleep Tracker initialization failed:",
            error
        );


        alert(
            "Could not open the sleep tracker database."
        );

    }

}


init();