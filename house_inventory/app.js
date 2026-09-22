/* =========================================================
   JAIMIE — SUPPLY INVENTORY
   =========================================================
   Primary storage:
       jaimie-data → "inventory"

   Temporary legacy backup:
       SupplyInventoryDB

   Data structure:
       {
           items: [],
           shopping: []
       }
   ========================================================= */

const DB = "SupplyInventoryDB";
const VERSION = 1;
const STORE = "data";

const JAIMIE_DATA_KEY = "inventory";


let db;
let filter = "all";
let editing = null;


const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  document.querySelectorAll(selector);


const state = {
  items: [],
  shopping: []
};

let inventoryData = {};


/* =========================================================
   LEGACY INDEXEDDB
   ========================================================= */

function openDB() {

  return new Promise(
    (resolve, reject) => {

      const request =
        indexedDB.open(
          DB,
          VERSION
        );


      request.onupgradeneeded = () => {

        const d =
          request.result;


        if (
          !d.objectStoreNames
            .contains(STORE)
        ) {

          d.createObjectStore(
            STORE,
            {
              keyPath: "key"
            }
          );

        }

      };


      request.onsuccess = () => {

        db = request.result;

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


      request.onsuccess = () => {

        resolve(
          request.result?.value
        );

      };


      request.onerror = () => {

        reject(
          request.error
        );

      };

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


      request.onsuccess = () => {

        resolve(
          request.result || []
        );

      };


      request.onerror = () => {

        reject(
          request.error
        );

      };

    }
  );

}


function write(
  key,
  value
) {

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


      request.onsuccess = () =>
        resolve();


      request.onerror = () =>
        reject(
          request.error
        );

    }
  );

}


/* =========================================================
   CENTRAL JAIMIE DATA
   ========================================================= */

async function saveState() {

  const payload = {

    ...inventoryData,

    items: state.items,

    shopping: state.shopping

  };

  inventoryData = payload;


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
    "items",
    state.items
  );

  await write(
    "shopping",
    state.shopping
  );

}


/* =========================================================
   LOAD / MIGRATION
   ========================================================= */

async function load() {

  /*
   * First try the centralized
   * JAIMIE data store.
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

    inventoryData = stored;

    state.items =
      Array.isArray(
        stored.items
      )
        ? stored.items
        : [];


    state.shopping =
      Array.isArray(
        stored.shopping
      )
        ? stored.shopping
        : [];


    render();

    return;

  }


  /*
   * No centralized record exists yet.
   *
   * Read the old database and migrate it.
   */
  const legacyRecords =
    await readAllLegacy();


  let legacyItems =
    legacyRecords.find(
      record =>
        record.key ===
        "items"
    );


  let legacyShopping =
    legacyRecords.find(
      record =>
        record.key ===
        "shopping"
    );


  state.items =
    Array.isArray(
      legacyItems?.value
    )
      ? legacyItems.value
      : [];


  state.shopping =
    Array.isArray(
      legacyShopping?.value
    )
      ? legacyShopping.value
      : [];

  inventoryData = {};


  /*
   * Write the migrated dataset
   * into the centralized JAIMIE store.
   */
  await JAIMIEData.save(
    JAIMIE_DATA_KEY,
    {
      items: state.items,
      shopping: state.shopping
    }
  );


  render();

}


/* =========================================================
   IDs / HELPERS
   ========================================================= */

function id() {

  return crypto.randomUUID();

}


function icon(category) {

  return category === "groceries"
    ? "✦"
    : "◇";

}


function fmt(number) {

  return Number.isInteger(
    Number(number)
  )

    ? Number(number)

    : Number(number)
        .toFixed(2)
        .replace(
          /0+$/,
          ""
        )
        .replace(
          /\.$/,
          ""
        );

}


function esc(value) {
  return window.JAIMIESafeContent.escapeHtml(value);

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

  const visible =
    state.items.filter(
      item =>
        filter === "all" ||
        item.category === filter
    );


  $("#inventoryGrid").innerHTML =
    visible.length

      ? visible
          .map(card)
          .join("")

      : `
          <div class="empty">
            NO SUPPLIES LOGGED —
            ADD YOUR FIRST ITEM
          </div>
        `;


  $("#shoppingList").innerHTML =
    state.shopping.length

      ? state.shopping
          .map(shopRow)
          .join("")

      : `
          <div class="shop-empty">
            SHOPPING QUEUE CLEAR
          </div>
        `;


  const low =
    state.items.filter(
      item =>
        Number(item.qty) <=
        Number(item.min)
    ).length;


  $("#totalItems").textContent =
    state.items.length;


  $("#groceryCount").textContent =
    state.items.filter(
      item =>
        item.category ===
        "groceries"
    ).length;


  $("#toiletryCount").textContent =
    state.items.filter(
      item =>
        item.category ===
        "toiletries"
    ).length;


  $("#lowCount").textContent =
    low;


  const shoppingPending =
    state.shopping.filter(
      item =>
        !item.done
    ).length;


  $("#shoppingCount")
    .textContent =
    shoppingPending;


  $("#shoppingBadge")
    .textContent =
    shoppingPending;

}


/* =========================================================
   INVENTORY CARD
   ========================================================= */

function card(item) {

  const low =
    Number(item.qty) <=
    Number(item.min);


  /*
   * Preserve the original
   * stock bar behavior.
   */
  const pct =
    item.min > 0

      ? Math.min(
          100,
          Number(item.qty) /
          Number(item.min) *
          100
        )

      : 100;


  return `

    <article
      class="item-card ${
        low
          ? "low"
          : ""
      }"
    >

      <div class="item-top">

        <div>

          <div class="item-icon">
            ${icon(
              item.category
            )}
          </div>

          <div class="item-name">
            ${esc(
              item.name
            )}
          </div>

          <div class="category">
            ${esc(item.category)}
          </div>

        </div>

      </div>


      <div class="qty">

        ${fmt(item.qty)}

        <span>
          ${esc(item.unit)}
        </span>

      </div>


      <div class="stockbar">

        <i
          style="width:${pct}%"
        ></i>

      </div>


      <div class="item-bottom">

        <span class="min">
          MIN
          ${fmt(item.min)}
          ${esc(item.unit)}
        </span>


        <div class="item-actions">

          <button
            class="mini"
            data-inventory-action="decrease"
            data-item-id="${esc(item.id)}"
          >
            −
          </button>

          <button
            class="mini"
            data-inventory-action="increase"
            data-item-id="${esc(item.id)}"
          >
            +
          </button>

          <button
            class="mini"
            data-inventory-action="edit"
            data-item-id="${esc(item.id)}"
          >
            EDIT
          </button>

          ${
            low
              ? `
                <button
                  class="mini"
                  data-inventory-action="add-low"
                  data-item-id="${esc(item.id)}"
                >
                  SHOP
                </button>
              `
              : ""
          }

        </div>

      </div>

    </article>

  `;

}


/* =========================================================
   SHOPPING ROW
   ========================================================= */

function shopRow(item) {

  return `

    <div
      class="shop-row ${
        item.done
          ? "done"
          : ""
      }"
    >

      <button
        class="check-btn"
        data-inventory-action="toggle-shop"
        data-item-id="${esc(item.id)}"
      >
        ${
          item.done
            ? "✓"
            : ""
        }
      </button>


      <div class="shop-name">
        ${esc(
          item.name
        )}
      </div>


      <div class="shop-qty">
        ${fmt(item.qty)}
        ${esc(item.unit)}
      </div>


      <div class="shop-actions">

        <button
          class="mini"
          data-inventory-action="buy-shop"
          data-item-id="${esc(item.id)}"
        >
          ADD TO INV
        </button>

        <button
          class="mini danger"
          data-inventory-action="remove-shop"
          data-item-id="${esc(item.id)}"
        >
          ×
        </button>

      </div>

    </div>

  `;

}


/* =========================================================
   INVENTORY MODAL
   ========================================================= */

function openItem(
  item = null
) {

  editing =
    item;


  $("#modal")
    .classList
    .remove(
      "hidden"
    );


  $("#modalTitle")
    .textContent =
    item
      ? "Edit Item"
      : "Add Item";


  $("#deleteBtn")
    .classList
    .toggle(
      "hidden",
      !item
    );


  $("#editId")
    .value =
    item?.id || "";


  $("#itemName")
    .value =
    item?.name || "";


  $("#itemCategory")
    .value =
    item?.category ||
    "groceries";


  $("#itemUnit")
    .value =
    item?.unit ||
    "pcs";


  $("#itemQty")
    .value =
    item?.qty ??
    1;


  $("#itemMin")
    .value =
    item?.min ??
    0;


  $("#itemNotes")
    .value =
    item?.notes ||
    "";


  $("#itemName")
    .focus();

}


function closeItem() {

  $("#modal")
    .classList
    .add(
      "hidden"
    );


  editing = null;

}


/* =========================================================
   INVENTORY EVENTS
   ========================================================= */

$("#addBtn").onclick =
  () =>
    openItem();


$("#closeModal").onclick =
  closeItem;


$("#cancelBtn").onclick =
  closeItem;


$("#modal").onclick =
  event => {

    if (
      event.target ===
      $("#modal")
    ) {

      closeItem();

    }

  };


$("#itemForm").onsubmit =
  async event => {

    event.preventDefault();


    const existingIndex =
      state.items.findIndex(
        item =>
          item.id ===
          $("editId").value
      );

    const value = {

      ...(
        existingIndex >= 0
          ? state.items[existingIndex]
          : {}
      ),

      id:
        $("#editId")
          .value ||
        id(),

      name:
        $("#itemName")
          .value
          .trim(),

      category:
        $("#itemCategory")
          .value,

      unit:
        $("#itemUnit")
          .value,

      qty:
        Number(
          $("#itemQty")
            .value
        ),

      min:
        Number(
          $("#itemMin")
            .value
        ),

      notes:
        $("#itemNotes")
          .value
          .trim()

    };


    const index = existingIndex;


    if (index >= 0) {

      state.items[index] =
        value;

    }

    else {

      state.items.push(
        value
      );

    }


    await saveState();

    closeItem();

    render();

  };


$("#deleteBtn").onclick =
  async () => {

    if (
      !editing ||
      !confirm(
        `Delete ${editing.name}?`
      )
    ) {

      return;

    }


    state.items =
      state.items.filter(
        item =>
          item.id !==
          editing.id
      );


    await saveState();

    closeItem();

    render();

  };


/* =========================================================
   QUANTITY
   ========================================================= */

async function changeQty(
  itemId,
  delta
) {

  const item =
    state.items.find(
      value =>
        value.id ===
        itemId
    );


  if (!item) return;


  item.qty =
    Math.max(
      0,
      Number(item.qty) +
      delta
    );


  await saveState();

  render();

}


function editItem(itemId) {

  openItem(
    state.items.find(
      item =>
        item.id ===
        itemId
    )
  );

}


/* =========================================================
   LOW-STOCK → SHOPPING
   ========================================================= */

async function addLow(
  itemId
) {

  const item =
    state.items.find(
      value =>
        value.id ===
        itemId
    );


  if (!item) return;


  const alreadyListed =
    state.shopping.some(
      shoppingItem =>
        shoppingItem.name
          .toLowerCase() ===
        item.name
          .toLowerCase() &&
        !shoppingItem.done
    );


  if (alreadyListed) {

    showShopping();

    return;

  }


  state.shopping.push({

    id: id(),

    name:
      item.name,

    qty:
      Math.max(
        1,
        Number(item.min) -
        Number(item.qty)
      ),

    unit:
      item.unit,

    done:
      false

  });


  await saveState();

  render();

  showShopping();

}


/* =========================================================
   VIEW SWITCHING
   ========================================================= */

function showShopping() {

  const active =
    $(".tab.active");


  if (active) {

    active.classList
      .remove(
        "active"
      );

  }


  document
    .querySelector(
      '[data-view="shopping"]'
    )
    .classList
    .add(
      "active"
    );


  $("#inventoryView")
    .classList
    .add(
      "hidden"
    );


  $("#shoppingView")
    .classList
    .remove(
      "hidden"
    );

}


function showInventory() {

  const active =
    $(".tab.active");


  if (active) {

    active.classList
      .remove(
        "active"
      );

  }


  document
    .querySelector(
      '[data-view="inventory"]'
    )
    .classList
    .add(
      "active"
    );


  $("#shoppingView")
    .classList
    .add(
      "hidden"
    );


  $("#inventoryView")
    .classList
    .remove(
      "hidden"
    );

}


$$(".tab").forEach(
  button => {

    button.onclick =
      () => {

        if (
          button.dataset.view ===
          "shopping"
        ) {

          showShopping();

        }

        else {

          showInventory();

        }

      };

  }
);


/* =========================================================
   FILTERS
   ========================================================= */

$$(".filter").forEach(
  button => {

    button.onclick =
      () => {

        $$(".filter")
          .forEach(
            item =>
              item.classList
                .remove(
                  "active"
                )
          );


        button.classList
          .add(
            "active"
          );


        filter =
          button.dataset.category;


        render();

      };

  }
);


/* =========================================================
   SHOPPING MODAL
   ========================================================= */

$("#addShoppingBtn").onclick =
  () => {

    $("#shoppingModal")
      .classList
      .remove(
        "hidden"
      );


    $("#shopName")
      .focus();

  };


$$("[data-close-shopping]")
  .forEach(
    button => {

      button.onclick =
        () =>
          $("#shoppingModal")
            .classList
            .add(
              "hidden"
            );

    }
  );


$("#shoppingModal").onclick =
  event => {

    if (
      event.target ===
      $("#shoppingModal")
    ) {

      $("#shoppingModal")
        .classList
        .add(
          "hidden"
        );

    }

  };


$("#shoppingForm").onsubmit =
  async event => {

    event.preventDefault();


    state.shopping.push({

      id:
        id(),

      name:
        $("#shopName")
          .value
          .trim(),

      qty:
        Number(
          $("#shopQty")
            .value
        ) || 1,

      unit:
        $("#shopUnit")
          .value,

      done:
        false

    });


    await saveState();


    event.target.reset();


    $("#shoppingModal")
      .classList
      .add(
        "hidden"
      );


    render();

  };


/* =========================================================
   SHOPPING ACTIONS
   ========================================================= */

async function toggleShop(
  itemId
) {

  const item =
    state.shopping.find(
      value =>
        value.id ===
        itemId
    );


  if (item) {

    item.done =
      !item.done;

  }


  await saveState();

  render();

}


async function removeShop(
  itemId
) {

  state.shopping =
    state.shopping.filter(
      item =>
        item.id !==
        itemId
    );


  await saveState();

  render();

}


async function buyShop(
  itemId
) {

  const item =
    state.shopping.find(
      value =>
        value.id ===
        itemId
    );


  if (!item) return;


  const existing =
    state.items.find(
      inventoryItem =>
        inventoryItem.name
          .toLowerCase() ===
        item.name
          .toLowerCase()
    );


  if (existing) {

    existing.qty =
      Number(
        existing.qty
      ) +
      Number(
        item.qty
      );

  }

  else {

    state.items.push({

      id:
        id(),

      name:
        item.name,

      category:
        "groceries",

      unit:
        item.unit,

      qty:
        item.qty,

      min:
        0,

      notes:
        ""

    });

  }


  state.shopping =
    state.shopping.filter(
      shoppingItem =>
        shoppingItem.id !==
        itemId
    );


  await saveState();

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
        "[data-inventory-action]"
      );


    if (!button) return;


    const itemId =
      button.dataset.itemId;


    switch (
      button.dataset.inventoryAction
    ) {

      case "decrease":
        await changeQty(itemId, -1);
        break;

      case "increase":
        await changeQty(itemId, 1);
        break;

      case "edit":
        editItem(itemId);
        break;

      case "add-low":
        await addLow(itemId);
        break;

      case "toggle-shop":
        await toggleShop(itemId);
        break;

      case "buy-shop":
        await buyShop(itemId);
        break;

      case "remove-shop":
        await removeShop(itemId);
        break;

    }

  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

  try {

    await openDB();

    await load();

  }

  catch (error) {

    console.error(
      "Inventory initialization failed:",
      error
    );


    alert(
      "Could not open the inventory database."
    );

  }

}


init();
