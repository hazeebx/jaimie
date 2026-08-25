/*
  BRAINDUMP
  ---------
  Local-first freeform text + drawing board.

  STORAGE ARCHITECTURE
  --------------------
  Existing legacy database:
      braindump-db
          └── boards
              └── main

  New JAIMIE data layer:
      JAIMIEData
          └── "braindump"

  During the migration period, saves are written to BOTH.
  This means the old database remains a backup and can be
  safely removed later once the new system is proven stable.
*/

const DB_NAME = "braindump-db";
const DB_VERSION = 1;
const STORE = "boards";
const BOARD_ID = "main";

const workspace = document.getElementById("workspace");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");
const saveText = document.getElementById("save-text");
const colorInput = document.getElementById("color");

let db;

let data = {
  id: BOARD_ID,
  textNodes: [],
  strokes: []
};

let tool = "select";
let drawing = false;
let currentStroke = null;
let undoStack = [];
let redoStack = [];
let saveTimer = null;

const DPR = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

/* =========================================================
   INITIALIZATION
   ========================================================= */

init();

async function init() {
  try {
    /*
     * Open the old database first.
     * We keep this database alive during the migration period.
     */
    db = await openDB();

    /*
     * Try the new JAIMIE Data Manager first.
     *
     * If it already contains Braindump data, that becomes
     * the primary source.
     */
    let stored = null;

    if (window.JAIMIEData) {
      stored = await JAIMIEData.load("braindump");
    }

    /*
     * If JAIMIEData does not have Braindump data yet,
     * migrate the existing legacy database.
     */
    if (stored) {
      data = {
        id: BOARD_ID,
        textNodes: stored.textNodes || [],
        strokes: stored.strokes || []
      };

      updateStatus("Loaded from JAIMIE data");
    } else {
      const legacyStored = await getBoard();

      if (legacyStored) {
        data = {
          id: BOARD_ID,
          textNodes: legacyStored.textNodes || [],
          strokes: legacyStored.strokes || []
        };

        /*
         * First migration:
         *
         * legacy Braindump DB
         *          ↓
         * JAIMIE Data Manager
         */
        if (window.JAIMIEData) {
          await JAIMIEData.save("braindump", {
            version: 1,
            textNodes: data.textNodes,
            strokes: data.strokes
          });

          updateStatus("Migrated to JAIMIE data");
        } else {
          updateStatus("Saved locally");
        }
      } else {
        /*
         * No existing data anywhere.
         */
        data = {
          id: BOARD_ID,
          textNodes: [],
          strokes: []
        };

        /*
         * Create the JAIMIE record immediately so the page
         * has a known data namespace from the beginning.
         */
        if (window.JAIMIEData) {
          await JAIMIEData.save("braindump", {
            version: 1,
            textNodes: [],
            strokes: []
          });
        }

        updateStatus("Ready");
      }
    }

    resizeCanvas();
    renderTextNodes();
    redraw();
    updateHint();

  } catch (error) {
    console.error("Braindump initialization failed:", error);

    /*
     * If the new data manager fails for any reason,
     * fall back to the existing local database.
     */
    try {
      db = db || await openDB();

      const stored = await getBoard();

      if (stored) {
        data = {
          id: BOARD_ID,
          textNodes: stored.textNodes || [],
          strokes: stored.strokes || []
        };
      }

      resizeCanvas();
      renderTextNodes();
      redraw();
      updateHint();

      updateStatus("Legacy local storage");

    } catch (fallbackError) {
      console.error("Braindump fallback failed:", fallbackError);
      updateStatus("Load failed");
    }
  }
}

/* =========================================================
   LEGACY INDEXEDDB
   =========================================================
   Kept intentionally.

   This is our safety backup while we migrate to the
   centralized JAIMIE Data Manager.
   ========================================================= */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getBoard() {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE, "readonly")
      .objectStore(STORE)
      .get(BOARD_ID);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/*
 * Legacy save.
 *
 * We keep writing here temporarily so the original
 * Braindump database remains a live backup.
 */
function saveLegacyBoard() {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put({
        id: BOARD_ID,
        textNodes: data.textNodes,
        strokes: data.strokes,
        updatedAt: Date.now()
      });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* =========================================================
   CENTRALIZED JAIMIE SAVE
   ========================================================= */

async function saveToJaimieData() {
  if (!window.JAIMIEData) {
    return;
  }

  await JAIMIEData.save("braindump", {
    version: 1,
    textNodes: data.textNodes,
    strokes: data.strokes
  });
}

/*
 * Main save function.
 *
 * New system:
 *      JAIMIEData
 *
 * Safety backup:
 *      braindump-db
 */
async function saveBoard() {
  updateStatus("Saving…");

  try {
    /*
     * Save to the new centralized system first.
     */
    await saveToJaimieData();

    /*
     * Also save to the old database while migration
     * is still in progress.
     */
    await saveLegacyBoard();

    updateStatus("Saved locally");

  } catch (error) {
    console.error("Save failed:", error);

    /*
     * If JAIMIEData fails, try the legacy database
     * so the user does not lose their work.
     */
    try {
      await saveLegacyBoard();
      updateStatus("Saved to local backup");
    } catch (legacyError) {
      console.error("Legacy save failed:", legacyError);
      updateStatus("Save failed");
    }
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);

  updateStatus("Unsaved changes");

  saveTimer = setTimeout(() => {
    saveBoard();
  }, 400);
}

function updateStatus(text) {
  saveText.textContent = text;
}

/* =========================================================
   CANVAS
   ========================================================= */

function resizeCanvas() {
  const ratio = DPR();
  const rect = workspace.getBoundingClientRect();

  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  redraw();
}

window.addEventListener("resize", resizeCanvas);

/* =========================================================
   TOOLS
   ========================================================= */

function setTool(next) {
  tool = next;

  document.querySelectorAll(".tool").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tool === tool
    );
  });

  workspace.classList.toggle(
    "pen-mode",
    tool === "pen"
  );

  workspace.classList.toggle(
    "eraser-mode",
    tool === "eraser"
  );

  updateHint();
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    setTool(button.dataset.tool);
  });
});

colorInput.addEventListener("input", () => {
  if (currentStroke) {
    currentStroke.color = colorInput.value;
  }
});

/* =========================================================
   POINTER EVENTS
   ========================================================= */

workspace.addEventListener("pointerdown", event => {
  if (event.target.closest(".text-node")) {
    return;
  }

  const point = getPoint(event);

  if (tool === "select") {
    createTextNode(point.x, point.y);
    return;
  }

  if (tool === "pen") {
    startStroke(point);
  }

  if (tool === "eraser") {
    eraseAt(point);
  }
});

workspace.addEventListener("pointermove", event => {
  if (!drawing || !currentStroke) {

    if (tool === "eraser" && event.buttons) {
      eraseAt(getPoint(event));
    }

    return;
  }

  const point = getPoint(event);

  currentStroke.points.push(point);

  drawStroke(currentStroke);
});

workspace.addEventListener(
  "pointerup",
  finishStroke
);

workspace.addEventListener(
  "pointercancel",
  finishStroke
);

workspace.addEventListener(
  "pointerleave",
  event => {
    if (drawing && event.buttons === 0) {
      finishStroke();
    }
  }
);

function getPoint(event) {
  const rect = workspace.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

/* =========================================================
   DRAWING
   ========================================================= */

function startStroke(point) {
  drawing = true;

  currentStroke = {
    id: uid(),
    color: colorInput.value,
    width: 3,
    points: [point]
  };

  undoStack.push(snapshot());
  redoStack = [];

  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function finishStroke() {
  if (!drawing || !currentStroke) {
    return;
  }

  drawing = false;

  if (currentStroke.points.length > 1) {
    data.strokes.push(currentStroke);

    scheduleSave();
  }

  currentStroke = null;

  redraw();
}

function drawStroke(stroke) {
  const points = stroke.points;

  if (!points.length) {
    return;
  }

  ctx.save();

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();

  ctx.moveTo(
    points[0].x,
    points[0].y
  );

  for (let i = 1; i < points.length; i++) {

    const previous = points[i - 1];
    const current = points[i];

    const midX =
      (previous.x + current.x) / 2;

    const midY =
      (previous.y + current.y) / 2;

    ctx.quadraticCurveTo(
      previous.x,
      previous.y,
      midX,
      midY
    );
  }

  ctx.stroke();

  ctx.restore();
}

function redraw() {
  const ratio = DPR();
  const rect = workspace.getBoundingClientRect();

  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    rect.width,
    rect.height
  );

  for (const stroke of data.strokes) {
    drawStroke(stroke);
  }
}

/* =========================================================
   ERASER
   ========================================================= */

function eraseAt(point) {
  const radius = 18;

  const before = data.strokes.length;

  data.strokes = data.strokes.filter(stroke => {

    return !stroke.points.some(p => {

      const dx = p.x - point.x;
      const dy = p.y - point.y;

      return Math.sqrt(
        dx * dx + dy * dy
      ) < radius;
    });
  });

  if (data.strokes.length !== before) {
    scheduleSave();
    redraw();
  }
}

/* =========================================================
   TEXT NODES
   ========================================================= */

function createTextNode(
  x,
  y,
  existing = null
) {
  const node =
    document.createElement("textarea");

  node.className = "text-node";
  node.spellcheck = true;

  node.placeholder =
    existing
      ? ""
      : "Start typing…";

  node.style.left = `${x}px`;
  node.style.top = `${y}px`;

  node.rows = 1;

  let item;

  if (existing) {

    item = existing;

    node.dataset.id =
      existing.id;

    node.value =
      existing.text;

  } else {

    item = {
      id: uid(),
      x,
      y,
      text: ""
    };

    data.textNodes.push(item);

    node.dataset.id =
      item.id;

    undoStack.push(snapshot());
    redoStack = [];
  }

  workspace.appendChild(node);

  const resizeText = () => {

    node.style.height = "auto";

    node.style.height =
      `${Math.max(
        30,
        node.scrollHeight
      )}px`;
  };

  node.addEventListener(
    "input",
    () => {

      item.text =
        node.value;

      resizeText();

      scheduleSave();

      updateHint();
    }
  );

  node.addEventListener(
    "blur",
    () => {

      item.text =
        node.value;

      if (!item.text.trim()) {

        data.textNodes =
          data.textNodes.filter(
            x => x.id !== item.id
          );

        node.remove();
      }

      scheduleSave();
      updateHint();
    }
  );

  node.addEventListener(
    "keydown",
    event => {

      if (event.key === "Escape") {

        event.preventDefault();

        node.blur();
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {

        event.preventDefault();

        node.blur();
      }
    }
  );

  node.addEventListener(
    "pointerdown",
    event => {
      event.stopPropagation();
    }
  );

  resizeText();

  /*
   * Automatically focus newly created text nodes.
   */
  if (!existing) {

    requestAnimationFrame(() => {

      node.focus({
        preventScroll: true
      });

      node.setSelectionRange(
        node.value.length,
        node.value.length
      );
    });
  }
}

function renderTextNodes() {

  workspace
    .querySelectorAll(".text-node")
    .forEach(node => node.remove());

  for (const item of data.textNodes) {

    createTextNode(
      item.x,
      item.y,
      item
    );
  }
}

/* =========================================================
   HINT
   ========================================================= */

function updateHint() {

  const hasContent =
    data.textNodes.some(
      x => x.text.trim()
    ) ||
    data.strokes.length;

  hint.classList.toggle(
    "hidden",
    Boolean(hasContent)
  );

  if (tool === "pen") {

    hint.querySelector(
      "strong"
    ).textContent =
      "Draw anywhere.";

    hint.querySelector(
      "span"
    ).textContent =
      "Your strokes are saved automatically.";

  } else if (tool === "eraser") {

    hint.querySelector(
      "strong"
    ).textContent =
      "Erase strokes.";

    hint.querySelector(
      "span"
    ).textContent =
      "Switch back to Select to type.";

  } else {

    hint.querySelector(
      "strong"
    ).textContent =
      "Click anywhere to type.";

    hint.querySelector(
      "span"
    ).textContent =
      "Switch to Pen to draw anywhere.";
  }
}

/* =========================================================
   UNDO / REDO
   ========================================================= */

function snapshot() {
  return JSON.stringify({
    textNodes: data.textNodes,
    strokes: data.strokes
  });
}

function restoreSnapshot(serialized) {

  const parsed =
    JSON.parse(serialized);

  data.textNodes =
    parsed.textNodes || [];

  data.strokes =
    parsed.strokes || [];

  renderTextNodes();

  redraw();

  updateHint();

  scheduleSave();
}

document
  .getElementById("undo")
  .addEventListener(
    "click",
    () => {

      if (!undoStack.length) {
        return;
      }

      redoStack.push(
        snapshot()
      );

      restoreSnapshot(
        undoStack.pop()
      );
    }
  );

document
  .getElementById("redo")
  .addEventListener(
    "click",
    () => {

      if (!redoStack.length) {
        return;
      }

      undoStack.push(
        snapshot()
      );

      restoreSnapshot(
        redoStack.pop()
      );
    }
  );

/* =========================================================
   CLEAR
   ========================================================= */

document
  .getElementById("clear")
  .addEventListener(
    "click",
    () => {

      const hasContent =
        data.textNodes.length > 0 ||
        data.strokes.length > 0;

      if (!hasContent) {
        return;
      }

      if (
        !confirm(
          "Clear the entire braindump?"
        )
      ) {
        return;
      }

      undoStack.push(
        snapshot()
      );

      redoStack = [];

      data.textNodes = [];
      data.strokes = [];

      renderTextNodes();
      redraw();
      updateHint();

      scheduleSave();
    }
  );

/* =========================================================
   BRAINDUMP EXPORT
   =========================================================
   This remains a Braindump-specific export.

   The future JAIMIE-wide exporter will live separately
   inside the Data Manager / Settings system.
   ========================================================= */

document
  .getElementById("export")
  .addEventListener(
    "click",
    async () => {

      await saveBoard();

      const payload = {
        app: "Braindump",
        version: 1,
        exportedAt:
          new Date().toISOString(),

        textNodes:
          data.textNodes,

        strokes:
          data.strokes
      };

      const blob = new Blob(
        [
          JSON.stringify(
            payload,
            null,
            2
          )
        ],
        {
          type: "application/json"
        }
      );

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = url;

      anchor.download =
        `braindump-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );
    }
  );

/* =========================================================
   BRAINDUMP IMPORT
   ========================================================= */

document
  .getElementById("import")
  .addEventListener(
    "click",
    () => {

      document
        .getElementById("import-file")
        .click();
    }
  );

document
  .getElementById("import-file")
  .addEventListener(
    "change",
    async event => {

      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      try {

        const imported =
          JSON.parse(
            await file.text()
          );

        if (
          !Array.isArray(
            imported.textNodes
          ) ||
          !Array.isArray(
            imported.strokes
          )
        ) {
          throw new Error(
            "Invalid Braindump file"
          );
        }

        undoStack.push(
          snapshot()
        );

        redoStack = [];

        data.textNodes =
          imported.textNodes;

        data.strokes =
          imported.strokes;

        renderTextNodes();
        redraw();
        updateHint();

        /*
         * Save imported data to BOTH
         * storage systems.
         */
        await saveBoard();

      } catch (error) {

        console.error(
          "Braindump import failed:",
          error
        );

        alert(
          "That file doesn't look like a valid Braindump export."
        );

      } finally {

        event.target.value = "";
      }
    }
  );

/* =========================================================
   UID
   ========================================================= */

function uid() {

  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      (event.ctrlKey ||
        event.metaKey) &&
      event.key.toLowerCase() === "z"
    ) {

      event.preventDefault();

      document
        .getElementById("undo")
        .click();
    }

    if (
      (event.ctrlKey ||
        event.metaKey) &&
      event.key.toLowerCase() === "y"
    ) {

      event.preventDefault();

      document
        .getElementById("redo")
        .click();
    }

    if (event.key === "Escape") {

      setTool("select");
    }
  }
);