import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(join(root, path), "utf8");

const requiredFiles = [
    "music/index.html",
    "music/styles.css",
    "music/app.js",
    "music/core/database.js",
    "music/core/storage.js",
    "music/core/metadata.js",
    "music/core/player.js",
    "assets/jaimie-music.svg",
    "manifest.webmanifest",
    "sw.js"
];

for (const path of requiredFiles) {
    assert.equal(existsSync(join(root, path)), true, `Missing Music file: ${path}`);
}

const html = read("music/index.html");
const app = read("music/app.js");
const storage = read("music/core/storage.js");
const database = read("music/core/database.js");
const player = read("music/core/player.js");
const sidebar = read("side-bar/component.html");
const firebase = JSON.parse(read("firebase.json"));
const manifest = JSON.parse(read("manifest.webmanifest"));

assert.match(html, /<audio\b[^>]*id="audioElement"/i, "Music must use a real audio element");
assert.match(html, /webkitdirectory/, "Music must support desktop folder imports");
assert.match(html, /type="file"[^>]*multiple/, "Music must support multi-file imports");
assert.match(html, /id="folderPlaylistDialog"/, "Folder import must include a playlist chooser");
assert.match(storage, /navigator\.storage\?\.getDirectory|navigator\.storage\.getDirectory/, "Audio must use OPFS");
assert.match(database, /indexedDB\.open/, "Catalog and playlists must use IndexedDB");
assert.match(player, /navigator\.mediaSession|"mediaSession" in navigator/, "Player must integrate Media Session controls");
assert.match(app, /serviceWorker\.register/, "Music must register its PWA service worker");
assert.match(app, /importFiles\(event\.target\.files, \{ playlistId \}\)/, "Folder import must pass the chosen playlist into the importer");
assert.match(app, /playlistTrackIds\.add\(duplicate\.id\)/, "Duplicate tracks must still be added to the chosen playlist");
assert.doesNotMatch(app + storage + database, /JAIMIEData\.(?:save|set)|firebase\.(?:firestore|storage)|uploadBytes|setDoc\s*\(/i, "Music must not sync audio through JAIMIEData or Firebase");
assert.match(sidebar, /href="music\/index\.html"[\s\S]*?>[\s\S]*?Music/, "Sidebar must link to Music");
assert.equal(manifest.start_url, "./music/index.html", "PWA must start on Music");
assert.equal(firebase.hosting.public, ".", "Music should remain inside the deployed static app");

console.log("JAIMIE Music architecture test passed.");
