(() => {
    "use strict";

    let deferredInstallPrompt = null;
    let installButton = null;

    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;
    }

    function syncInstallButton() {
        installButton = document.getElementById("installJaimie");
        if (!installButton) return;

        const canInstall = Boolean(deferredInstallPrompt) && !isStandalone();
        installButton.hidden = !canInstall;
        installButton.setAttribute("aria-hidden", String(!canInstall));

        if (installButton.dataset.installBound === "true") return;
        installButton.dataset.installBound = "true";
        installButton.addEventListener("click", async () => {
            if (!deferredInstallPrompt) return;
            const promptEvent = deferredInstallPrompt;
            deferredInstallPrompt = null;
            syncInstallButton();
            await promptEvent.prompt();
            await promptEvent.userChoice;
        });
    }

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        syncInstallButton();
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        syncInstallButton();
    });

    window.addEventListener("jaimie:sidebar-ready", syncInstallButton);
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncInstallButton);

    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js", { scope: "./" })
            .catch(error => console.error("JAIMIE service worker registration failed:", error));
    });
})();
