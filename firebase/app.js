import {
    initializeApp,
    getApps
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import {
    firebaseConfig
} from "./config.js";


const app =
    getApps().length
        ? getApps()[0]
        : initializeApp(
            firebaseConfig
        );


const auth =
    getAuth(app);


const firestore =
    getFirestore(app);


export {
    app,
    auth,
    firestore
};