const DB = "diet-tracker-db";
const VER = 1;
const STORE = "app";

const JAIMIE_DATA_KEY = "diet";

let db;

let selectedDate = key(new Date());
let activeMeal = null;
let editingFood = null;
let addingToMeal = null;

let targets = {
    calories: 2400,
    protein: 160,
    carbs: 300,
    fat: 70,
    water: 2.5
};

let foods = [
    {
        id: "egg",
        name: "Egg",
        serving: 50,
        calories: 72,
        protein: 6.3,
        carbs: 0.4,
        fat: 4.8,
        fiber: 0,
        sugar: 0.2,
        sodium: 71,
        calcium: 28,
        iron: 0.9,
        potassium: 69
    },

    {
        id: "chicken",
        name: "Chicken breast",
        serving: 100,
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        fiber: 0,
        sugar: 0,
        sodium: 74,
        calcium: 15,
        iron: 1,
        potassium: 256
    },

    {
        id: "rice",
        name: "Cooked white rice",
        serving: 100,
        calories: 130,
        protein: 2.7,
        carbs: 28,
        fat: 0.3,
        fiber: 0.4,
        sugar: 0.1,
        sodium: 1,
        calcium: 10,
        iron: 0.2,
        potassium: 35
    },

    {
        id: "banana",
        name: "Banana",
        serving: 100,
        calories: 89,
        protein: 1.1,
        carbs: 22.8,
        fat: 0.3,
        fiber: 2.6,
        sugar: 12.2,
        sodium: 1,
        calcium: 5,
        iron: 0.3,
        potassium: 358
    },

    {
        id: "apple",
        name: "Apple",
        serving: 100,
        calories: 52,
        protein: 0.3,
        carbs: 13.8,
        fat: 0.2,
        fiber: 2.4,
        sugar: 10.4,
        sodium: 1,
        calcium: 6,
        iron: 0.1,
        potassium: 107
    },

    {
        id: "bread",
        name: "Brown bread",
        serving: 100,
        calories: 247,
        protein: 13,
        carbs: 41,
        fat: 4.2,
        fiber: 6,
        sugar: 5,
        sodium: 450,
        calcium: 150,
        iron: 2.5,
        potassium: 200
    }
];


const $ = (id) =>
    document.getElementById(id);


/* =========================================================
   DATE
   ========================================================= */

function key(d) {

    const y =
        d.getFullYear();

    const m =
        String(
            d.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            d.getDate()
        ).padStart(2, "0");

    return `${y}-${m}-${day}`;
}


function dateObj() {

    const [
        y,
        m,
        d
    ] = selectedDate
        .split("-")
        .map(Number);

    return new Date(
        y,
        m - 1,
        d
    );
}


/* =========================================================
   IDS / DEFAULTS
   ========================================================= */

function uid() {

    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() +
          "-" +
          Math.random();
}


function blankDay() {

    return {
        id: "",
        water: 0,
        meals: []
    };

}


/* =========================================================
   CENTRAL JAIMIE DATA
   ========================================================= */

let dietData = {
    targets,
    foods,
    days: {}
};


/*
 * Current day accessor.
 */
function getDaySync() {

    if (
        !dietData.days[
            selectedDate
        ]
    ) {

        dietData.days[
            selectedDate
        ] = {
            id:
                "day:" +
                selectedDate,

            water: 0,
            meals: []
        };

    }

    window.currentDay =
        dietData.days[
            selectedDate
        ];

    return window.currentDay;

}


/* =========================================================
   LEGACY INDEXEDDB
   ========================================================= */

function openDB() {

    return new Promise(
        (resolve, reject) => {

            const request =
                indexedDB.open(
                    DB,
                    VER
                );


            request.onupgradeneeded =
                () => {

                    const d =
                        request.result;

                    if (
                        !d.objectStoreNames
                            .contains(STORE)
                    ) {

                        d.createObjectStore(
                            STORE,
                            {
                                keyPath: "id"
                            }
                        );

                    }

                };


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


function get(id) {

    return new Promise(
        (resolve, reject) => {

            const request =
                db
                    .transaction(
                        STORE,
                        "readonly"
                    )
                    .objectStore(STORE)
                    .get(id);


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
   LOAD / MIGRATION
   ========================================================= */

async function boot() {

    db =
        await openDB();


    /*
     * First attempt to load from
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

        dietData = {
            targets:
                stored.targets ||
                targets,

            foods:
                Array.isArray(
                    stored.foods
                ) &&
                stored.foods.length
                    ? stored.foods
                    : foods,

            days:
                stored.days ||
                {}
        };


        targets =
            dietData.targets;

        foods =
            dietData.foods;


        await loadDay();

        render();

        return;
    }


    /*
     * No centralized diet data yet.
     *
     * Migrate EVERYTHING from
     * the old IndexedDB database.
     */
    const legacyRecords =
        await getAllLegacy();


    const migratedTargets =
        legacyRecords.find(
            item =>
                item.id === "config"
        );


    if (
        migratedTargets &&
        migratedTargets.targets
    ) {

        targets =
            migratedTargets.targets;

    }


    if (
        migratedTargets &&
        Array.isArray(
            migratedTargets.foods
        ) &&
        migratedTargets.foods.length
    ) {

        foods =
            migratedTargets.foods;

    }


    const migratedDays = {};


    for (
        const record
        of legacyRecords
    ) {

        if (
            !record ||
            typeof record.id !==
                "string"
        ) {
            continue;
        }


        if (
            !record.id.startsWith(
                "day:"
            )
        ) {
            continue;
        }


        const dayKey =
            record.id.slice(4);


        migratedDays[
            dayKey
        ] = {

            id:
                record.id,

            water:
                record.water || 0,

            meals:
                Array.isArray(
                    record.meals
                )
                    ? record.meals
                    : []

        };

    }


    dietData = {

        targets,

        foods,

        days:
            migratedDays

    };


    /*
     * If the current date does not
     * exist, also preserve the old
     * UTC-offset migration behavior.
     */
    if (
        !dietData.days[
            selectedDate
        ]
    ) {

        const legacyDate =
            dateObj();

        legacyDate.setDate(
            legacyDate.getDate() - 1
        );

        const legacyKey =
            key(legacyDate);


        if (
            dietData.days[
                legacyKey
            ]
        ) {

            const source =
                dietData.days[
                    legacyKey
                ];


            dietData.days[
                selectedDate
            ] = {

                ...source,

                id:
                    "day:" +
                    selectedDate

            };

        }

    }


    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        dietData
    );


    await loadDay();

    render();

}


/* =========================================================
   LOAD CURRENT DAY
   ========================================================= */

async function loadDay() {

    if (
        !dietData.days[
            selectedDate
        ]
    ) {

        dietData.days[
            selectedDate
        ] = {

            id:
                "day:" +
                selectedDate,

            water: 0,

            meals: []

        };

    }


    window.currentDay =
        dietData.days[
            selectedDate
        ];

}


/* =========================================================
   SAVE
   ========================================================= */

async function save() {

    /*
     * Keep globals synchronized.
     */
    dietData.targets =
        targets;

    dietData.foods =
        foods;

    dietData.days[
        selectedDate
    ] =
        window.currentDay;


    /*
     * PRIMARY STORAGE
     */
    await JAIMIEData.save(
        JAIMIE_DATA_KEY,
        dietData
    );


    /*
     * TEMPORARY LEGACY BACKUP
     *
     * Keep the old database synchronized
     * while migration is being validated.
     */

    await putLegacy({

        id:
            "config",

        targets,

        foods

    });


    await putLegacy({

        id:
            "day:" +
            selectedDate,

        water:
            window.currentDay.water,

        meals:
            window.currentDay.meals

    });

}


/* =========================================================
   DATE UI
   ========================================================= */

function renderDate() {

    const d =
        dateObj();

    const names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];


    $("dateLabel")
        .textContent =
        d.toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric"
            }
        )
        .toUpperCase();


    $("dayLabel")
        .textContent =
        names[
            d.getDay()
        ];

}


/* =========================================================
   TOTALS
   ========================================================= */

function totals() {

    const t = {

        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        calcium: 0,
        iron: 0,
        potassium: 0

    };


    getDaySync()
        .meals
        .forEach(
            meal => {

                meal.items.forEach(
                    item => {

                        Object.keys(t)
                            .forEach(
                                k => {

                                    t[k] +=
                                        item[k] ||
                                        0;

                                }
                            );

                    }
                );

            }
        );


    return t;

}


/* =========================================================
   UI HELPERS
   ========================================================= */

function setBar(
    id,
    value,
    target
) {

    $(id).style.width =
        Math.min(
            100,
            target
                ? 100 * value / target
                : 0
        ) + "%";

}


function round(x) {

    return Math.round(
        x * 10
    ) / 10;

}

function esc(value) {

    return String(value ?? "").replace(
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
   SUMMARY
   ========================================================= */

function renderSummary() {

    const t =
        totals();


    [
        [
            "calories",
            "calorieValue",
            "calorieBar",
            "kcal"
        ],

        [
            "protein",
            "proteinValue",
            "proteinBar",
            "g"
        ],

        [
            "carbs",
            "carbValue",
            "carbBar",
            "g"
        ],

        [
            "fat",
            "fatValue",
            "fatBar",
            "g"
        ]

    ].forEach(
        ([
            keyName,
            valueId,
            barId,
            unit
        ]) => {

            $(valueId)
                .textContent =
                `${round(
                    t[keyName]
                )} / ${
                    targets[keyName]
                } ${unit}`;


            setBar(
                barId,
                t[keyName],
                targets[keyName]
            );

        }
    );


    [
        "fiber",
        "sugar",
        "sodium",
        "calcium",
        "iron",
        "potassium"
    ].forEach(
        keyName => {

            $(
                keyName +
                "Value"
            ).textContent =
                round(
                    t[keyName]
                ) +
                " " +
                (
                    [
                        "sodium",
                        "calcium",
                        "potassium"
                    ].includes(
                        keyName
                    )
                        ? "mg"
                        : "g"
                );

        }
    );


    renderWater();

}


/* =========================================================
   WATER
   ========================================================= */

function renderWater() {

    const liters =
        getDaySync().water /
        1000;


    $("waterValue")
        .textContent =
        `${round(
            liters
        )} / ${
            targets.water
        } L`;


    const count =
        Math.max(
            1,
            Math.ceil(
                targets.water * 4
            )
        );


    $("waterGlasses")
        .innerHTML = "";


    for (
        let i = 0;
        i < count;
        i++
    ) {

        const glass =
            document.createElement("i");


        glass.className =
            "glass" +
            (
                i <
                Math.round(
                    getDaySync()
                        .water /
                    250
                )
                    ? " filled"
                    : ""
            );


        $("waterGlasses")
            .appendChild(
                glass
            );

    }

}


/* =========================================================
   MEALS
   ========================================================= */

function renderMeals() {

    const wrap =
        $("meals");


    wrap.innerHTML = "";


    if (
        !getDaySync()
            .meals.length
    ) {

        wrap.innerHTML =
            `
                <div class="meal">
                    <div class="empty">
                        No meals yet.
                        Add your first meal for today.
                    </div>
                </div>
            `;

        return;

    }


    getDaySync()
        .meals
        .forEach(
            meal => {

                const box =
                    document.createElement(
                        "article"
                    );


                box.className =
                    "meal";


                const mealCalories =
                    meal.items.reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            (
                                item.calories ||
                                0
                            ),
                        0
                    );


                box.innerHTML = `

                    <div class="meal-head">

                        <div>

                            <span class="meal-name">
                                ${esc(
                                    meal.name
                                )}
                            </span>

                            ${
                                meal.time
                                    ? `
                                        <span class="meal-time">
                                            ${esc(
                                                meal.time
                                            )}
                                        </span>
                                      `
                                    : ""
                            }

                        </div>

                        <div class="meal-actions">

                            <span class="meal-total">
                                ${round(
                                    mealCalories
                                )} kcal
                            </span>

                            <button
                                class="small-btn add-item"
                            >
                                + Food
                            </button>

                            <button
                                class="small-btn delete-meal"
                            >
                                Delete
                            </button>

                        </div>

                    </div>

                `;


                if (
                    !meal.items.length
                ) {

                    box.insertAdjacentHTML(
                        "beforeend",
                        `
                            <div class="empty">
                                Empty meal — add food.
                            </div>
                        `
                    );

                }


                meal.items.forEach(
                    (item, index) => {

                        const row =
                            document.createElement(
                                "div"
                            );


                        row.className =
                            "food-row";


                        row.innerHTML = `

                            <div>
                                <b>
                                    ${esc(
                                        item.name
                                    )}
                                </b>

                                <div class="food-meta">
                                    ${round(
                                        item.amount
                                    )} g
                                </div>
                            </div>

                            <div class="food-kcal">
                                ${round(
                                    item.calories
                                )} kcal
                            </div>

                            <div class="food-macro">
                                ${round(
                                    item.protein
                                )}g P
                            </div>

                            <div class="food-macro">
                                ${round(
                                    item.carbs
                                )}g C
                            </div>

                            <button
                                class="small-btn remove-item"
                            >
                                Remove
                            </button>

                        `;


                        row
                            .querySelector(
                                ".remove-item"
                            )
                            .onclick =
                            async () => {

                                meal.items
                                    .splice(
                                        index,
                                        1
                                    );

                                await save();

                                render();

                            };


                        box.appendChild(
                            row
                        );

                    }
                );


                box
                    .querySelector(
                        ".add-item"
                    )
                    .onclick =
                    () => {

                        addingToMeal =
                            meal.id;

                        openAddFood();

                    };


                box
                    .querySelector(
                        ".delete-meal"
                    )
                    .onclick =
                    async () => {

                        getDaySync()
                            .meals =
                            getDaySync()
                                .meals
                                .filter(
                                    item =>
                                        item.id !==
                                        meal.id
                                );


                        await save();

                        render();

                    };


                wrap.appendChild(
                    box
                );

            }
        );

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

    renderDate();

    renderSummary();

    renderMeals();

}


/* =========================================================
   MODALS
   ========================================================= */

function modal(
    id,
    on = true
) {

    $(id)
        .classList
        .toggle(
            "hidden",
            !on
        );

}


/* =========================================================
   DAY NAVIGATION
   ========================================================= */

$("prevDay").onclick =
    async () => {

        const d =
            dateObj();

        d.setDate(
            d.getDate() - 1
        );

        selectedDate =
            key(d);

        await loadDay();

        render();

    };


$("nextDay").onclick =
    async () => {

        const d =
            dateObj();

        d.setDate(
            d.getDate() + 1
        );

        selectedDate =
            key(d);

        await loadDay();

        render();

    };


$("todayBtn").onclick =
    async () => {

        selectedDate =
            key(new Date());

        await loadDay();

        render();

    };


/* =========================================================
   ADD MEAL
   ========================================================= */

$("addMealBtn").onclick =
    () => {

        $("mealName").value = "";

        $("mealTime").value = "";

        modal(
            "mealModal"
        );

    };


$("mealForm").onsubmit =
    async (event) => {

        event.preventDefault();


        getDaySync()
            .meals
            .push({

                id: uid(),

                name:
                    $("mealName")
                        .value,

                time:
                    $("mealTime")
                        .value,

                items: []

            });


        await save();

        modal(
            "mealModal",
            false
        );

        render();

    };


/* =========================================================
   CLOSE MODALS
   ========================================================= */

document
    .querySelectorAll(
        "[data-close]"
    )
    .forEach(
        button => {

            button.onclick =
                () =>
                    modal(
                        button.dataset.close,
                        false
                    );

        }
    );


/* =========================================================
   NUTRITION DETAILS
   ========================================================= */

$("detailsToggle").onclick =
    () => {

        $("nutritionDetails")
            .classList
            .toggle(
                "open"
            );

    };


/* =========================================================
   WATER
   ========================================================= */

document
    .querySelectorAll(
        "[data-water]"
    )
    .forEach(
        button => {

            button.onclick =
                async () => {

                    getDaySync()
                        .water +=
                        Number(
                            button.dataset.water
                        );

                    await save();

                    render();

                };

        }
    );


$("resetWater").onclick =
    async () => {

        getDaySync()
            .water = 0;

        await save();

        render();

    };


/* =========================================================
   FOOD PICKER
   ========================================================= */

function openAddFood() {

    $("addFoodSearch")
        .value = "";

    renderFoodPicker();

    modal(
        "addFoodModal"
    );

}


function renderFoodPicker() {

    const query =
        $("addFoodSearch")
            .value
            .toLowerCase();


    const list =
        $("addFoodList");


    list.innerHTML = "";


    foods
        .filter(
            food =>
                food.name
                    .toLowerCase()
                    .includes(query)
        )
        .forEach(
            food => {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "library-food";


                item.innerHTML = `

                    <div>

                        <strong>
                            ${esc(
                                food.name
                            )}
                        </strong>

                        <small>
                            ${food.calories}
                            kcal ·
                            ${food.protein}g
                            protein /
                            ${food.serving}g
                        </small>

                    </div>

                    <div class="library-food-actions">

                        <button
                            class="small-btn"
                        >
                            Add
                        </button>

                    </div>

                `;


                item
                    .querySelector(
                        "button"
                    )
                    .onclick =
                    () => {

                        activeFood =
                            food;

                        modal(
                            "addFoodModal",
                            false
                        );

                        $("quantityTitle")
                            .textContent =
                            food.name;

                        $("quantityInput")
                            .value =
                            food.serving;

                        updateQuantityPreview();

                        modal(
                            "quantityModal"
                        );

                    };


                list.appendChild(
                    item
                );

            }
        );

}


$("addFoodSearch")
    .oninput =
    renderFoodPicker;


$("foodSearch")
    .oninput =
    renderLibrary;


let activeFood = null;


/* =========================================================
   QUANTITY
   ========================================================= */

function updateQuantityPreview() {

    if (!activeFood) return;


    const quantity =
        Number(
            $("quantityInput")
                .value
        ) || 0;


    const scale =
        quantity /
        activeFood.serving;


    $("quantityPreview")
        .innerHTML = `

            ${round(
                activeFood.calories *
                scale
            )} kcal ·

            ${round(
                activeFood.protein *
                scale
            )}g protein ·

            ${round(
                activeFood.carbs *
                scale
            )}g carbs ·

            ${round(
                activeFood.fat *
                scale
            )}g fat

        `;

}


$("quantityInput")
    .oninput =
    updateQuantityPreview;


$("quantityForm").onsubmit =
    async (event) => {

        event.preventDefault();


        if (
            !activeFood ||
            !addingToMeal
        ) {
            return;
        }


        const quantity =
            Number(
                $("quantityInput")
                    .value
            );


        const scale =
            quantity /
            activeFood.serving;


        const item = {

            ...activeFood,

            id: uid(),

            amount:
                quantity

        };


        [
            "calories",
            "protein",
            "carbs",
            "fat",
            "fiber",
            "sugar",
            "sodium",
            "calcium",
            "iron",
            "potassium"

        ].forEach(
            field => {

                item[field] =
                    round(
                        (
                            activeFood[field] ||
                            0
                        ) * scale
                    );

            }
        );


        delete item.serving;


        const meal =
            getDaySync()
                .meals
                .find(
                    item =>
                        item.id ===
                        addingToMeal
                );


        if (!meal) return;


        meal.items.push(
            item
        );


        await save();


        modal(
            "quantityModal",
            false
        );


        activeFood = null;

        addingToMeal = null;

        render();

    };


/* =========================================================
   FOOD LIBRARY
   ========================================================= */

$("foodLibraryBtn").onclick =
    () => {

        renderLibrary();

        modal(
            "foodModal"
        );

    };


function renderLibrary() {

    const query =
        $("foodSearch")
            .value
            .toLowerCase();


    const list =
        $("foodList");


    list.innerHTML = "";


    foods
        .filter(
            food =>
                food.name
                    .toLowerCase()
                    .includes(query)
        )
        .forEach(
            food => {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "library-food";


                item.innerHTML = `

                    <div>

                        <strong>
                            ${esc(
                                food.name
                            )}
                        </strong>

                        <small>
                            ${food.serving}g ·
                            ${food.calories} kcal ·
                            ${food.protein}g protein
                        </small>

                    </div>


                    <div class="library-food-actions">

                        <button
                            class="small-btn edit"
                        >
                            Edit
                        </button>

                        <button
                            class="small-btn del"
                        >
                            Delete
                        </button>

                    </div>

                `;


                item
                    .querySelector(
                        ".edit"
                    )
                    .onclick =
                    () =>
                        editFood(food);


                item
                    .querySelector(
                        ".del"
                    )
                    .onclick =
                    async () => {

                        if (
                            confirm(
                                "Delete this food?"
                            )
                        ) {

                            foods =
                                foods.filter(
                                    item =>
                                        item.id !==
                                        food.id
                                );

                            await save();

                            renderLibrary();

                        }

                    };


                list.appendChild(
                    item
                );

            }
        );

}


/* =========================================================
   FOOD EDITOR
   ========================================================= */

$("newFoodBtn").onclick =
    () =>
        editFood(null);


function editFood(food) {

    editingFood =
        food;


    $("foodEditorTitle")
        .textContent =
        food
            ? "Edit Food"
            : "Create Food";


    const values = {

        name: "",

        serving: 100,

        calories: 0,

        protein: 0,

        carbs: 0,

        fat: 0,

        fiber: 0,

        sugar: 0,

        sodium: 0,

        calcium: 0,

        iron: 0,

        potassium: 0,

        ...(food || {})

    };


    $("foodName")
        .value =
        values.name;

    $("foodServing")
        .value =
        values.serving;

    $("fCal")
        .value =
        values.calories;

    $("fProtein")
        .value =
        values.protein;

    $("fCarbs")
        .value =
        values.carbs;

    $("fFat")
        .value =
        values.fat;

    $("fFiber")
        .value =
        values.fiber;

    $("fSugar")
        .value =
        values.sugar;

    $("fSodium")
        .value =
        values.sodium;

    $("fCalcium")
        .value =
        values.calcium;

    $("fIron")
        .value =
        values.iron;

    $("fPotassium")
        .value =
        values.potassium;


    modal(
        "foodEditorModal"
    );

}


$("foodForm").onsubmit =
    async (event) => {

        event.preventDefault();


        const food = {

            id:
                editingFood?.id ||
                uid(),

            name:
                $("foodName")
                    .value,

            serving:
                +$("foodServing")
                    .value,

            calories:
                +$("fCal")
                    .value,

            protein:
                +$("fProtein")
                    .value,

            carbs:
                +$("fCarbs")
                    .value,

            fat:
                +$("fFat")
                    .value,

            fiber:
                +$("fFiber")
                    .value,

            sugar:
                +$("fSugar")
                    .value,

            sodium:
                +$("fSodium")
                    .value,

            calcium:
                +$("fCalcium")
                    .value,

            iron:
                +$("fIron")
                    .value,

            potassium:
                +$("fPotassium")
                    .value

        };


        if (editingFood) {

            foods =
                foods.map(
                    item =>
                        item.id === food.id
                            ? food
                            : item
                );

        }

        else {

            foods.push(
                food
            );

        }


        await save();


        modal(
            "foodEditorModal",
            false
        );


        renderLibrary();

        modal(
            "foodModal"
        );

    };


/* =========================================================
   TARGETS
   ========================================================= */

$("settingsBtn").onclick =
    () => {

        $("tCal").value =
            targets.calories;

        $("tProtein").value =
            targets.protein;

        $("tCarbs").value =
            targets.carbs;

        $("tFat").value =
            targets.fat;

        $("tWater").value =
            targets.water;


        modal(
            "settingsModal"
        );

    };


$("settingsForm").onsubmit =
    async (event) => {

        event.preventDefault();


        targets = {

            calories:
                +$("tCal").value,

            protein:
                +$("tProtein").value,

            carbs:
                +$("tCarbs").value,

            fat:
                +$("tFat").value,

            water:
                +$("tWater").value

        };


        await save();


        modal(
            "settingsModal",
            false
        );


        render();

    };


/* =========================================================
   COPY PREVIOUS DAY
   ========================================================= */

$("copyDayBtn").onclick =
    async () => {

        const d =
            dateObj();


        d.setDate(
            d.getDate() - 1
        );


        const previousKey =
            key(d);


        const previous =
            dietData.days[
                previousKey
            ];


        if (!previous) {

            alert(
                "No previous day to copy."
            );

            return;

        }


        const copy =
            JSON.parse(
                JSON.stringify(
                    previous
                )
            );


        copy.id =
            "day:" +
            selectedDate;


        copy.meals
            .forEach(
                meal =>
                    meal.id =
                        uid()
            );


        /*
         * Also regenerate IDs for
         * food entries to keep them
         * independent.
         */
        copy.meals.forEach(
            meal =>
                meal.items.forEach(
                    item =>
                        item.id =
                            uid()
                )
        );


        dietData.days[
            selectedDate
        ] = copy;


        window.currentDay =
            copy;


        await save();


        await loadDay();

        render();

    };


/* =========================================================
   CLEAR DAY
   ========================================================= */

$("clearDayBtn").onclick =
    async () => {

        if (
            !confirm(
                "Clear all food and water for this day?"
            )
        ) {
            return;
        }


        const fresh =
            blankDay();


        fresh.id =
            "day:" +
            selectedDate;


        dietData.days[
            selectedDate
        ] = fresh;


        window.currentDay =
            fresh;


        await save();


        render();

    };


/* =========================================================
   BOOT
   ========================================================= */

boot();