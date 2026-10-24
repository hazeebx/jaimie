/* =========================================================
   JAIMIE — COLLAPSIBLE SIDE BAR
   ========================================================= */

(() => {

    const container =
        document.getElementById("side-menu");

    if (!container) return;

    const script =
        document.currentScript;

    if (!script) return;

    const jaimieRoot =
        new URL("../", script.src);

    const embeddedMode =
        window.self !== window.top &&
        new URLSearchParams(window.location.search).get("jaimie-embedded") === "1";

    /*
     * Feature pages remain valid standalone documents, but the application shell
     * owns the one shared sidebar. Removing the placeholder from an embedded page
     * also prevents the sidebar's layout padding from being applied inside it.
     */
    if (embeddedMode) {
        container.remove();
        document.documentElement.classList.add("jaimie-embedded");
        return;
    }

    const currentUrl = new URL(window.location.href);
    const shellUrl = new URL("app.html", jaimieRoot);
    const isApplicationShell =
        currentUrl.origin === shellUrl.origin &&
        currentUrl.pathname === shellUrl.pathname;

    /* Route top-level feature-page visits through the shared application shell. */
    if (window.self === window.top && !isApplicationShell) {
        let route = currentUrl.pathname.startsWith(jaimieRoot.pathname)
            ? currentUrl.pathname.slice(jaimieRoot.pathname.length)
            : "";

        route = route.replace(/^\/+/, "");
        if (!route || route.endsWith("/")) route += "index.html";

        shellUrl.hash = `/${encodeURI(route)}`;
        window.location.replace(shellUrl.href);
        return;
    }

    let dataRefreshNotice = null;

    function showDataRefreshNotice(detail) {
        if (!detail || !["remote", "other-tab"].includes(detail.source)) return;

        if (!dataRefreshNotice) {
            dataRefreshNotice = document.createElement("aside");
            dataRefreshNotice.className = "jaimie-data-refresh";
            dataRefreshNotice.setAttribute("role", "status");

            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = "New JAIMIE data received";
            const message = document.createElement("span");
            message.textContent = "Refresh this page to display the latest cloud changes.";
            copy.append(title, message);

            const reload = document.createElement("button");
            reload.type = "button";
            reload.textContent = "Refresh";
            reload.addEventListener("click", () => window.location.reload());

            const dismiss = document.createElement("button");
            dismiss.type = "button";
            dismiss.className = "jaimie-data-refresh__dismiss";
            dismiss.setAttribute("aria-label", "Dismiss cloud update notice");
            dismiss.textContent = "×";
            dismiss.addEventListener("click", () => dataRefreshNotice.classList.remove("visible"));

            dataRefreshNotice.append(copy, reload, dismiss);
            document.body.appendChild(dataRefreshNotice);
        }

        dataRefreshNotice.classList.add("visible");
    }

    window.addEventListener("jaimie-data-changed", event => showDataRefreshNotice(event.detail));


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

    // Keep Day reminders running while any JAIMIE page is open.
    const notificationsScript = document.createElement("script");
    notificationsScript.src = new URL("day_page/schedule-notifications.js?v=3", jaimieRoot).href;
    notificationsScript.onerror = () => {
        const status = document.getElementById("scheduleNotificationStatus");
        if (status) status.textContent = "Notifications could not load. Reload to retry.";
    };
    document.head.appendChild(notificationsScript);


    /* =====================================================
       LOAD SIDE BAR COMPONENT
       ===================================================== */

    const componentPath =
        new URL(
            "component.html?v=mobile-shell-2",
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

            window.dispatchEvent(new CustomEvent("jaimie:sidebar-ready", {
                detail: { root: jaimieRoot.href }
            }));

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

        const mobileToggle =
            document.getElementById(
                "mobileMenuToggle"
            );

        const backdrop =
            document.getElementById(
                "sideMenuBackdrop"
            );


        if (!menu || !toggle) return;

        const mobileViewport =
            window.matchMedia("(max-width: 700px)");


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

            toggle.setAttribute(
                "aria-label",
                collapsed ? "Expand navigation" : "Collapse navigation"
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

        function setMobileOpen(open) {

            const shouldOpen =
                mobileViewport.matches && open;

            menu.classList.toggle(
                "is-mobile-open",
                shouldOpen
            );

            document.body.classList.toggle(
                "jaimie-mobile-menu-open",
                shouldOpen
            );

            if (mobileToggle) {
                mobileToggle.setAttribute(
                    "aria-expanded",
                    String(shouldOpen)
                );
            }

            toggle.setAttribute(
                "aria-expanded",
                String(shouldOpen)
            );

            toggle.setAttribute(
                "aria-label",
                shouldOpen ? "Close navigation" : "Open navigation"
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

                if (mobileViewport.matches) {

                    setMobileOpen(
                        !menu.classList.contains("is-mobile-open")
                    );

                    return;

                }

                const isCollapsed =
                    menu.classList.contains(
                        "is-collapsed"
                    );


                setCollapsed(
                    !isCollapsed
                );

            }
        );

        if (mobileToggle) {
            mobileToggle.addEventListener(
                "click",
                () => setMobileOpen(true)
            );
        }

        if (backdrop) {
            backdrop.addEventListener(
                "click",
                () => setMobileOpen(false)
            );
        }

        menu.querySelectorAll("a.side-menu__item").forEach(link => {
            link.addEventListener("click", () => setMobileOpen(false));
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") setMobileOpen(false);
        });

        const handleViewportChange = () => {
            setMobileOpen(false);

            if (!mobileViewport.matches) {
                const collapsed = menu.classList.contains("is-collapsed");
                toggle.setAttribute("aria-expanded", String(!collapsed));
                toggle.setAttribute(
                    "aria-label",
                    collapsed ? "Expand navigation" : "Collapse navigation"
                );
            }
        };

        if (typeof mobileViewport.addEventListener === "function") {
            mobileViewport.addEventListener("change", handleViewportChange);
        } else {
            mobileViewport.addListener(handleViewportChange);
        }

        handleViewportChange();
/* =================================================
   SETTINGS OVERLAY
   ================================================= */

const settingsButton =
    document.getElementById("openSettings");

if (settingsButton) {

    settingsButton.addEventListener(
        "click",
        async () => {

            setMobileOpen(false);

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
                    "../settings/app.js?v=3",
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
