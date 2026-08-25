/* =========================================================
   JAIMIE — FIREBASE SYNC
   =========================================================

   LOCAL-FIRST RECONCILIATION

   Local IndexedDB
        ↕
   JAIMIEData
        ↕
   Firebase / Firestore

   Initial rules:

   1. Firebase empty + local data exists
      → local data seeds Firebase.

   2. Local empty + Firebase data exists
      → Firebase populates local storage.

   3. Both exist
      → newer record wins.

   4. Equal records
      → simply mark local record synced.

   IMPORTANT:
   Firebase is the shared cloud state,
   but reconciliation is performed per dataset.
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
    getDoc,
    getDocs,
    onSnapshot,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let unsubscribeSnapshot = null;
let initialized = false;
let syncing = false;
let lastSyncAt = null;


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
            null

    };

}


/* =========================================================
   VERSION COMPARISON
   =========================================================

   Returns:

       > 0 → local is newer
       < 0 → remote is newer
         0 → equivalent
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
     * Timestamp is the primary ordering signal.
     */
    if (
        localTime !==
        remoteTime
    ) {

        return (
            localTime >
            remoteTime
        )
            ? 1
            : -1;

    }


    /*
     * Version is the secondary signal.
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

        return (
            localVersion >
            remoteVersion
        )
            ? 1
            : -1;

    }


    /*
     * Deterministic tie-breaker.
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


    return (
        localDevice >
        remoteDevice
    )
        ? 1
        : -1;

}


/* =========================================================
   PUSH ONE RECORD
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


    /*
     * Only clear dirty state after
     * Firestore accepts the write.
     */
    await JAIMIEData.markSynced(
        record.key
    );


    return {

        pushed: true,

        key:
            record.key

    };

}


/* =========================================================
   GET ALL REMOTE DATA
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

        const data =
            documentSnapshot.data();


        result[
            documentSnapshot.id
        ] =
            normalizeRemoteRecord(
                documentSnapshot.id,
                data
            );

    }


    return result;

}


/* =========================================================
   GET ALL LOCAL DATA
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
   RECONCILE ONE RECORD
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
                remote
            );


        return {

            action:
                result.applied
                    ? "pulled"
                    : "unchanged",

            conflict:
                !!result.conflict

        };

    }


    /*
     * Only local exists.
     */
    if (
        local &&
        !remote
    ) {

        const result =
            await pushRecord(
                local
            );


        return {

            action:
                result.pushed
                    ? "pushed"
                    : "skipped",

            conflict:
                false

        };

    }


    /*
     * Neither exists.
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
     * LOCAL WINS
     */
    if (
        comparison > 0
    ) {

        const result =
            await pushRecord(
                local
            );


        return {

            action:
                result.pushed
                    ? "pushed"
                    : "skipped",

            conflict:
                false

        };

    }


    /*
     * REMOTE WINS
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
     * EXACTLY EQUAL
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
   INITIAL RECONCILIATION
   ========================================================= */

async function reconcileAll() {

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


    const remoteEmpty =
        remoteKeys.length === 0;


    const localEmpty =
        localKeys.length === 0;


    let pushed = 0;
    let pulled = 0;
    let unchanged = 0;
    let conflicts = 0;


    /*
     * =====================================================
     * BOOTSTRAP CASE 1
     *
     * Firebase empty
     * Local has data
     *
     * Local becomes the seed.
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
     * BOOTSTRAP CASE 2
     *
     * Local empty
     * Firebase has data
     *
     * Cloud populates the device.
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
                        remote[key]
                    );


                if (
                    result.applied
                ) {

                    pulled += 1;

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
     * BOTH SIDES EMPTY
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

        const result =
            await reconcileAll();


        lastSyncAt =
            new Date()
                .toISOString();


        return {

            enabled: true,

            authenticated: true,

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
   LOCAL CHANGE
   =========================================================

   Whenever JAIMIEData.save() happens, compare the
   changed local record against the current cloud version
   before deciding which one wins.
   ========================================================= */

async function onLocalChange(
    record
) {

    if (
        !currentUser
    ) {

        return;

    }


    try {

        const remoteRef =
            userDataDocument(
                currentUser.uid,
                record.key
            );


        const snapshot =
            await getDoc(
                remoteRef
            );


        const remote =
            snapshot.exists()
                ? normalizeRemoteRecord(
                    record.key,
                    snapshot.data()
                )
                : null;


        const local =
            normalizeLocalRecord(
                record.key,
                record
            );


        const result =
            await reconcileRecord(
                local,
                remote
            );


        if (
            result.action ===
            "pushed"
        ) {

            console.log(
                `JAIMIE Sync: "${record.key}" uploaded.`
            );

        }

        else if (
            result.action ===
            "pulled"
        ) {

            console.log(
                `JAIMIE Sync: "${record.key}" resolved from cloud.`
            );

        }

    }

    catch (error) {

        console.warn(
            `JAIMIE Sync: "${record.key}" remains locally pending.`,
            error
        );

    }

}


/* =========================================================
   REALTIME LISTENER
   ========================================================= */

function startRealtimeListener() {

    if (
        !currentUser
    ) {

        return;

    }


    const collectionRef =
        userDataCollection(
            currentUser.uid
        );


    unsubscribeSnapshot =
        onSnapshot(
            collectionRef,

            async snapshot => {

                for (
                    const change
                    of snapshot.docChanges()
                ) {

                    if (
                        change.type !==
                            "added" &&
                        change.type !==
                            "modified"
                    ) {

                        continue;

                    }


                    /*
                     * Ignore Firestore's local optimistic
                     * snapshot before the server confirms it.
                     */
                    if (
                        change.doc.metadata
                            .hasPendingWrites
                    ) {

                        continue;

                    }


                    const remote =
                        normalizeRemoteRecord(
                            change.doc.id,
                            change.doc.data()
                        );


                    try {

                        const localData =
                            await JAIMIEData.getAll();


                        const local =
                            localData[
                                remote.key
                            ]
                                ? normalizeLocalRecord(
                                    remote.key,
                                    localData[
                                        remote.key
                                    ]
                                )
                                : null;


                        const result =
                            await reconcileRecord(
                                local,
                                remote
                            );


                        if (
                            result.action ===
                            "pulled"
                        ) {

                            console.log(
                                `JAIMIE Sync: "${remote.key}" updated from cloud.`
                            );

                        }

                    }

                    catch (error) {

                        console.error(
                            `JAIMIE Sync: realtime reconciliation failed for "${remote.key}".`,
                            error
                        );

                    }

                }

            },

            error => {

                console.error(
                    "JAIMIE Sync realtime listener failed:",
                    error
                );

            }
        );

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


    return {

        enabled: true,

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

        pending:
            (
                Object.values(
                    local
                )
            ).filter(
                entry =>
                    entry.dirty
            ).length,

        lastSyncAt

    };

}


/* =========================================================
   AUTH STATE
   ========================================================= */

observe(
    async user => {

        /*
         * No authenticated user.
         *
         * JAIMIE automatically gets an anonymous
         * Firebase identity so local-first sync
         * can still function.
         */
        if (!user) {

            currentUser =
                null;


            if (
                unsubscribeSnapshot
            ) {

                unsubscribeSnapshot();

                unsubscribeSnapshot =
                    null;

            }


            try {

                await signInAnonymous();

            }

            catch (error) {

                console.warn(
                    "JAIMIE Sync: anonymous authentication failed.",
                    error
                );

            }


            return;

        }


        /*
         * New authenticated state.
         */
        const changedUser =
            !currentUser ||
            currentUser.uid !==
                user.uid;


        currentUser =
            user;


        if (
            unsubscribeSnapshot
        ) {

            unsubscribeSnapshot();

            unsubscribeSnapshot =
                null;

        }


        /*
         * Reconcile when:
         *
         * - Firebase account first appears
         * - Google account changes
         * - user signs into another account
         */
        if (
            changedUser
        ) {

            try {

                const result =
                    await syncNow();


                console.log(
                    "JAIMIE Sync: initial reconciliation complete.",
                    result
                );

            }

            catch (error) {

                console.error(
                    "JAIMIE Sync: initial reconciliation failed.",
                    error
                );

            }

        }


        /*
         * Listen for future cloud changes.
         */
        startRealtimeListener();

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
        "%cJAIMIE Firebase Sync%c adapter configured",
        "color:#ff8a2a;font-weight:bold",
        "color:inherit"
    );

}


initialize();