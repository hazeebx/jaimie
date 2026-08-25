import {
    firestore
} from "./app.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


function userDataRef(
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


async function pullDataset(
    uid,
    key
) {

    const ref =
        userDataRef(
            uid,
            key
        );


    const snapshot =
        await getDoc(
            ref
        );


    if (
        !snapshot.exists()
    ) {

        return null;

    }


    return snapshot.data();

}


async function pushDataset(
    uid,
    key,
    record
) {

    const ref =
        userDataRef(
            uid,
            key
        );


    await setDoc(
        ref,
        record
    );


    return true;

}


export {
    pullDataset,
    pushDataset
};