import {
    signInAnonymous,
    signInWithGoogle,
    linkGoogle,
    observe
} from "./auth.js";


observe(user => {

    if (!user) {

        console.log(
            "JAIMIE Firebase: signed out"
        );

        return;

    }


    console.log(
        "JAIMIE Firebase:",
        {
            uid: user.uid,
            anonymous: user.isAnonymous,
            email: user.email,
            providerData: user.providerData
        }
    );

});


window.JAIMIEAuthTest = {

    anonymous: signInAnonymous,

    google: signInWithGoogle,

    linkGoogle

};