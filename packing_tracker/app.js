/* =========================================================
   JAIMIE — PACKING TRACKER
   =========================================================
   PRIMARY STORAGE
       jaimie-data → "packing"

   TEMPORARY LEGACY BACKUP
       PackingTrackerDB

   Data structure
       {
           profiles: [],
           items: [],
           checks: {}
       }
   ========================================================= */

const DB = "PackingTrackerDB";
const V = 1;
const STORE = "app";

const JAIMIE_DATA_KEY = "packing";


let db;
let mode = "packing";
let profileId = "travel";
let editingId = null;


const state = {
    profiles: [],
    items: [],
    checks: {}
};

let packingData = {};


const $ = (selector) =>
    document.querySelector(selector);

const $$ = (selector) =>
    document.querySelectorAll(selector);


/* =========================================================
   LEGACY INDEXEDDB
   ========================================================= */

function openDB() {

    return new Promise(
        (resolve, reject) => {

            const request =
                indexedDB.open(
                    DB,
                    V
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
                                keyPath: "key"
                            }
                        );

                    }

                };


            request.onsuccess = () => {

                db =
                    request.result;

                resolve();

            };


            request.onerror = () => {

                reject(
                    request.error
                );

            };

        }
    );

}


function read(key) {

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
                        request.result?.value
                    );


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


function readAllLegacy() {

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


function write(key, value) {

    return new Promise(
        (resolve, reject) => {

            const request =
                db
                    .transaction(
                        STORE,
                        "readwrite"
                    )
                    .objectStore(STORE)
                    .put({
                        key,
                        value
                    });


            request.onsuccess =
                () => resolve();


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


/* =========================================================
   CENTRAL JAIMIE STORAGE
   ========================================================= */

async function save() {

    const payload = {

        ...packingData,

        profiles:
            state.profiles,

        items:
            state.items,

        checks:
            state.checks

    };

    packingData = payload;


    /*
     * PRIMARY STORAGE
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        payload
    );


    /*
     * TEMPORARY LEGACY BACKUP
     */
    await write(
        "profiles",
        state.profiles
    );

    await write(
        "items",
        state.items
    );

    await write(
        "checks",
        state.checks
    );

}


/* =========================================================
   LOAD / MIGRATION
   ========================================================= */

async function loadData() {

    /*
     * FIRST:
     * Try centralized JAIMIE storage.
     */
    const stored =
        await JAIMIEData.load(
            JAIMIE_DATA_KEY
        );


    if (
        stored &&
        typeof stored === "object" &&
        !Array.isArray(stored)
    ) {

        packingData = stored;

        state.profiles =
            Array.isArray(
                stored.profiles
            )
                ? stored.profiles
                : [];


        state.items =
            Array.isArray(
                stored.items
            )
                ? stored.items
                : [];


        state.checks =
            stored.checks &&
            typeof stored.checks === "object"
                ? stored.checks
                : {};


        /*
         * Make sure there is always
         * a valid default profile.
         */
        if (
            !state.profiles.some(
                profile =>
                    profile.id ===
                    "travel"
            )
        ) {

            state.profiles.unshift({
                id: "travel",
                name: "Travel"
            });

        }


        if (
            !state.profiles.some(
                profile =>
                    profile.id ===
                    profileId
            )
        ) {

            profileId =
                state.profiles[0].id;

        }


        return;

    }


    /*
     * No centralized data yet.
     *
     * Read the old PackingTrackerDB.
     */
    const legacy =
        await readAllLegacy();


    const legacyProfiles =
        legacy.find(
            item =>
                item.key ===
                "profiles"
        );


    const legacyItems =
        legacy.find(
            item =>
                item.key ===
                "items"
        );


    const legacyChecks =
        legacy.find(
            item =>
                item.key ===
                "checks"
        );


    state.profiles =
        Array.isArray(
            legacyProfiles?.value
        )
            ? legacyProfiles.value
            : [];


    state.items =
        Array.isArray(
            legacyItems?.value
        )
            ? legacyItems.value
            : [];


    state.checks =
        legacyChecks?.value &&
        typeof legacyChecks.value ===
            "object"
            ? legacyChecks.value
            : {};

    packingData = {};


    /*
     * Preserve the default Travel list.
     */
    if (
        !state.profiles.some(
            profile =>
                profile.id ===
                "travel"
        )
    ) {

        state.profiles.unshift({
            id: "travel",
            name: "Travel"
        });

    }


    /*
     * If there were literally no old
     * packing items, retain the
     * original default starter set.
     */
    if (!state.items.length) {

        state.items = [

            {
                id: uid(),
                profileId: "travel",
                name: "Passport",
                category: "ESSENTIALS",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Wallet",
                category: "ESSENTIALS",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Phone",
                category: "ELECTRONICS",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Chargers",
                category: "ELECTRONICS",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "T-Shirts",
                category: "CLOTHING",
                qty: 4
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Underwear",
                category: "CLOTHING",
                qty: 4
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Toothbrush",
                category: "TOILETRIES",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Deodorant",
                category: "TOILETRIES",
                qty: 1
            },

            {
                id: uid(),
                profileId: "travel",
                name: "Keys",
                category: "MISC",
                qty: 1
            }

        ];

    }


    /*
     * Store migrated dataset in JAIMIE.
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        {
            profiles:
                state.profiles,

            items:
                state.items,

            checks:
                state.checks

        }
    );

}


/* =========================================================
   HELPERS
   ========================================================= */

function uid() {

    return crypto.randomUUID();

}


function activeItems() {

    return state.items.filter(
        item =>
            item.profileId ===
            profileId
    );

}


function checkedKey(id) {

    return `${profileId}:${mode}:${id}`;

}


function isChecked(id) {

    return !!state.checks[
        checkedKey(id)
    ];

}


function esc(value) {
    return window.JAIMIESafeContent.escapeHtml(value);

}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function render() {

    const items =
        activeItems();


    const groups = [
        ...new Set(
            items.map(
                item =>
                    item.category
            )
        )
    ];


    const profile =
        state.profiles.find(
            item =>
                item.id ===
                profileId
        );


    $("#profileName")
        .textContent =
        profile?.name ||
        "Travel";


    const total =
        items.length;


    const done =
        items.filter(
            item =>
                isChecked(item.id)
        ).length;


    const pct =
        total
            ? Math.round(
                done /
                total *
                100
            )
            : 0;


    $("#progressText")
        .textContent =
        `${done} / ${total} PACKED`;


    $("#progressBar")
        .style
        .width =
        pct + "%";


    $("#completion")
        .textContent =
        pct + "%";


    $("#remaining")
        .textContent =
        `${total - done} ITEMS REMAINING`;


    $("#checked")
        .textContent =
        `${done} VERIFIED`;


    $("#categoryGrid")
        .innerHTML =
        groups.length

            ? groups
                .map(
                    groupName =>
                        group(
                            groupName,
                            items.filter(
                                item =>
                                    item.category ===
                                    groupName
                            )
                        )
                )
                .join("")

            : `
                <div class="empty">
                    NO ITEMS IN THIS LOADOUT
                </div>
              `;

}


/* =========================================================
   CATEGORY
   ========================================================= */

function group(name, items) {

    const done =
        items.filter(
            item => isChecked(item.id)
        ).length;

    return `
        <section class="category">

            <div class="category-head">
                <span class="category-title">
                    ${esc(name)}
                </span>

                <span class="category-count">
                    ${done}/${items.length}
                </span>
            </div>

            ${items
                .map(item => itemHtml(item))
                .join("")}

            <button
                class="category-add"
                data-packing-action="add-category"
                data-category="${esc(name)}"
            >
                + ADD TO ${esc(name)}
            </button>

        </section>
    `;
}


/*
 * Render a single packing item.
 */
function itemHtml(item) {

    return `

        <div
            class="item ${
                isChecked(item.id)
                    ? "checked"
                    : ""
            }"
        >

            <button
                class="check"
                data-packing-action="toggle"
                data-item-id="${esc(item.id)}"
            >
                ${
                    isChecked(item.id)
                        ? "✓"
                        : ""
                }
            </button>


            <span class="name">
                ${esc(item.name)}
            </span>


            <span class="qty">
                ×${Number(item.qty) || 0}
            </span>


            <button
                class="edit"
                data-packing-action="edit"
                data-item-id="${esc(item.id)}"
            >
                ⋮
            </button>

        </div>

    `;

}


/* =========================================================
   CHECK STATE
   ========================================================= */

async function toggle(id) {

    const key =
        checkedKey(id);


    state.checks[key] =
        !state.checks[key];


    await save();

    render();

}


async function setAll(value) {

    activeItems().forEach(
        item => {

            state.checks[
                checkedKey(item.id)
            ] = value;

        }
    );


    await save();

    render();

}


/* =========================================================
   MODE
   ========================================================= */

function setMode(
    nextMode
) {

    mode =
        nextMode;


    $$(".mode")
        .forEach(
            button =>
                button.classList.toggle(
                    "active",
                    button.dataset.mode ===
                    mode
                )
        );


    $("#modeEyebrow")
        .textContent =
        mode === "packing"
            ? "DEPARTURE CHECK"
            : "RETURN CHECK";


    $("#modeTitle")
        .textContent =
        mode === "packing"
            ? "Prepare Your Loadout"
            : "Recover Your Belongings";


    render();

}


$$(".mode")
    .forEach(
        button => {

            button.onclick =
                () =>
                    setMode(
                        button.dataset.mode
                    );

        }
    );


$("#checkAll")
    .onclick =
    () =>
        setAll(true);


$("#clearAll")
    .onclick =
    () =>
        setAll(false);


/* =========================================================
   ITEM MODAL
   ========================================================= */

function openItem(
    id = null,
    category = "ESSENTIALS"
) {

    editingId =
        id;


    const item =
        id
            ? state.items.find(
                value =>
                    value.id ===
                    id
            )
            : null;


    $("#itemModalTitle")
        .textContent =
        item
            ? "Edit Item"
            : "Add Item";


    $("#deleteItem")
        .classList
        .toggle(
            "hidden",
            !item
        );


    $("#itemId")
        .value =
        item?.id ||
        "";


    $("#itemName")
        .value =
        item?.name ||
        "";


    $("#itemCategory")
        .value =
        item?.category ||
        category;


    $("#itemQty")
        .value =
        item?.qty ||
        1;


    $("#itemModal")
        .classList
        .remove(
            "hidden"
        );


    $("#itemName")
        .focus();

}


function closeItem() {

    $("#itemModal")
        .classList
        .add(
            "hidden"
        );


    editingId =
        null;

}


$$("[data-close-item]")
    .forEach(
        button =>
            button.onclick =
                closeItem
    );


$("#itemModal")
    .onclick =
    event => {

        if (
            event.target ===
            $("#itemModal")
        ) {

            closeItem();

        }

    };


$("#itemForm")
    .onsubmit =
    async event => {

        event.preventDefault();


        const existingIndex =
            state.items.findIndex(
                item =>
                    item.id ===
                    $("itemId").value
            );

        const value = {

            ...(
                existingIndex >= 0
                    ? state.items[existingIndex]
                    : {}
            ),

            id:
                $("#itemId")
                    .value ||
                uid(),

            profileId,

            name:
                $("#itemName")
                    .value
                    .trim(),

            category:
                $("#itemCategory")
                    .value,

            qty:
                Number(
                    $("#itemQty")
                        .value
                ) || 1

        };


        const index = existingIndex;


        if (index >= 0) {

            /*
             * Preserve the current
             * profile when editing.
             */
            value.profileId =
                state.items[index]
                    .profileId;

            state.items[index] =
                value;

        }

        else {

            state.items.push(
                value
            );

        }


        await save();

        closeItem();

        render();

    };


$("#deleteItem")
    .onclick =
    async () => {

        if (!editingId) {
            return;
        }


        state.items =
            state.items.filter(
                item =>
                    item.id !==
                    editingId
            );


        /*
         * Remove both packing and
         * returning checks for the
         * deleted item.
         */
        delete state.checks[
            `${profileId}:packing:${editingId}`
        ];

        delete state.checks[
            `${profileId}:returning:${editingId}`
        ];


        await save();

        closeItem();

        render();

    };


/* =========================================================
   PROFILES
   ========================================================= */

function openProfiles() {

    renderProfiles();

    $("#listModal")
        .classList
        .remove(
            "hidden"
        );

}


function renderProfiles() {

    $("#profiles")
        .innerHTML =
        state.profiles
            .map(
                profile => {

                    const count =
                        state.items.filter(
                            item =>
                                item.profileId ===
                                profile.id
                        ).length;


                    return `

                        <div
                            class="profile-row ${
                                profile.id ===
                                profileId
                                    ? "active"
                                    : ""
                            }"
                        >

                            <div>

                                <div class="profile-name">
                                    ${esc(
                                        profile.name
                                    )}
                                </div>

                                <div class="profile-meta">
                                    ${count} ITEMS
                                </div>

                            </div>


                            <button
                                class="secondary"
                                data-packing-action="switch-profile"
                                data-profile-id="${esc(profile.id)}"
                            >
                                SELECT
                            </button>


                            ${
                                profile.id !==
                                "travel"

                                    ? `
                                        <button
                                            class="danger"
                                            data-packing-action="remove-profile"
                                            data-profile-id="${esc(profile.id)}"
                                        >
                                            ×
                                        </button>
                                      `
                                    : ""
                            }

                        </div>

                    `;

                }
            )
            .join("");

}


async function switchProfile(
    id
) {

    profileId =
        id;


    $("#listModal")
        .classList
        .add(
            "hidden"
        );


    render();

}


async function removeProfile(
    id
) {

    if (
        !confirm(
            "Delete this packing list and its items?"
        )
    ) {

        return;

    }


    state.profiles =
        state.profiles.filter(
            profile =>
                profile.id !==
                id
        );


    state.items =
        state.items.filter(
            item =>
                item.profileId !==
                id
        );


    /*
     * Clean up any check records
     * associated with the deleted
     * profile.
     */
    Object.keys(
        state.checks
    )
        .filter(
            key =>
                key.startsWith(
                    `${id}:`
                )
        )
        .forEach(
            key =>
                delete state.checks[
                    key
                ]
        );


    if (
        profileId === id
    ) {

        profileId =
            "travel";

    }


    await save();

    renderProfiles();

    render();

}


/* =========================================================
   SAFE DYNAMIC ACTIONS
   ========================================================= */

document.addEventListener(
    "click",
    async event => {

        const button =
            event.target.closest(
                "[data-packing-action]"
            );


        if (!button) return;


        switch (
            button.dataset.packingAction
        ) {

            case "add-category":
                openItem(
                    null,
                    button.dataset.category
                );
                break;

            case "toggle":
                await toggle(
                    button.dataset.itemId
                );
                break;

            case "edit":
                openItem(
                    button.dataset.itemId
                );
                break;

            case "switch-profile":
                await switchProfile(
                    button.dataset.profileId
                );
                break;

            case "remove-profile":
                await removeProfile(
                    button.dataset.profileId
                );
                break;

        }

    }
);


$("#manageBtn")
    .onclick =
    openProfiles;


$$("[data-close]")
    .forEach(
        button =>
            button.onclick =
                () =>
                    $("#listModal")
                        .classList
                        .add(
                            "hidden"
                        )
    );


/* =========================================================
   NEW PROFILE
   ========================================================= */

$("#addProfile")
    .onclick =
    async () => {

        const name =
            $("#profileInput")
                .value
                .trim();


        if (!name) {
            return;
        }


        const profile = {

            id:
                uid(),

            name

        };


        state.profiles.push(
            profile
        );


        profileId =
            profile.id;


        $("#profileInput")
            .value =
            "";


        await save();


        $("#listModal")
            .classList
            .add(
                "hidden"
            );


        render();

    };


/* =========================================================
   NEW PACKING RUN
   ========================================================= */

$("#newTripBtn")
    .onclick =
    () => {

        profileId =
            state.profiles[0]?.id ||
            "travel";


        mode =
            "packing";


        setMode(
            "packing"
        );


        openItem();

    };


/* =========================================================
   COMPLETION
   ========================================================= */

$("#finishBtn")
    .onclick =
    () => {

        const items =
            activeItems();


        const done =
            items.filter(
                item =>
                    isChecked(
                        item.id
                    )
            ).length;


        if (
            items.length &&
            done === items.length
        ) {

            alert(
                mode === "packing"
                    ? "PACKING COMPLETE — LOADOUT VERIFIED."
                    : "RETURN CHECK COMPLETE — ALL BELONGINGS ACCOUNTED FOR."
            );

        }

        else {

            const remaining =
                items.length -
                done;


            alert(
                `${remaining} item${
                    remaining === 1
                        ? ""
                        : "s"
                } still unverified.`
            );

        }

    };


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

    try {

        await openDB();

        await loadData();


        /*
         * If no profile exists at all,
         * recreate the default profile.
         */
        if (
            !state.profiles.length
        ) {

            state.profiles = [

                {
                    id:
                        "travel",

                    name:
                        "Travel"

                }

            ];

        }


        if (
            !state.profiles.some(
                profile =>
                    profile.id ===
                    profileId
            )
        ) {

            profileId =
                state.profiles[0].id;

        }


        /*
         * If this is a genuinely
         * brand-new installation,
         * retain the original
         * starter loadout.
         */
        if (
            !state.items.length
        ) {

            state.items = [

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Passport",
                    category: "ESSENTIALS",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Wallet",
                    category: "ESSENTIALS",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Phone",
                    category: "ELECTRONICS",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Chargers",
                    category: "ELECTRONICS",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "T-Shirts",
                    category: "CLOTHING",
                    qty: 4
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Underwear",
                    category: "CLOTHING",
                    qty: 4
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Toothbrush",
                    category: "TOILETRIES",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Deodorant",
                    category: "TOILETRIES",
                    qty: 1
                },

                {
                    id: uid(),
                    profileId: "travel",
                    name: "Keys",
                    category: "MISC",
                    qty: 1
                }

            ];


            /*
             * Save the starter dataset
             * into both systems.
             */
            await save();

        }


        render();

    }

    catch (error) {

        console.error(
            "Packing Tracker initialization failed:",
            error
        );


        alert(
            "Could not open the packing tracker database."
        );

    }

}


init();
