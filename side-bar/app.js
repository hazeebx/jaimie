/* =========================================================
   JAIMIE — COLLAPSIBLE SIDE BAR
   ========================================================= */

(() => {

    const container =
        document.getElementById("side-menu");

    if (!container) return;


    /* =====================================================
       FIND JAIMIE ROOT
       ===================================================== */

    /*
     * app.js lives here:
     *
     * JAIMIE/
     * └── side-bar/
     *     └── app.js
     *
     * Therefore "../" from this script is the JAIMIE root.
     */

    const script =
        document.currentScript;

    if (!script) return;


    const jaimieRoot =
        new URL("../", script.src);


    /* =====================================================
       LOAD SIDE BAR COMPONENT
       ===================================================== */

    const componentPath =
        new URL(
            "component.html",
            script.src
        ).href;


    fetch(componentPath)

        .then(response => {

            if (!response.ok) {

                throw new Error(
                    `Failed to load side bar: ${response.status}`
                );

            }

            return response.text();

        })

        .then(html => {

            container.innerHTML = html;


            /* =================================================
               RESOLVE NAVIGATION LINKS
               ================================================= */

            container
                .querySelectorAll(".side-menu__item")
                .forEach(link => {

                    const href =
                        link.getAttribute("href");

                    /*
                     * Empty hrefs are intentionally left alone.
                     * You can fill those later.
                     */
                    if (!href) return;


                    /*
                     * Convert:
                     *
                     * calendar-task-tracker/index.html
                     *
                     * into:
                     *
                     * /JAIMIE/calendar-task-tracker/index.html
                     *
                     * automatically.
                     */

                    const resolvedUrl =
                        new URL(
                            href,
                            jaimieRoot
                        );


                    link.href =
                        resolvedUrl.href;

                });


            initSideMenu();

        })

        .catch(error => {

            console.error(
                "JAIMIE Side Bar:",
                error
            );

        });


    /* =====================================================
       INITIALIZE SIDE BAR
       ===================================================== */

    function initSideMenu() {

        const menu =
            document.getElementById(
                "jaimieSideMenu"
            );


        const toggle =
            document.getElementById(
                "sideMenuToggle"
            );


        if (!menu || !toggle) return;


        /* =================================================
           COLLAPSE / EXPAND
           ================================================= */

        const STORAGE_KEY =
            "jaimie-side-menu-collapsed";


        function setCollapsed(collapsed) {

            menu.classList.toggle(
                "is-collapsed",
                collapsed
            );


            toggle.setAttribute(
                "aria-expanded",
                String(!collapsed)
            );


            document.body.classList.toggle(
                "jaimie-menu-collapsed",
                collapsed
            );


            document
                .querySelectorAll(
                    ".jaimie-content"
                )
                .forEach(content => {

                    content.classList.toggle(
                        "menu-collapsed",
                        collapsed
                    );

                });


            localStorage.setItem(
                STORAGE_KEY,
                String(collapsed)
            );

        }


        /* =================================================
           RESTORE SAVED STATE
           ================================================= */

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (saved !== null) {

            setCollapsed(
                saved === "true"
            );

        }


        /* =================================================
           TOGGLE
           ================================================= */

        toggle.addEventListener(
            "click",
            () => {

                const isCollapsed =
                    menu.classList.contains(
                        "is-collapsed"
                    );


                setCollapsed(
                    !isCollapsed
                );

            }
        );
/* =================================================
   SETTINGS OVERLAY
   ================================================= */

const settingsButton =
    document.getElementById("openSettings");

if (settingsButton) {

    settingsButton.addEventListener(
        "click",
        async () => {

            try {

                await openSettings();

            } catch (error) {

                console.error(
                    "JAIMIE Settings:",
                    error
                );

            }

        }
    );

}

        /* =================================================
           ACTIVE PAGE
           ================================================= */

        const currentPath =
            normalizePagePath(
                window.location.pathname
            );


        function normalizePagePath(pathname) {

            let normalized =
                pathname.replace(
                    /\/index\.html$/i,
                    ""
                );


            if (
                normalized.length > 1
            ) {

                normalized =
                    normalized.replace(
                        /\/$/,
                        ""
                    );

            }


            return normalized || "/";

        }


        menu
            .querySelectorAll(
                ".side-menu__item"
            )
            .forEach(item => {

                const href =
                    item.getAttribute("href");


                /*
                 * Empty href = page not implemented yet.
                 */
                if (!href) return;


                try {

                    const itemPath =
                        normalizePagePath(
                            new URL(
                                href,
                                window.location.href
                            ).pathname
                        );


                    if (
                        itemPath === currentPath
                    ) {

                        menu
                            .querySelectorAll(
                                ".side-menu__item"
                            )
                            .forEach(link => {

                                link.classList.remove(
                                    "active"
                                );

                            });


                        item.classList.add(
                            "active"
                        );

                    }

                }

                catch {

                    /*
                     * Ignore invalid/incomplete
                     * navigation paths.
                     */

                }

            });

    }
    /* =========================================================
   SETTINGS LOADER
   ========================================================= */

let settingsLoading = null;

async function openSettings() {

    /*
     * If Settings has already loaded,
     * just open it.
     */
    if (
        window.JAIMIESettings &&
        typeof window.JAIMIESettings.open === "function"
    ) {

        await window.JAIMIESettings.open();

        return;

    }


    /*
     * Only load the Settings JS once.
     */
    if (!settingsLoading) {

        settingsLoading =
            loadSettingsScript();

    }


    await settingsLoading;


    if (
        !window.JAIMIESettings
    ) {

        throw new Error(
            "JAIMIESettings API was not initialized."
        );

    }


    await window.JAIMIESettings.open();

}


function loadSettingsScript() {

    return new Promise(
        (resolve, reject) => {

            /*
             * side-bar/app.js is inside:
             *
             * JAIMIE/
             * └── side-bar/
             *     └── app.js
             *
             * Therefore "../settings/app.js"
             * must be resolved relative to
             * side-bar/app.js itself.
             */

            const settingsScript =
                document.createElement(
                    "script"
                );


            const settingsPath =
                new URL(
                    "../settings/app.js",
                    script.src
                ).href;


            settingsScript.src =
                settingsPath;


            settingsScript.async = true;


            settingsScript.onload =
                () => resolve();


            settingsScript.onerror =
                () =>
                    reject(
                        new Error(
                            `Could not load ${settingsPath}`
                        )
                    );


            document.head.appendChild(
                settingsScript
            );

        }
    );

}

})();
