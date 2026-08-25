/* =========================================================
   JAIMIE — SETTINGS
   ========================================================= */

let authInitialized = false;

(() => {

    "use strict";


    let root = null;
    let loading = null;


    /* =====================================================
       PATH
    ===================================================== */

    const script =
        document.currentScript;


    if (!script) {

        console.error(
            "JAIMIE Settings: unable to resolve script path."
        );

        return;

    }


    const settingsRoot =
        new URL(
            "./",
            script.src
        );


    /* =====================================================
       LOAD COMPONENT
    ===================================================== */

    async function loadComponent() {

        /*
         * Already loaded.
         */
        if (root) {

            return;

        }


        /*
         * Already loading.
         */
        if (loading) {

            await loading;

            return;

        }


        loading =
            (async () => {

                /*
                 * Load Settings CSS.
                 */
                await loadStyles();


                /*
                 * Fetch component HTML.
                 */
                const response =
                    await fetch(
                        new URL(
                            "component.html",
                            settingsRoot
                        ).href
                    );


                if (!response.ok) {

                    throw new Error(
                        `Could not load settings component: ${response.status}`
                    );

                }


                const html =
                    await response.text();


                /*
                 * Inject directly into BODY.
                 *
                 * NOT into the current page's
                 * content container.
                 */
                const wrapper =
                    document.createElement(
                        "div"
                    );


                wrapper.innerHTML =
                    html;


                while (
                    wrapper.firstElementChild
                ) {

                    document.body.appendChild(
                        wrapper.firstElementChild
                    );

                }


                root =
                    document.getElementById(
                        "jaimieSettingsModal"
                    );


                if (!root) {

                    throw new Error(
                        "Settings overlay was not found."
                    );

                }


                bind();

            })();


        try {

            await loading;

        }

        finally {

            loading = null;

        }

    }


    /* =====================================================
       LOAD CSS
    ===================================================== */

    function loadStyles() {

        const href =
            new URL(
                "styles.css",
                settingsRoot
            ).href;


        /*
         * Don't load it twice.
         */
        if (
            document.querySelector(
                `link[data-jaimie-settings-style]`
            )
        ) {

            return Promise.resolve();

        }


        return new Promise(
            (resolve, reject) => {

                const link =
                    document.createElement(
                        "link"
                    );


                link.rel =
                    "stylesheet";


                link.href =
                    href;


                link.dataset
                    .jaimieSettingsStyle =
                    "true";


                link.onload =
                    () => resolve();


                link.onerror =
                    () =>
                        reject(
                            new Error(
                                "Could not load settings/styles.css"
                            )
                        );


                document.head.appendChild(
                    link
                );

            }
        );

    }


    /* =====================================================
       OPEN
    ===================================================== */

    async function open() {

        await loadComponent();


        root.classList.remove(
            "hidden"
        );


        document.body.classList.add(
            "settings-open"
        );


        await refreshDataPanel();
        await refreshStoragePanel();

    }


    /* =====================================================
       CLOSE
    ===================================================== */

    function close() {

        if (!root) {

            return;

        }


        root.classList.add(
            "hidden"
        );


        document.body.classList.remove(
            "settings-open"
        );

    }


    /* =====================================================
       TABS
    ===================================================== */

    function switchTab(
        tabName
    ) {

        root
            .querySelectorAll(
                "[data-settings-tab]"
            )
            .forEach(
                button => {

                    button.classList.toggle(
                        "active",
                        button.dataset
                            .settingsTab ===
                        tabName
                    );

                }
            );


        root
            .querySelectorAll(
                "[data-settings-panel]"
            )
            .forEach(
                panel => {

                    panel.classList.toggle(
                        "active",
                        panel.dataset
                            .settingsPanel ===
                        tabName
                    );

                }
            );


        if (
            tabName ===
            "data"
        ) {

            refreshDataPanel();

        }


        if (
            tabName ===
            "security"
        ) {

            initAuthUI();

        }


        if (
            tabName ===
            "storage"
        ) {

            refreshStoragePanel();

        }

    }


    /* =====================================================
       DATA PANEL
    ===================================================== */

    async function refreshDataPanel() {

        if (
            !window.JAIMIEData ||
            !root
        ) {

            return;

        }


        try {

            const all =
                await JAIMIEData.getAll();


            const keys =
                Object.keys(
                    all
                );


            const count =
                root.querySelector(
                    "#settingsDatasetCount"
                );


            const list =
                root.querySelector(
                    "#settingsDatasetList"
                );


            if (count) {

                count.textContent =
                    keys.length;

            }


            if (!list) {

                return;

            }


            if (!keys.length) {

                list.innerHTML = `
                    <div class="dataset-loading">
                        NO DATASETS FOUND
                    </div>
                `;

                return;

            }


            list.innerHTML =
                keys
                    .sort()
                    .map(
                        key => `

                            <div class="dataset-row">

                                <span
                                    class="dataset-dot"
                                ></span>

                                <span
                                    class="dataset-name"
                                >
                                    ${escapeHtml(key)}
                                </span>

                            </div>

                        `
                    )
                    .join("");

        }

        catch (error) {

            console.error(
                "Could not inspect JAIMIE data:",
                error
            );

        }

    }


    /* =====================================================
       EXPORT
    ===================================================== */

    async function exportData() {

        setMessage(
            "Preparing JAIMIE backup..."
        );


        try {

            const backup =
                await JAIMIEData.exportAll();


            const date =
                new Date()
                    .toISOString()
                    .slice(
                        0,
                        10
                    );


            JAIMIEData.downloadBackup(
                backup,
                `JAIMIE-backup-${date}.json`
            );


            setMessage(
                "Backup exported successfully."
            );

        }

        catch (error) {

            console.error(
                "JAIMIE export failed:",
                error
            );


            setMessage(
                "Export failed."
            );

        }

    }


    /* =====================================================
       STORAGE PANEL
    ===================================================== */

    async function refreshStoragePanel() {

        if (
            !root ||
            !window.JAIMIEData
        ) {

            return;

        }


        const syncStatus =
            root.querySelector(
                "#storageSyncStatus"
            );


        const accountStatus =
            root.querySelector(
                "#storageAccountStatus"
            );


        const pending =
            root.querySelector(
                "#storagePending"
            );


        const lastSync =
            root.querySelector(
                "#storageLastSync"
            );


        try {

            if (
                typeof JAIMIEData.sync?.status !==
                    "function"
            ) {

                if (syncStatus) {

                    syncStatus.textContent =
                        "LOCAL ONLY";

                }


                if (accountStatus) {

                    accountStatus.textContent =
                        "UNKNOWN";

                }


                if (pending) {

                    pending.textContent =
                        "—";

                }


                if (lastSync) {

                    lastSync.textContent =
                        "—";

                }


                return;

            }


            const status =
                await JAIMIEData.sync.status();


            if (
                syncStatus
            ) {

                syncStatus.textContent =
                    status.connected &&
                    status.enabled
                        ? "FIREBASE CONNECTED"
                        : "LOCAL ONLY";

            }


            if (
                accountStatus
            ) {

                accountStatus.textContent =
                    status.authenticated
                        ? "AUTHENTICATED"
                        : "NOT SIGNED IN";

            }


            if (
                pending
            ) {

                pending.textContent =
                    Number(
                        status.pending || 0
                    );

            }


            if (
                lastSync
            ) {

                lastSync.textContent =
                    status.lastSyncAt
                        ? new Date(
                            status.lastSyncAt
                        ).toLocaleString()
                        : "NEVER";

            }

        }

        catch (error) {

            console.error(
                "Could not inspect storage status:",
                error
            );


            if (syncStatus) {

                syncStatus.textContent =
                    "UNAVAILABLE";

            }


            if (accountStatus) {

                accountStatus.textContent =
                    "UNKNOWN";

            }


            if (pending) {

                pending.textContent =
                    "—";

            }


            if (lastSync) {

                lastSync.textContent =
                    "—";

            }

        }

    }


    /* =====================================================
       IMPORT
    ===================================================== */

    async function importData(
        file
    ) {

        if (!file) {

            return;

        }


        try {

            const text =
                await file.text();


            const backup =
                JSON.parse(
                    text
                );


            if (
                backup.format !==
                "JAIMIE_BACKUP"
            ) {

                throw new Error(
                    "Invalid JAIMIE backup format."
                );

            }


            const count =
                Object.keys(
                    backup.data || {}
                ).length;


            const confirmed =
                confirm(
                    `Import ${count} JAIMIE dataset${
                        count === 1
                            ? ""
                            : "s"
                    }?\n\nExisting matching datasets will be restored.`
                );


            if (!confirmed) {

                return;

            }


            await JAIMIEData.importBackup(
                backup,
                {
                    replace: false
                }
            );


            setMessage(
                "Backup imported. Reloading..."
            );


            setTimeout(
                () =>
                    window.location.reload(),
                700
            );

        }

        catch (error) {

            console.error(
                "JAIMIE import failed:",
                error
            );


            alert(
                `Could not import backup.\n\n${error.message}`
            );

        }

    }


    /* =====================================================
       MESSAGE
    ===================================================== */

    function setMessage(
        message
    ) {

        if (!root) {

            return;

        }


        const element =
            root.querySelector(
                "#settingsDataMessage"
            );


        if (element) {

            element.textContent =
                message;

        }

    }


    /* =====================================================
       ESCAPE
    ===================================================== */

    function escapeHtml(
        value
    ) {

        return String(
            value
        ).replace(
            /[&<>"']/g,
            char =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;"
                })[char]
        );

    }


    /* =====================================================
       BIND
    ===================================================== */

    function bind() {

        if (!root) {

            return;

        }


        /*
         * Close
         */
        root
            .querySelector(
                "#settingsClose"
            )
            .onclick =
            close;


        /*
         * Backdrop click
         */
        root.onclick =
            event => {

                if (
                    event.target ===
                    root
                ) {

                    close();

                }

            };


        /*
         * Tabs
         */
        root
            .querySelectorAll(
                "[data-settings-tab]"
            )
            .forEach(
                button => {

                    button.onclick =
                        () =>
                            switchTab(
                                button.dataset
                                    .settingsTab
                            );

                }
            );


        /*
         * Export
         */
        const exportButton =
            root.querySelector(
                "#exportDataBtn"
            );


        if (exportButton) {

            exportButton.onclick =
                exportData;

        }


        /*
         * Import
         */
        const input =
            root.querySelector(
                "#settingsImportFile"
            );


        const importButton =
            root.querySelector(
                "#importDataBtn"
            );


        if (
            importButton &&
            input
        ) {

            importButton.onclick =
                () =>
                    input.click();


            input.onchange =
                async event => {

                    const file =
                        event.target
                            .files?.[0];


                    if (file) {

                        await importData(
                            file
                        );

                    }


                    input.value =
                        "";

                };

        }


        /*
         * Manual Sync
         */
        const manualSyncButton =
            root.querySelector(
                "#manualSyncBtn"
            );


        if (
            manualSyncButton
        ) {

            manualSyncButton.onclick =
                async () => {

                    const message =
                        root.querySelector(
                            "#manualSyncMessage"
                        );


                    manualSyncButton.disabled =
                        true;


                    if (message) {

                        message.textContent =
                            "Synchronizing...";

                    }


                    try {

                        const result =
                            await JAIMIEData.sync.now();


                        if (message) {

                            message.textContent =
                                `Sync complete · ${
                                    result.pushed || 0
                                } uploaded · ${
                                    result.pulled || 0
                                } restored`;

                        }


                        await refreshStoragePanel();

                    }

                    catch (error) {

                        console.error(
                            "Manual JAIMIE sync failed:",
                            error
                        );


                        if (message) {

                            message.textContent =
                                "Sync failed.";

                        }

                    }

                    finally {

                        manualSyncButton.disabled =
                            false;

                    }

                };

        }

    }


    /* =====================================================
       KEYBOARD
    ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape" &&
                root &&
                !root.classList.contains(
                    "hidden"
                )
            ) {

                close();

            }

        }
    );


    /* =====================================================
       AUTH
    ===================================================== */

    let authModule = null;


    async function getAuthModule() {

        if (authModule) {

            return authModule;

        }


        authModule =
            await import(
                "../firebase/auth.js"
            );


        return authModule;

    }


    async function initAuthUI() {

        if (!root) {

            return;

        }


        if (authInitialized) {

            return;

        }


        authInitialized = true;


        const status =
            root.querySelector(
                "#authStatus"
            );


        const dot =
            root.querySelector(
                "#authStatusDot"
            );


        const anonymousPanel =
            root.querySelector(
                "#authAnonymous"
            );


        const googlePanel =
            root.querySelector(
                "#authGoogle"
            );


        const email =
            root.querySelector(
                "#authEmail"
            );


        const uid =
            root.querySelector(
                "#authUid"
            );


        const errorBox =
            root.querySelector(
                "#authError"
            );


        const {
            signInAnonymous,
            signInWithGoogle,
            linkGoogle,
            logout,
            observe
        } = await getAuthModule();


        function clearError() {

            if (errorBox) {

                errorBox.textContent =
                    "";

            }

        }


        function showError(
            error
        ) {

            console.error(
                "JAIMIE Auth:",
                error
            );


            if (errorBox) {

                errorBox.textContent =
                    error?.message ||
                    "Authentication failed.";

            }

        }


        function renderUser(
            user
        ) {

            clearError();


            if (anonymousPanel) {

                anonymousPanel
                    .classList
                    .add(
                        "hidden"
                    );

            }


            if (googlePanel) {

                googlePanel
                    .classList
                    .add(
                        "hidden"
                    );

            }


            if (dot) {

                dot.classList.remove(
                    "online",
                    "warning"
                );

            }


            if (!user) {

                status.textContent =
                    "SIGNED OUT";


                if (dot) {

                    dot.classList.add(
                        "warning"
                    );

                }


                return;

            }


            if (
                user.isAnonymous
            ) {

                status.textContent =
                    "LOCAL SESSION";


                if (dot) {

                    dot.classList.add(
                        "warning"
                    );

                }


                if (anonymousPanel) {

                    anonymousPanel
                        .classList
                        .remove(
                            "hidden"
                        );

                }


                return;

            }


            status.textContent =
                "CLOUD ACCOUNT CONNECTED";


            if (dot) {

                dot.classList.add(
                    "online"
                );

            }


            if (googlePanel) {

                googlePanel
                    .classList
                    .remove(
                        "hidden"
                    );

            }


            if (email) {

                email.textContent =
                    user.email ||
                    "Google account";

            }


            if (uid) {

                uid.textContent =
                    user.uid;

            }

        }


        /* ===============================================
           LINK GOOGLE
        =============================================== */

        const connectGoogleButton =
            root.querySelector(
                "#connectGoogleBtn"
            );


        if (connectGoogleButton) {

            connectGoogleButton.onclick =
                async () => {

                    clearError();


                    try {

                        await linkGoogle();

                    }

                    catch (error) {

                        if (
                            error?.code ===
                            "auth/no-current-user"
                        ) {

                            await signInAnonymous();

                        }

                        else {

                            showError(
                                error
                            );

                        }

                    }

                };

        }


        /* ===============================================
           SIGN IN WITH GOOGLE
        =============================================== */

        const signInGoogleButton =
            root.querySelector(
                "#signInGoogleBtn"
            );


        if (signInGoogleButton) {

            signInGoogleButton.onclick =
                async () => {

                    clearError();


                    try {

                        await signInWithGoogle();

                    }

                    catch (error) {

                        showError(
                            error
                        );

                    }

                };

        }


        /* ===============================================
           SIGN OUT
        =============================================== */

        const signOutButton =
            root.querySelector(
                "#signOutBtn"
            );


        if (signOutButton) {

            signOutButton.onclick =
                async () => {

                    clearError();


                    try {

                        await logout();

                    }

                    catch (error) {

                        showError(
                            error
                        );

                    }

                };

        }


        /* ===============================================
           AUTH STATE
        =============================================== */

        let firstAuthEvent =
            true;


        observe(
            async user => {

                renderUser(
                    user
                );


                /*
                 * Automatically create an anonymous
                 * account only when there is genuinely
                 * no authenticated user.
                 */
                if (
                    !user &&
                    firstAuthEvent
                ) {

                    firstAuthEvent =
                        false;


                    try {

                        await signInAnonymous();

                    }

                    catch (error) {

                        showError(
                            error
                        );

                    }

                }

            }
        );

    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.JAIMIESettings = {

        open,

        close

    };


})();