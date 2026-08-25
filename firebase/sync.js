/* =========================================================
   JAIMIE — FIREBASE SYNC
   =========================================================

   LOCAL-FIRST / BATCHED SYNC

   Every page writes locally immediately.

   Firebase sync happens:
       • every 5 minutes
       • on startup / authentication
       • manually via Sync Now

   There is NO per-change Firebase upload.
   There is NO realtime Firestore listener.

   ========================================================= */

import {
    firestore
} from "./app.js";

import {
    observe,
    signInAnonymous
} from "./auth.js";

import {
    collection,
    doc,
    getDocs,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
   ========================================================= */

const SYNC_INTERVAL =
    5 * 60 * 1000; // 5 minutes


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;

let initialized = false;

let syncing = false;

let lastSyncAt = null;

let nextSyncAt = null;

let syncTimer = null;


/* =========================================================
   FIRESTORE PATHS
   ========================================================= */

function userDataCollection(
    uid
) {

    return collection(
        firestore,
        "users",
        uid,
        "data"
    );

}


function userDataDocument(
    uid,
    key
) {

    return doc(
        firestore,
        "users",
        uid,
        "data",
        key
    );

}


/* =========================================================
   RECORD NORMALIZATION
   ========================================================= */

function normalizeLocalRecord(
    key,
    entry
) {

    return {

        key,

        value:
            entry?.value,

        updatedAt:
            entry?.updatedAt ||
            null,

        updatedAtMs:
            Number(
                entry?.updatedAtMs ||
                (
                    entry?.updatedAt
                        ? Date.parse(
                            entry.updatedAt
                        )
                        : 0
                )
            ),

        version:
            Number(
                entry?.version ||
                0
            ),

        deviceId:
            entry?.deviceId ||
            null,

        dirty:
            !!entry?.dirty

    };

}


function normalizeRemoteRecord(
    key,
    entry
) {

    return {

        key,

        value:
            entry?.value,

        updatedAt:
            entry?.updatedAt ||
            null,

        updatedAtMs:
            Number(
                entry?.updatedAtMs ||
                (
                    entry?.updatedAt
                        ? Date.parse(
                            entry.updatedAt
                        )
                        : 0
                )
            ),

        version:
            Number(
                entry?.version ||
                0
            ),

        deviceId:
            entry?.deviceId ||
            null,

        dirty:
            false

    };

}


/* =========================================================
   RECORD COMPARISON
   ========================================================= */

function compareRecords(
    local,
    remote
) {

    const localTime =
        Number(
            local?.updatedAtMs ||
            0
        );

    const remoteTime =
        Number(
            remote?.updatedAtMs ||
            0
        );


    /*
     * Primary:
     * latest timestamp wins.
     */
    if (
        localTime !==
        remoteTime
    ) {

        return localTime >
            remoteTime
            ? 1
            : -1;

    }


    /*
     * Secondary:
     * version number.
     */
    const localVersion =
        Number(
            local?.version ||
            0
        );

    const remoteVersion =
        Number(
            remote?.version ||
            0
        );


    if (
        localVersion !==
        remoteVersion
    ) {

        return localVersion >
            remoteVersion
            ? 1
            : -1;

    }


    /*
     * Final deterministic tie-breaker.
     */
    const localDevice =
        String(
            local?.deviceId ||
            ""
        );

    const remoteDevice =
        String(
            remote?.deviceId ||
            ""
        );


    if (
        localDevice ===
        remoteDevice
    ) {

        return 0;

    }


    return localDevice >
        remoteDevice
        ? 1
        : -1;

}


/* =========================================================
   LOCAL DATA
   ========================================================= */

async function getLocalData() {

    const all =
        await JAIMIEData.getAll();


    const result = {};


    for (
        const [
            key,
            entry
        ]
        of Object.entries(
            all
        )
    ) {

        result[key] =
            normalizeLocalRecord(
                key,
                entry
            );

    }


    return result;

}


/* =========================================================
   REMOTE DATA
   ========================================================= */

async function getRemoteData() {

    if (
        !currentUser
    ) {

        return {};

    }


    const snapshot =
        await getDocs(
            userDataCollection(
                currentUser.uid
            )
        );


    const result = {};


    for (
        const documentSnapshot
        of snapshot.docs
    ) {

        const key =
            documentSnapshot.id;


        result[key] =
            normalizeRemoteRecord(
                key,
                documentSnapshot.data()
            );

    }


    return result;

}


/* =========================================================
   PUSH ONE DATASET
   ========================================================= */

async function pushRecord(
    record
) {

    if (
        !currentUser
    ) {

        return {

            pushed: false,

            reason:
                "not-authenticated"

        };

    }


    const remoteRef =
        userDataDocument(
            currentUser.uid,
            record.key
        );


    const remoteRecord = {

        key:
            record.key,

        value:
            record.value,

        updatedAt:
            record.updatedAt ||
            new Date().toISOString(),

        updatedAtMs:
            record.updatedAtMs ||
            Date.now(),

        version:
            Number(
                record.version ||
                1
            ),

        deviceId:
            record.deviceId ||
            null

    };


    await setDoc(
        remoteRef,
        remoteRecord
    );


    await JAIMIEData.markSynced(
        record.key
    );


    console.log(
        `JAIMIE Sync: "${record.key}" uploaded.`
    );


    return {

        pushed: true,

        key:
            record.key

    };

}


/* =========================================================
   RECONCILE ONE DATASET
   ========================================================= */

async function reconcileRecord(
    local,
    remote
) {

    /*
     * Only remote exists.
     */
    if (
        !local &&
        remote
    ) {

        const result =
            await JAIMIEData.applyRemote(
                remote,
                {
                    force: true
                }
            );


        return {

            action:
                result.applied
                    ? "pulled"
                    : "unchanged",

            conflict:
                false

        };

    }


    /*
     * Only local exists.
     */
    if (
        local &&
        !remote
    ) {

        return pushRecord(
            local
        )
            .then(
                result => ({

                    action:
                        result.pushed
                            ? "pushed"
                            : "skipped",

                    conflict:
                        false

                })
            );

    }


    /*
     * Nothing exists.
     */
    if (
        !local &&
        !remote
    ) {

        return {

            action:
                "nothing",

            conflict:
                false

        };

    }


    /*
     * Both exist.
     */
    const comparison =
        compareRecords(
            local,
            remote
        );


    /*
     * Local wins.
     */
    if (
        comparison > 0
    ) {

        return pushRecord(
            local
        )
            .then(
                result => ({

                    action:
                        result.pushed
                            ? "pushed"
                            : "skipped",

                    conflict:
                        false

                })
            );

    }


    /*
     * Remote wins.
     */
    if (
        comparison < 0
    ) {

        const result =
            await JAIMIEData.applyRemote(
                remote,
                {
                    force: true
                }
            );


        console.log(
            `JAIMIE Sync: "${remote.key}" updated from cloud.`
        );


        return {

            action:
                result.applied
                    ? "pulled"
                    : "unchanged",

            conflict:
                false

        };

    }


    /*
     * Equal.
     */
    if (
        local.dirty
    ) {

        await JAIMIEData.markSynced(
            local.key
        );

    }


    return {

        action:
            "unchanged",

        conflict:
            false

    };

}


/* =========================================================
   FULL RECONCILIATION
   ========================================================= */

async function reconcileAll() {

    if (
        !currentUser
    ) {

        return {

            pushed: 0,

            pulled: 0,

            unchanged: 0,

            conflicts: 0

        };

    }


    const local =
        await getLocalData();


    const remote =
        await getRemoteData();


    const localKeys =
        Object.keys(
            local
        );

    const remoteKeys =
        Object.keys(
            remote
        );


    const localEmpty =
        localKeys.length === 0;

    const remoteEmpty =
        remoteKeys.length === 0;


    let pushed = 0;

    let pulled = 0;

    let unchanged = 0;

    let conflicts = 0;


    /*
     * =====================================================
     * FIRST BOOTSTRAP
     *
     * Firebase empty + local populated
     * =====================================================
     */

    if (
        remoteEmpty &&
        !localEmpty
    ) {

        console.log(
            "JAIMIE Sync: Firebase is empty. Seeding cloud from local data."
        );


        for (
            const key
            of localKeys
        ) {

            try {

                const result =
                    await pushRecord(
                        local[key]
                    );


                if (
                    result.pushed
                ) {

                    pushed += 1;

                }

            }

            catch (error) {

                console.error(
                    `JAIMIE Sync: failed to seed "${key}".`,
                    error
                );

            }

        }


        return {

            pushed,

            pulled: 0,

            unchanged: 0,

            conflicts: 0,

            bootstrap:
                "local-seeded"

        };

    }


    /*
     * =====================================================
     * DEVICE HYDRATION
     *
     * Local empty + Firebase populated
     * =====================================================
     */

    if (
        localEmpty &&
        !remoteEmpty
    ) {

        console.log(
            "JAIMIE Sync: local database is empty. Pulling cloud data."
        );


        for (
            const key
            of remoteKeys
        ) {

            try {

                const result =
                    await JAIMIEData.applyRemote(
                        remote[key],
                        {
                            force: true
                        }
                    );


                if (
                    result.applied
                ) {

                    pulled += 1;

                    console.log(
                        `JAIMIE Sync: "${key}" restored from cloud.`
                    );

                }

            }

            catch (error) {

                console.error(
                    `JAIMIE Sync: failed to restore "${key}".`,
                    error
                );

            }

        }


        return {

            pushed: 0,

            pulled,

            unchanged: 0,

            conflicts: 0,

            bootstrap:
                "cloud-restored"

        };

    }


    /*
     * =====================================================
     * BOTH EMPTY
     * =====================================================
     */

    if (
        localEmpty &&
        remoteEmpty
    ) {

        return {

            pushed: 0,

            pulled: 0,

            unchanged: 0,

            conflicts: 0,

            bootstrap:
                "empty"

        };

    }


    /*
     * =====================================================
     * NORMAL RECONCILIATION
     * =====================================================
     */

    const keys =
        new Set([
            ...localKeys,
            ...remoteKeys
        ]);


    for (
        const key
        of keys
    ) {

        try {

            const result =
                await reconcileRecord(
                    local[key],
                    remote[key]
                );


            if (
                result.action ===
                "pushed"
            ) {

                pushed += 1;

            }

            else if (
                result.action ===
                "pulled"
            ) {

                pulled += 1;

            }

            else {

                unchanged += 1;

            }


            if (
                result.conflict
            ) {

                conflicts += 1;

            }

        }

        catch (error) {

            console.error(
                `JAIMIE Sync: reconciliation failed for "${key}".`,
                error
            );

        }

    }


    return {

        pushed,

        pulled,

        unchanged,

        conflicts,

        bootstrap:
            "reconciled"

    };

}


/* =========================================================
   SYNC NOW
   ========================================================= */

async function syncNow() {

    if (
        syncing
    ) {

        return {

            skipped: true

        };

    }


    if (
        !currentUser
    ) {

        return {

            enabled: true,

            authenticated:
                false,

            pushed: 0,

            pulled: 0,

            conflicts: 0

        };

    }


    syncing =
        true;


    try {

        console.log(
            "JAIMIE Sync: full sync started."
        );


        const result =
            await reconcileAll();


        lastSyncAt =
            new Date()
                .toISOString();


        console.log(
            "JAIMIE Sync: full sync complete.",
            result
        );


        return {

            enabled: true,

            authenticated:
                true,

            uid:
                currentUser.uid,

            ...result

        };

    }

    finally {

        syncing =
            false;

    }

}


/* =========================================================
   LOCAL CHANGE HOOK
   =========================================================

   IMPORTANT:

   This is intentionally NO-OP.

   JAIMIEData.save() still marks the dataset dirty,
   but Firebase is NOT touched immediately.

   The 5-minute sync cycle will pick it up.
   ========================================================= */

async function onLocalChange(
    record
) {

    /*
     * No Firebase write here.
     *
     * Local IndexedDB remains instant.
     */
    return {

        queued: true,

        key:
            record?.key ||
            null

    };

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function connected() {

    return !!currentUser;

}


async function status() {

    const local =
        await getLocalData();


    const pending =
        Object.values(
            local
        ).filter(
            entry =>
                entry.dirty
        ).length;


    return {

        enabled:
            true,

        connected:
            !!currentUser,

        authenticated:
            !!currentUser,

        uid:
            currentUser?.uid ||
            null,

        datasets:
            Object.keys(
                local
            ).length,

        pending,

        lastSyncAt,

        nextSyncAt

    };

}


/* =========================================================
   START PERIODIC SYNC
   ========================================================= */

function startSyncTimer() {

    if (
        syncTimer
    ) {

        clearInterval(
            syncTimer
        );

    }


    nextSyncAt =
        Date.now() +
        SYNC_INTERVAL;


    syncTimer =
        setInterval(
            async () => {

                nextSyncAt =
                    Date.now() +
                    SYNC_INTERVAL;


                if (
                    !currentUser
                ) {

                    return;

                }


                try {

                    await syncNow();

                }

                catch (error) {

                    console.error(
                        "JAIMIE Sync: scheduled sync failed.",
                        error
                    );

                }

            },

            SYNC_INTERVAL
        );


    console.log(
        "JAIMIE Sync: 5-minute sync timer started."
    );

}


/* =========================================================
   AUTH STATE
   ========================================================= */

observe(
    async user => {

        /*
         * No Firebase user:
         * create anonymous identity.
         */
        if (!user) {

            currentUser =
                null;


            return;

        }


        const changedUser =
            !currentUser ||
            currentUser.uid !==
                user.uid;


        currentUser =
            user;


        /*
         * Authenticate / account switch:
         * perform one immediate full sync.
         */
        if (
            changedUser
        ) {

            try {

                const result =
                    await syncNow();


                console.log(
                    "JAIMIE Sync: authentication sync complete.",
                    result
                );

            }

            catch (error) {

                console.error(
                    "JAIMIE Sync: authentication sync failed.",
                    error
                );

            }

        }


        /*
         * Start the recurring timer.
         */
        startSyncTimer();

    }
);


/* =========================================================
   OPTIONAL ONLINE TRIGGER
   =========================================================

   If the browser was offline and comes back online,
   run one sync immediately instead of waiting up to 5 min.
   ========================================================= */

window.addEventListener(
    "online",
    async () => {

        if (
            !currentUser
        ) {

            return;

        }


        try {

            console.log(
                "JAIMIE Sync: connection restored. Syncing..."
            );


            await syncNow();

        }

        catch (error) {

            console.error(
                "JAIMIE Sync: online sync failed.",
                error
            );

        }

    }
);


/* =========================================================
   INITIALIZE
   ========================================================= */

function initialize() {

    if (
        initialized
    ) {

        return;

    }


    initialized =
        true;


    JAIMIEData.sync.configure({

        connected,

        onLocalChange,

        sync:
            syncNow,

        status

    });


    console.log(
        "%cJAIMIE Firebase Sync%c adapter configured — 5 minute cycle",
        "color:#ff8a2a;font-weight:bold",
        "color:inherit"
    );

}


initialize();