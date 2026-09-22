(() => {
    "use strict";

    const DATABASE_NAME = "jaimie-music-library";
    const DATABASE_VERSION = 1;
    const TRACKS = "tracks";
    const PLAYLISTS = "playlists";
    const SETTINGS = "settings";

    let connection = null;

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function transactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("Music database transaction aborted."));
        });
    }

    async function open() {
        if (connection) return connection;

        connection = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(TRACKS)) {
                    const tracks = database.createObjectStore(TRACKS, { keyPath: "id" });
                    tracks.createIndex("fingerprint", "fingerprint", { unique: true });
                    tracks.createIndex("title", "title", { unique: false });
                    tracks.createIndex("artist", "artist", { unique: false });
                    tracks.createIndex("album", "album", { unique: false });
                    tracks.createIndex("addedAt", "addedAt", { unique: false });
                }
                if (!database.objectStoreNames.contains(PLAYLISTS)) {
                    database.createObjectStore(PLAYLISTS, { keyPath: "id" });
                }
                if (!database.objectStoreNames.contains(SETTINGS)) {
                    database.createObjectStore(SETTINGS, { keyPath: "key" });
                }
            };

            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });

        return connection;
    }

    async function store(name, mode = "readonly") {
        const database = await open();
        const transaction = database.transaction(name, mode);
        return { transaction, objectStore: transaction.objectStore(name) };
    }

    async function getAll(name) {
        const { objectStore } = await store(name);
        return requestResult(objectStore.getAll());
    }

    async function get(name, key) {
        const { objectStore } = await store(name);
        return requestResult(objectStore.get(key));
    }

    async function put(name, value) {
        const { transaction, objectStore } = await store(name, "readwrite");
        objectStore.put(value);
        await transactionDone(transaction);
        return value;
    }

    async function remove(name, key) {
        const { transaction, objectStore } = await store(name, "readwrite");
        objectStore.delete(key);
        await transactionDone(transaction);
    }

    async function findTrackByFingerprint(fingerprint) {
        const { objectStore } = await store(TRACKS);
        return requestResult(objectStore.index("fingerprint").get(fingerprint));
    }

    async function removeTrackEverywhere(trackId) {
        const database = await open();
        const transaction = database.transaction([TRACKS, PLAYLISTS], "readwrite");
        transaction.objectStore(TRACKS).delete(trackId);

        const playlistsStore = transaction.objectStore(PLAYLISTS);
        const playlists = await requestResult(playlistsStore.getAll());
        for (const playlist of playlists) {
            const nextIds = (Array.isArray(playlist.trackIds) ? playlist.trackIds : [])
                .filter(id => id !== trackId);
            if (nextIds.length !== playlist.trackIds?.length) {
                playlistsStore.put({ ...playlist, trackIds: nextIds, updatedAt: new Date().toISOString() });
            }
        }

        await transactionDone(transaction);
    }

    const tracks = Object.freeze({
        all: () => getAll(TRACKS),
        get: id => get(TRACKS, id),
        put: track => put(TRACKS, track),
        remove: removeTrackEverywhere,
        findByFingerprint: findTrackByFingerprint
    });

    const playlists = Object.freeze({
        all: () => getAll(PLAYLISTS),
        get: id => get(PLAYLISTS, id),
        put: playlist => put(PLAYLISTS, playlist),
        remove: id => remove(PLAYLISTS, id)
    });

    const settings = Object.freeze({
        async get(key, fallback = null) {
            const record = await get(SETTINGS, key);
            return record ? record.value : fallback;
        },
        set: (key, value) => put(SETTINGS, { key, value })
    });

    window.JAIMIEMusicDatabase = Object.freeze({ open, tracks, playlists, settings });
})();
