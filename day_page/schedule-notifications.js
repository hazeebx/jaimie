/* Local-only notification preferences and delivery receipts; no server scheduling. */
(() => {
    if (window.JAIMIEScheduleNotifications) return;
    const dayUrl = new URL("index.html", document.currentScript.src);
    const ENABLED = "jaimie-schedule-notifications-enabled-v1";
    const RECEIPTS = "jaimie-schedule-notification-receipts-v1";
    const MINUTE = 60_000;
    const CATCH_UP = 5 * MINUTE;
    let busy = false;
    let errorMessage = "";

    function notificationProblem() {
        if (!window.isSecureContext) return "Notifications require HTTPS or localhost. Open JAIMIE through a local web server, not an insecure network address.";
        if (!("Notification" in window)) return "This browser does not expose desktop notifications. Open JAIMIE in desktop Edge or Chrome.";
        if (Notification.permission === "denied") return "Notifications are blocked. In your browser's site settings for this exact address, change Notifications to Allow, then reload. Embedded browsers may block notifications entirely; try desktop Edge or Chrome.";
        return "";
    }

    function supported() {
        return window.isSecureContext && "Notification" in window && !!navigator.locks;
    }

    function enabled() {
        return localStorage.getItem(ENABLED) === "true";
    }

    function refreshUI() {
        const status = document.getElementById("scheduleNotificationStatus");
        const toggle = document.getElementById("enableScheduleNotifications");
        const test = document.getElementById("testScheduleNotification");
        if (!status || !toggle || !test) return;
        try {
            const available = supported();
            const active = available && enabled() && Notification.permission === "granted";
            // Keep controls actionable: failures explain how to recover instead of silently disabling them.
            toggle.disabled = false;
            toggle.textContent = active ? "Disable notifications" : "Enable notifications";
            test.disabled = false;
            status.textContent = errorMessage || notificationProblem() || (!available
                ? "Scheduled reminders need Web Locks support. Test notification can still check desktop notifications independently."
                : active
                        ? "Enabled on this browser. Choose a reminder time when adding or editing a Schedule entry."
                        : "Off on this browser. Existing entries stay off until you choose a reminder time.");
        } catch {
            status.textContent = "Browser storage is unavailable; notifications cannot be enabled safely.";
            toggle.disabled = false;
            test.disabled = false;
        }
    }

    function notify(title, body, tag, date, onShow) {
        // Leave silent unset: respect the system's normal sound settings.
        const notification = new Notification(title, { body, tag });
        if (onShow) notification.onshow = onShow;
        notification.onclick = () => {
            window.focus();
            notification.close();
            if (date) {
                const target = new URL(dayUrl);
                target.searchParams.set("date", date);
                window.location.href = target.href;
            }
        };
        notification.onerror = () => {
            errorMessage = "Windows/browser could not display a notification. Check site and Windows notification settings.";
            refreshUI();
        };
        return notification;
    }

    async function check() {
        if (busy || !supported() || Notification.permission !== "granted") return;
        busy = true;
        try {
            if (!enabled() || !window.JAIMIEData) return;
            // Serialize receipts across all tabs on this origin, without blocking another tab.
            await navigator.locks.request("jaimie-schedule-notifications", { ifAvailable: true }, async lock => {
                if (!lock || !enabled()) return;
                const data = await window.JAIMIEData.load("day");
                if (!enabled() || Notification.permission !== "granted") return;
                const now = Date.now();
                const raw = JSON.parse(localStorage.getItem(RECEIPTS) || "{}");
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid delivery receipts");
                const receipts = Object.fromEntries(Object.entries(raw).filter(([, timestamp]) =>
                    Number.isFinite(timestamp) && timestamp >= now - 7 * 24 * 60 * MINUTE));
                for (const [date, day] of Object.entries(data || {})) {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(day?.schedule)) continue;
                    for (const item of day.schedule) {
                        if (!item?.id || ![0, 5, 10, 15].includes(item.notifyMinutes) ||
                            !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || "")) continue;
                        const scheduled = new Date(`${date}T${item.time}:00`);
                        const localDate = `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")}`;
                        if (localDate !== date) continue;
                        const due = scheduled.getTime() - item.notifyMinutes * MINUTE;
                        if (now < due || now - due > CATCH_UP) continue;
                        const receipt = JSON.stringify([date, item.id, item.time, item.notifyMinutes]);
                        if (Object.hasOwn(receipts, receipt)) continue;
                        // Write first so simultaneous tabs/reloads cannot announce the same reminder twice.
                        receipts[receipt] = now;
                        localStorage.setItem(RECEIPTS, JSON.stringify(receipts));
                        try {
                            notify(`JAIMIE · ${item.title || "Schedule reminder"}`,
                                `${item.time} · ${scheduled.toLocaleDateString()}${now > due + MINUTE ? " · Delayed reminder" : ""}`,
                                receipt, date);
                        } catch (error) {
                            delete receipts[receipt];
                            localStorage.setItem(RECEIPTS, JSON.stringify(receipts));
                            throw error;
                        }
                    }
                }
                localStorage.setItem(RECEIPTS, JSON.stringify(receipts));
            });
        } catch (error) {
            errorMessage = "Reminder check failed. Check browser notification/storage settings and reload to retry.";
            console.warn("JAIMIE schedule notifications:", error);
        } finally {
            busy = false;
            refreshUI();
        }
    }

    document.getElementById("enableScheduleNotifications")?.addEventListener("click", async () => {
        errorMessage = "";
        try {
            if (notificationProblem()) {
                errorMessage = notificationProblem();
                refreshUI();
                return;
            }
            if (!supported()) {
                errorMessage = "Scheduling requires Web Locks support to avoid duplicate reminders. Use an updated desktop Edge or Chrome browser. Test notification works separately.";
                refreshUI();
                return;
            }
            if (enabled() && Notification.permission === "granted") {
                localStorage.setItem(ENABLED, "false");
            } else {
                // Only this user gesture may ask for permission; never ask on page load.
                const permission = Notification.permission === "granted"
                    ? "granted" : await Notification.requestPermission();
                localStorage.setItem(ENABLED, String(permission === "granted"));
                if (permission === "granted") await check();
                else errorMessage = notificationProblem() || "Permission was not granted. Click Enable again and choose Allow in the browser prompt.";
            }
        } catch {
            errorMessage = "Unable to enable notifications. Check site permissions and browser storage.";
        }
        refreshUI();
    });
    document.getElementById("testScheduleNotification")?.addEventListener("click", async () => {
        const testButton = document.getElementById("testScheduleNotification");
        testButton.textContent = "Testing…";
        errorMessage = "";
        try {
            if (notificationProblem()) {
                errorMessage = `Test unavailable: ${notificationProblem()}`;
            } else {
                // Testing is independent of scheduling, Web Locks and local storage preferences.
                const permission = Notification.permission === "granted"
                    ? "granted" : await Notification.requestPermission();
                if (permission !== "granted") {
                    errorMessage = notificationProblem() || "Permission was not granted. Click Test again and choose Allow in the browser prompt.";
                } else {
                    errorMessage = "Test requested from the browser. If nothing appears, check Windows notification settings for this browser and Do Not Disturb.";
                    notify("JAIMIE · Test notification", "Schedule reminders use this popup. Sound follows your Windows settings.", `jaimie-schedule-test-${Date.now()}`, null, () => {
                        errorMessage = "Browser confirmed the test notification was shown. Sound still depends on Windows notification settings.";
                        refreshUI();
                    });
                }
            }
        } catch (error) {
            errorMessage = `Test failed (${error.name || "browser error"}). Open JAIMIE on localhost or HTTPS in desktop Edge/Chrome and allow notifications.`;
        }
        testButton.textContent = "Test again";
        refreshUI();
    });
    window.JAIMIEScheduleNotifications = { check };
    window.addEventListener("focus", () => { refreshUI(); void check(); });
    window.addEventListener("storage", () => { refreshUI(); void check(); });
    window.addEventListener("jaimie-schedule-changed", () => void check());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void check(); });
    setInterval(() => { refreshUI(); void check(); }, 15_000);
    refreshUI();
    void check();
})();
