import {
    auth
} from "./app.js";

import {
    GoogleAuthProvider,
    signInAnonymously,
    signInWithPopup,
    linkWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";


/* =========================================================
   ANONYMOUS SIGN-IN
   ========================================================= */

async function signInAnonymous() {

    const credential =
        await signInAnonymously(
            auth
        );

    return credential.user;

}


/* =========================================================
   GOOGLE SIGN-IN
   ========================================================= */

async function signInWithGoogle() {

    const provider =
        new GoogleAuthProvider();

    const credential =
        await signInWithPopup(
            auth,
            provider
        );

    return credential.user;

}


/* =========================================================
   LINK GOOGLE TO CURRENT ACCOUNT
   ========================================================= */

async function linkGoogle() {

    const user =
        auth.currentUser;


    if (!user) {

        throw new Error(
            "No Firebase user is currently signed in."
        );

    }


    const provider =
        new GoogleAuthProvider();


    const credential =
        await linkWithPopup(
            user,
            provider
        );


    return credential.user;

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    await signOut(
        auth
    );

}


/* =========================================================
   AUTH STATE
   ========================================================= */

function observe(
    callback
) {

    return onAuthStateChanged(
        auth,
        callback
    );

}


/* =========================================================
   CURRENT USER
   ========================================================= */

function currentUser() {

    return auth.currentUser;

}


/* =========================================================
   PUBLIC API
   ========================================================= */

export {

    signInAnonymous,

    signInWithGoogle,

    linkGoogle,

    logout,

    observe,

    currentUser

};