/* =========================================================
   JAIMIE — PERSISTENT APPLICATION SHELL
   ========================================================= */

(() => {
    "use strict";

    const framesHost = document.getElementById("appShellFrames");
    const loading = document.getElementById("appShellLoading");
    const script = document.currentScript;
    if (!framesHost || !script) return;

    const jaimieRoot = new URL("./", script.src);
    const MUSIC_ROUTE = "music/index.html";
    const HOME_ROUTE = "index.html";
    const frames = new Map();
    let activeRoute = "";

    function normalizeRoute(value) {
        let route = decodeURIComponent(String(value || ""))
            .replace(/^#?\/?/, "")
            .split("?")[0]
            .split("#")[0]
            .replace(/^\/+/, "");

        if (!route || route.endsWith("/")) route += "index.html";

        const resolved = new URL(route, jaimieRoot);
        const isInsideJaimie =
            resolved.origin === jaimieRoot.origin &&
            resolved.pathname.startsWith(jaimieRoot.pathname);
        const relativePath = resolved.pathname.slice(jaimieRoot.pathname.length);
        const isFeatureDocument =
            /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.html$/i.test(relativePath) &&
            relativePath !== "app.html";

        return isInsideJaimie && isFeatureDocument ? relativePath : HOME_ROUTE;
    }

    function routeFromLocation() {
        return normalizeRoute(window.location.hash);
    }

    function routeFromLink(link) {
        const url = new URL(link.href, jaimieRoot);
        if (url.origin !== jaimieRoot.origin || !url.pathname.startsWith(jaimieRoot.pathname)) {
            return "";
        }
        return normalizeRoute(url.pathname.slice(jaimieRoot.pathname.length));
    }

    function embeddedUrl(route) {
        const url = new URL(route, jaimieRoot);
        url.searchParams.set("jaimie-embedded", "1");
        return url.href;
    }

    function ensureFrame(route) {
        if (frames.has(route)) return frames.get(route);

        const frame = document.createElement("iframe");
        frame.className = "app-shell__frame";
        frame.dataset.route = route;
        frame.title = route === MUSIC_ROUTE ? "JAIMIE Music" : "JAIMIE page";
        frame.src = embeddedUrl(route);
        frame.addEventListener("load", () => {
            if (route === activeRoute) loading?.classList.add("is-hidden");
        });

        frames.set(route, frame);
        framesHost.appendChild(frame);
        return frame;
    }

    function discardInactiveFeatureFrames(nextRoute) {
        for (const [route, frame] of frames) {
            if (route === MUSIC_ROUTE || route === nextRoute) continue;
            frame.remove();
            frames.delete(route);
        }
    }

    function setActiveSidebarItem(route) {
        const menu = document.getElementById("jaimieSideMenu");
        if (!menu) return;

        menu.querySelectorAll(".side-menu__item").forEach(link => {
            link.classList.toggle("active", routeFromLink(link) === route);
        });
    }

    function showRoute(value) {
        const route = normalizeRoute(value);
        activeRoute = route;
        loading?.classList.remove("is-hidden");

        // Music is intentionally never discarded: its audio element owns playback.
        const musicFrame = ensureFrame(MUSIC_ROUTE);
        const nextFrame = route === MUSIC_ROUTE ? musicFrame : ensureFrame(route);
        discardInactiveFeatureFrames(route);

        for (const [frameRoute, frame] of frames) {
            const isActive = frameRoute === route;
            frame.classList.toggle("is-active", isActive);
            frame.setAttribute("aria-hidden", String(!isActive));
        }

        setActiveSidebarItem(route);

        if (nextFrame.contentDocument?.readyState === "complete") {
            loading?.classList.add("is-hidden");
        }
    }

    function navigate(route) {
        const normalized = normalizeRoute(route);
        const nextHash = `#/${encodeURI(normalized)}`;
        if (window.location.hash === nextHash) {
            showRoute(normalized);
            return;
        }
        window.location.hash = nextHash;
    }

    document.addEventListener("click", event => {
        const link = event.target.closest("#jaimieSideMenu a.side-menu__item");
        if (!link || event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const route = routeFromLink(link);
        if (!route) return;

        event.preventDefault();
        navigate(route);
    });

    window.addEventListener("hashchange", () => showRoute(routeFromLocation()));
    window.addEventListener("jaimie:sidebar-ready", () => setActiveSidebarItem(activeRoute));

    if (!window.location.hash) {
        window.history.replaceState(null, "", `#/${HOME_ROUTE}`);
    }
    showRoute(routeFromLocation());

    window.JAIMIEShell = Object.freeze({ navigate, get activeRoute() { return activeRoute; } });
})();
