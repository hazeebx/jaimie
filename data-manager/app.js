/* =========================================================
   JAIMIE — DATA MANAGER
   =========================================================
   Local-first data layer.

   Current architecture:

       Page
         ↓
       JAIMIEData
         ↓
       IndexedDB
         ↓
       Sync Adapter (future Firebase)

   IMPORTANT:
   Firebase is NOT connected yet.

   This version only prepares the local data layer
   for cloud synchronization.
   ========================================================= */

(() => {

    "use strict";


    /* =====================================================
       DATABASE
    ===================================================== */

    const DB_NAME = "jaimie-data";

    /*
     * Version 2 adds:
     *
     * - meta
     *
     * for device identity and sync metadata.
     */
    const DB_VERSION = 2;

    const STORE_NAME = "data";

    const META_STORE = "meta";


    /* =====================================================
       BACKUP
    ===================================================== */

    const BACKUP_FORMAT =
        "JAIMIE_BACKUP";

    const BACKUP_VERSION = 1;


    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let dbPromise = null;

    let deviceIdPromise = null;

    let syncAdapter = null;


    /* =====================================================
       OPEN DATABASE
    ===================================================== */

    function openDB() {

        if (dbPromise) {

            return dbPromise;

        }


        dbPromise =
            new Promise(
                (resolve, reject) => {

                    const request =
                        indexedDB.open(
                            DB_NAME,
                            DB_VERSION
                        );


                    request.onupgradeneeded =
                        event => {

                            const db =
                                event.target.result;


                            /*
                             * Existing data store.
                             */
                            if (
                                !db.objectStoreNames
                                    .contains(
                                        STORE_NAME
                                    )
                            ) {

                                db.createObjectStore(
                                    STORE_NAME,
                                    {
                                        keyPath: "key"
                                    }
                                );

                            }


                            /*
                             * New metadata store.
                             */
                            if (
                                !db.objectStoreNames
                                    .contains(
                                        META_STORE
                                    )
                            ) {

                                db.createObjectStore(
                                    META_STORE,
                                    {
                                        keyPath: "key"
                                    }
                                );

                            }

                        };


                    request.onsuccess =
                        () => {

                            const db =
                                request.result;


                            db.onversionchange =
                                () => {

                                    db.close();

                                };


                            resolve(db);

                        };


                    request.onerror =
                        () =>
                            reject(
                                request.error
                            );

                }
            );


        return dbPromise;

    }


    /* =====================================================
       STORE ACCESS
    ===================================================== */

    async function store(
        storeName,
        mode
    ) {

        const db =
            await openDB();


        return db
            .transaction(
                storeName,
                mode
            )
            .objectStore(
                storeName
            );

    }


    /* =====================================================
       DEVICE ID
    ===================================================== */

    async function getDeviceId() {

        if (
            deviceIdPromise
        ) {

            return deviceIdPromise;

        }


        deviceIdPromise =
            (async () => {

                const meta =
                    await getMeta(
                        "deviceId"
                    );


                if (
                    meta?.value
                ) {

                    return meta.value;

                }


                const id =
                    createDeviceId();


                await setMeta(
                    "deviceId",
                    id
                );


                return id;

            })();


        return deviceIdPromise;

    }


    function createDeviceId() {

        if (
            crypto?.randomUUID
        ) {

            return crypto.randomUUID();

        }


        return (
            "device-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(16)
                .slice(2)
        );

    }


    /* =====================================================
       METADATA STORE
    ===================================================== */

    async function getMeta(
        key
    ) {

        const s =
            await store(
                META_STORE,
                "readonly"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.get(key);


                request.onsuccess =
                    () =>
                        resolve(
                            request.result ||
                            null
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    async function setMeta(
        key,
        value
    ) {

        const s =
            await store(
                META_STORE,
                "readwrite"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.put({
                        key,
                        value
                    });


                request.onsuccess =
                    () =>
                        resolve(
                            value
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    /* =====================================================
       TIME / VERSION
       ===================================================== */

    function nowIso() {

        return new Date()
            .toISOString();

    }


    function nowMs() {

        return Date.now();

    }


    function nextVersion(
        current
    ) {

        const number =
            Number(
                current
            );


        return Number.isFinite(
            number
        )
            ? number + 1
            : 1;

    }


    /* =====================================================
       SAVE
       ===================================================== */

    async function save(
        key,
        value
    ) {

        if (
            !key ||
            typeof key !==
                "string"
        ) {

            throw new Error(
                "JAIMIEData.save(): key must be a non-empty string."
            );

        }


        const existing =
            await readRecord(
                key
            );


        const deviceId =
            await getDeviceId();


        const updatedAt =
            nowIso();


        const updatedAtMs =
            nowMs();


        const record = {

            key,

            value,

            updatedAt,

            updatedAtMs,

            version:
                nextVersion(
                    existing?.version
                ),

            deviceId,

            dirty:
                true

        };


        const s =
            await store(
                STORE_NAME,
                "readwrite"
            );


        await new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.put(
                        record
                    );


                request.onsuccess =
                    () =>
                        resolve(
                            value
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );


        /*
         * Tell an active sync adapter
         * that something changed.
         *
         * Firebase will be plugged
         * into this later.
         */
        if (
            syncAdapter &&
            typeof syncAdapter.onLocalChange ===
                "function"
        ) {

            try {

                await syncAdapter.onLocalChange(
                    record
                );

            }

            catch (
                error
            ) {

                console.warn(
                    "JAIMIE sync adapter local-change hook failed:",
                    error
                );

            }

        }


        return value;

    }


    /* =====================================================
       LOAD
    ===================================================== */

    async function load(
        key
    ) {

        if (
            !key ||
            typeof key !==
                "string"
        ) {

            throw new Error(
                "JAIMIEData.load(): key must be a non-empty string."
            );

        }


        const record =
            await readRecord(
                key
            );


        return record
            ? record.value
            : null;

    }


    /* =====================================================
       READ RAW RECORD
    ===================================================== */

    async function readRecord(
        key
    ) {

        const s =
            await store(
                STORE_NAME,
                "readonly"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.get(key);


                request.onsuccess =
                    () =>
                        resolve(
                            request.result ||
                            null
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    /* =====================================================
       GET RECORD
    ===================================================== */

    async function getRecord(
        key
    ) {

        return readRecord(
            key
        );

    }


    /* =====================================================
       DELETE
    ===================================================== */

    async function remove(
        key
    ) {

        const s =
            await store(
                STORE_NAME,
                "readwrite"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.delete(
                        key
                    );


                request.onsuccess =
                    () =>
                        resolve(
                            true
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    /* =====================================================
       LIST KEYS
    ===================================================== */

    async function listKeys() {

        const s =
            await store(
                STORE_NAME,
                "readonly"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.getAllKeys();


                request.onsuccess =
                    () =>
                        resolve(
                            request.result ||
                            []
                        );


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    /* =====================================================
       GET ALL
    ===================================================== */

    async function getAll() {

        const s =
            await store(
                STORE_NAME,
                "readonly"
            );


        return new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.getAll();


                request.onsuccess =
                    () => {

                        const result =
                            {};


                        for (
                            const entry
                            of request.result ||
                            []
                        ) {

                            result[
                                entry.key
                            ] = {

                                value:
                                    entry.value,

                                updatedAt:
                                    entry.updatedAt ||
                                    null,

                                updatedAtMs:
                                    entry.updatedAtMs ||
                                    null,

                                version:
                                    entry.version ||
                                    0,

                                deviceId:
                                    entry.deviceId ||
                                    null,

                                dirty:
                                    !!entry.dirty

                            };

                        }


                        resolve(
                            result
                        );

                    };


                request.onerror =
                    () =>
                        reject(
                            request.error
                        );

            }
        );

    }


    /* =====================================================
       CHANGES
    ===================================================== */

    async function getChanges() {

        const all =
            await getAll();


        return Object
            .entries(
                all
            )
            .map(
                (
                    [
                        key,
                        entry
                    ]
                ) => ({

                    key,

                    ...entry

                })
            )
            .filter(
                entry =>
                    entry.dirty ===
                    true
            );

    }


    /* =====================================================
       MARK SYNCED
    ===================================================== */

    async function markSynced(
        key
    ) {

        const record =
            await readRecord(
                key
            );


        if (!record) {

            return false;

        }


        /*
         * Don't overwrite a newer
         * local edit accidentally.
         */
        record.dirty =
            false;


        const s =
            await store(
                STORE_NAME,
                "readwrite"
            );


        await new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.put(
                        record
                    );


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


        return true;

    }


    /* =====================================================
       APPLY REMOTE RECORD
    ===================================================== */

    async function applyRemote(
        remoteRecord
    ) {

        if (
            !remoteRecord ||
            typeof remoteRecord.key !==
                "string"
        ) {

            throw new Error(
                "JAIMIEData.applyRemote(): invalid remote record."
            );

        }


        const local =
            await readRecord(
                remoteRecord.key
            );


        /*
         * No local record:
         * accept remote.
         */
        if (!local) {

            return writeRemoteRecord(
                remoteRecord
            );

        }


        /*
         * Local dirty:
         *
         * Don't automatically overwrite it.
         *
         * The future sync engine will resolve
         * this as a conflict.
         */
        if (
            local.dirty
        ) {

            return {

                applied:
                    false,

                conflict:
                    true,

                local,

                remote:
                    remoteRecord

            };

        }


        /*
         * Remote version wins only when
         * it is actually newer.
         */
        const remoteVersion =
            Number(
                remoteRecord.version ||
                0
            );


        const localVersion =
            Number(
                local.version ||
                0
            );


        if (
            remoteVersion <
            localVersion
        ) {

            return {

                applied:
                    false,

                conflict:
                    false,

                reason:
                    "local-newer"

            };

        }


        if (
            remoteVersion ===
                localVersion &&
            remoteRecord.updatedAtMs <=
                local.updatedAtMs
        ) {

            return {

                applied:
                    false,

                conflict:
                    false,

                reason:
                    "same-or-older"

            };

        }


        await writeRemoteRecord(
            remoteRecord
        );


        return {

            applied:
                true,

            conflict:
                false

        };

    }


    async function writeRemoteRecord(
        record
    ) {

        const normalized = {

            key:
                record.key,

            value:
                record.value,

            updatedAt:
                record.updatedAt ||
                nowIso(),

            updatedAtMs:
                record.updatedAtMs ||
                nowMs(),

            version:
                Number(
                    record.version ||
                    1
                ),

            deviceId:
                record.deviceId ||
                null,

            /*
             * A remote record we accepted
             * is synchronized locally.
             */
            dirty:
                false

        };


        const s =
            await store(
                STORE_NAME,
                "readwrite"
            );


        await new Promise(
            (
                resolve,
                reject
            ) => {

                const request =
                    s.put(
                        normalized
                    );


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


        return normalized;

    }


    /* =====================================================
       SYNC STATUS
    ===================================================== */

    async function syncStatus() {

        const changes =
            await getChanges();


        const all =
            await getAll();


        return {

            enabled:
                !!syncAdapter,

            configured:
                !!syncAdapter,

            connected:
                syncAdapter?.connected
                    ? !!syncAdapter.connected()
                    : false,

            deviceId:
                await getDeviceId(),

            datasets:
                Object.keys(
                    all
                ).length,

            pending:
                changes.length

        };

    }


    /* =====================================================
       CONFIGURE SYNC ADAPTER
    ===================================================== */

    function configureSync(
        adapter
    ) {

        if (
            adapter !== null &&
            typeof adapter !==
                "object"
        ) {

            throw new Error(
                "JAIMIEData.sync.configure(): adapter must be an object or null."
            );

        }


        syncAdapter =
            adapter;


        return true;

    }


    /* =====================================================
       SYNC API
    ===================================================== */

    async function syncNow() {

        if (!syncAdapter) {

            return {

                enabled:
                    false,

                synced:
                    0,

                conflicts:
                    0

            };

        }


        if (
            typeof syncAdapter.sync !==
                "function"
        ) {

            throw new Error(
                "JAIMIE sync adapter does not implement sync()."
            );

        }


        return syncAdapter.sync({

            getChanges,

            getRecord,

            applyRemote,

            markSynced,

            getDeviceId

        });

    }


    /* =====================================================
       EXPORT
    ===================================================== */

    async function exportAll() {

        return {

            format:
                BACKUP_FORMAT,

            version:
                BACKUP_VERSION,

            exportedAt:
                nowIso(),

            deviceId:
                await getDeviceId(),

            data:
                await getAll()

        };

    }


    /* =====================================================
       DOWNLOAD BACKUP
    ===================================================== */

    function downloadBackup(
        backup,
        filename = null
    ) {

        const date =
            new Date()
                .toISOString()
                .slice(
                    0,
                    10
                );


        const blob =
            new Blob(
                [
                    JSON.stringify(
                        backup,
                        null,
                        2
                    )
                ],
                {
                    type:
                        "application/json"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const a =
            document.createElement(
                "a"
            );


        a.href =
            url;


        a.download =
            filename ||
            `JAIMIE-backup-${date}.json`;


        document.body.appendChild(
            a
        );


        a.click();

        a.remove();


        setTimeout(
            () =>
                URL.revokeObjectURL(
                    url
                ),
            1000
        );

    }


    /* =====================================================
       IMPORT BACKUP
    ===================================================== */

    async function importBackup(
        backup,
        {
            replace = false
        } = {}
    ) {

        if (
            !backup ||
            backup.format !==
                BACKUP_FORMAT ||
            backup.version !==
                BACKUP_VERSION
        ) {

            throw new Error(
                "Invalid or unsupported JAIMIE backup."
            );

        }


        if (
            !backup.data ||
            typeof backup.data !==
                "object"
        ) {

            throw new Error(
                "JAIMIE backup contains no data."
            );

        }


        if (
            replace
        ) {

            for (
                const key
                of await listKeys()
            ) {

                await remove(
                    key
                );

            }

        }


        for (
            const [
                key,
                entry
            ]
            of Object.entries(
                backup.data
            )
        ) {

            /*
             * Preserve imported metadata
             * where available.
             */
            const record = {

                key,

                value:
                    entry?.value,

                updatedAt:
                    entry?.updatedAt ||
                    nowIso(),

                updatedAtMs:
                    entry?.updatedAtMs ||
                    nowMs(),

                version:
                    entry?.version ||
                    1,

                deviceId:
                    entry?.deviceId ||
                    null,

                /*
                 * Imported backup is local
                 * data, so treat it as dirty
                 * until a future cloud sync
                 * confirms it.
                 */
                dirty:
                    true

            };


            const s =
                await store(
                    STORE_NAME,
                    "readwrite"
                );


            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const request =
                        s.put(
                            record
                        );


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


        return true;

    }


    /* =====================================================
       IMPORT FILE
    ===================================================== */

    async function importFile(
        file,
        options = {}
    ) {

        if (!file) {

            throw new Error(
                "No backup file selected."
            );

        }


        let backup;


        try {

            backup =
                JSON.parse(
                    await file.text()
                );

        }

        catch {

            throw new Error(
                "The selected file is not valid JSON."
            );

        }


        return importBackup(
            backup,
            options
        );

    }


    /* =====================================================
       READY CHECK
    ===================================================== */

    function isReady() {

        return (
            typeof indexedDB !==
            "undefined"
        );

    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.JAIMIEData = {

        /* Local data */
        save,

        load,

        delete:
            remove,

        remove,

        listKeys,

        getAll,

        getRecord,

        getChanges,

        markSynced,

        applyRemote,


        /* Backup */
        exportAll,

        downloadBackup,

        importBackup,

        importFile,


        /* Sync */
        sync: {

            configure:
                configureSync,

            now:
                syncNow,

            status:
                syncStatus

        },


        /* System */
        isReady,

        meta: {

            dbName:
                DB_NAME,

            dbVersion:
                DB_VERSION,

            storeName:
                STORE_NAME,

            metaStoreName:
                META_STORE,

            backupFormat:
                BACKUP_FORMAT,

            backupVersion:
                BACKUP_VERSION

        }

    };


    console.log(
        "%cJAIMIE Data Manager%c loaded — local-first sync layer ready",
        "color:#ff7a18;font-weight:bold",
        "color:inherit"
    );

/* =========================================================
   FIREBASE SYNC BOOTSTRAP
   ========================================================= */

(async () => {

    try {

        await import(
            "../firebase/sync.js"
        );

    }

    catch (error) {

        console.warn(
            "JAIMIE Firebase Sync unavailable:",
            error
        );

    }

})();

})();