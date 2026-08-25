/* =========================================================
   JAIMIE — FIREBASE SYNC
   =========================================================
   Connects JAIMIEData's local-first sync layer to Firestore.

   Firestore structure:

   users/
       {uid}/
           data/
               braindump
               calendar
               day
               diet
               event-countdown
               inventory
               packing
               sleep
               workout

   Local IndexedDB remains the primary local cache.
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
    onSnapshot,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


let currentUser = null;
let unsubscribeSnapshot = null;
let initialized = false;
let syncing = false;

let authReadyResolve;

const authReady =
    new Promise(
        resolve => {
            authReadyResolve = resolve;
        }
    );


observe(
    async user => {

        /*
         * No user:
         * automatically create anonymous identity.
         */
        if (!user) {

            currentUser = null;

            if (unsubscribeSnapshot) {

                unsubscribeSnapshot();
                unsubscribeSnapshot = null;

            }

            try {

                await signInAnonymous();

            }

            catch (error) {

                console.warn(
                    "JAIMIE Sync: anonymous authentication failed.",
                    error
                );

                authReadyResolve(null);

            }

            return;

        }


        /*
         * Authenticated user now available.
         */
        currentUser = user;

        authReadyResolve(user);


        if (unsubscribeSnapshot) {

            unsubscribeSnapshot();
            unsubscribeSnapshot = null;

        }


        startRealtimeListener();


        /*
         * Initial pull/push.
         */
        try {

            const result =
                await JAIMIEData.sync.now();

            console.log(
                "JAIMIE Sync: auth sync complete.",
                result
            );

        }

        catch (error) {

            console.error(
                "JAIMIE Sync: auth sync failed.",
                error
            );

        }

    }
);


/* =========================================================
   PUSH ONE LOCAL RECORD
   ========================================================= */

async function pushRecord(
    record
) {

    if (!currentUser) {

        return {
            pushed: false,
            reason: "not-authenticated"
        };

    }


    if (!record) {

        return {
            pushed: false,
            reason: "no-record"
        };

    }


    const remoteRef =
        userDataDocument(
            currentUser.uid,
            record.key
        );


    /*
     * Store the exact local record metadata.
     *
     * Firestore receives a plain object.
     */
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
     * Only mark the local record synced
     * AFTER Firestore confirms the write.
     */
    await JAIMIEData.markSynced(
        record.key
    );


    return {
        pushed: true,
        key: record.key
    };

}


/* =========================================================
   PUSH ALL LOCAL CHANGES
   ========================================================= */

async function pushChanges(
    getChanges
) {

    if (!currentUser) {

        return {
            pushed: 0,
            conflicts: 0,
            skipped: 0
        };

    }


    const changes =
        await getChanges();


    let pushed = 0;
    let skipped = 0;


    for (
        const record
        of changes
    ) {

        try {

            const result =
                await pushRecord(
                    record
                );


            if (
                result.pushed
            ) {

                pushed += 1;

            }

            else {

                skipped += 1;

            }

        }

        catch (error) {

            console.error(
                `JAIMIE Sync: failed to push "${record.key}"`,
                error
            );

        }

    }


    return {
        pushed,
        conflicts: 0,
        skipped
    };

}


/* =========================================================
   PULL ALL REMOTE DATA
   ========================================================= */

async function pullRemote(
    applyRemote
) {

    if (!currentUser) {

        return {
            pulled: 0,
            conflicts: 0
        };

    }


    const snapshot =
        await getDocs(
            userDataCollection(
                currentUser.uid
            )
        );


    let pulled = 0;
    let conflicts = 0;


    for (
        const documentSnapshot
        of snapshot.docs
    ) {

        const remote =
            documentSnapshot.data();


        const result =
            await applyRemote(
                remote
            );


        if (
            result.applied
        ) {

            pulled += 1;

        }


        if (
            result.conflict
        ) {

            conflicts += 1;

            console.warn(
                `JAIMIE Sync: conflict on "${remote.key}".`,
                result
            );

        }

    }


    return {
        pulled,
        conflicts
    };

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

                /*
                 * Ignore local writes that haven't
                 * reached Firestore yet.
                 */
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
                     * Firebase marks local pending
                     * writes in metadata.
                     *
                     * getDocSnapshots from this listener
                     * may contain local optimistic state.
                     */
                    if (
                        change.doc.metadata
                            .hasPendingWrites
                    ) {

                        continue;

                    }


                    const remote =
                        change.doc.data();


                    try {

                        const result =
                            await JAIMIEData.applyRemote(
                                remote
                            );


                        if (
                            result.conflict
                        ) {

                            console.warn(
                                `JAIMIE Sync: local conflict on "${remote.key}".`,
                                result
                            );

                        }

                    }

                    catch (error) {

                        console.error(
                            "JAIMIE Sync: failed to apply remote data.",
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
   SYNC NOW
   ========================================================= */

async function syncNow({
    getChanges,
    applyRemote
}) {

    if (syncing) {

        return {
            skipped: true
        };

    }


    syncing = true;


    try {

        /*
         * Wait for Firebase Auth initialization.
         */
        const user =
            await authReady;


        if (!user) {

            console.warn(
                "JAIMIE Sync: no Firebase user."
            );

            return {
                enabled: true,
                authenticated: false,
                pushed: 0,
                pulled: 0,
                conflicts: 0
            };

        }


        /*
         * First pull remote state.
         */
        const pulled =
            await pullRemote(
                applyRemote
            );


        /*
         * Then push local changes.
         */
        const pushed =
            await pushChanges(
                getChanges
            );


        return {

            enabled: true,

            authenticated: true,

            uid:
                user.uid,

            pushed:
                pushed.pushed,

            pulled:
                pulled.pulled,

            conflicts:
                pulled.conflicts

        };

    }

    finally {

        syncing =
            false;

    }

}


/* =========================================================
   LOCAL CHANGE HOOK
   ========================================================= */

async function onLocalChange(
    record
) {

    /*
     * Don't do anything until Auth
     * has a user.
     */
    if (
        !currentUser
    ) {

        return;

    }


    try {

        await pushRecord(
            record
        );


        console.log(
            `JAIMIE Sync: "${record.key}" synced.`
        );

    }

    catch (error) {

        /*
         * IMPORTANT:
         * Do NOT clear dirty state if Firebase
         * rejected/offline-failed.
         *
         * The record stays dirty and can be
         * retried later.
         */
        console.warn(
            `JAIMIE Sync: "${record.key}" remains pending.`,
            error
        );

    }

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function connected() {

    return !!currentUser;

}


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
            syncNow

    });


    console.log(
        "%cJAIMIE Firebase Sync%c adapter configured",
        "color:#ff8a2a;font-weight:bold",
        "color:inherit"
    );

}


/* =========================================================
   START
   ========================================================= */

initialize();


/* =========================================================
   INITIAL INITIAL SYNC
   ========================================================= */

authReady.then(
    async user => {

        if (!user) {

            return;

        }


        /*
         * Give the auth state a moment to settle.
         */
        try {

            const result =
                await JAIMIEData.sync.now();


            console.log(
                "JAIMIE Sync: initial sync complete.",
                result
            );

        }

        catch (error) {

            console.error(
                "JAIMIE Sync: initial sync failed.",
                error
            );

        }

    }
);