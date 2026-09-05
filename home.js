(() => {
    "use strict";

    const DEFAULT_ENGINE_URL = "http://127.0.0.1:8765";
    const URL_STORAGE_KEY = "jaimie-ai-engine-url";
    const TOKEN_STORAGE_KEY = "jaimie-ai-session-token";
    const HEALTH_INTERVAL_MS = 15000;
    const MAX_CONTEXT_ITEMS = 100;

    const elements = {
        url: document.getElementById("engineUrl"),
        connect: document.getElementById("connectButton"),
        retry: document.getElementById("retryButton"),
        disconnect: document.getElementById("disconnectButton"),
        assistant: document.getElementById("assistantButton"),
        orb: document.getElementById("engineOrb"),
        label: document.getElementById("connectionLabel"),
        title: document.getElementById("connectionTitle"),
        copy: document.getElementById("connectionCopy"),
        details: document.getElementById("engineDetails"),
        error: document.getElementById("connectionError"),
        model: document.getElementById("modelName"),
        engine: document.getElementById("engineName"),
        device: document.getElementById("deviceName"),
        backend: document.getElementById("backendName"),
        pairingPanel: document.getElementById("pairingPanel"),
        pairingForm: document.getElementById("pairingForm"),
        pairingCode: document.getElementById("pairingCode"),
        pairingMessage: document.getElementById("pairingMessage"),
        chatPanel: document.getElementById("chatPanel"),
        chatForm: document.getElementById("chatForm"),
        chatInput: document.getElementById("chatInput"),
        chatMessages: document.getElementById("chatMessages"),
        chatEmpty: document.getElementById("chatEmpty"),
        chatStatus: document.getElementById("chatStatus"),
        send: document.getElementById("sendButton"),
        stop: document.getElementById("stopButton"),
        clearChat: document.getElementById("clearChatButton"),
        suggestedPrompts: document.getElementById("suggestedPrompts")
    };

    let connected = false;
    let paired = false;
    let healthTimer = null;
    let chatController = null;
    const chatHistory = [];

    function normalizeEngineUrl(value) {
        let url;

        try {
            url = new URL(String(value || "").trim());
        }
        catch {
            throw new Error("Enter a valid local engine address.");
        }

        if (
            !["http:", "https:"].includes(url.protocol) ||
            !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) ||
            url.username ||
            url.password
        ) {
            throw new Error("For safety, the engine must use localhost or 127.0.0.1.");
        }

        url.pathname = "";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/$/, "");
    }

    function engineUrl() {
        return normalizeEngineUrl(elements.url.value);
    }

    function sessionToken() {
        return sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
    }

    function authHeaders(extra = {}) {
        return {
            ...extra,
            "Authorization": `Bearer ${sessionToken()}`
        };
    }

    function updatePairingUI(isPaired) {
        paired = isPaired;
        elements.pairingPanel.hidden = !connected || paired;
        elements.chatPanel.hidden = !connected || !paired;
        elements.assistant.disabled = !connected || !paired;
        elements.assistant.classList.toggle("is-ready", connected && paired);
    }

    function setState(status, health = null, message = "") {
        const isReady = status === "ready";
        const isDegraded = status === "degraded";
        connected = isReady || isDegraded;

        elements.orb.className = `engine-orb is-${status}`;
        elements.error.hidden = !message;
        elements.error.textContent = message;
        elements.details.hidden = !connected;
        elements.disconnect.hidden = !connected;
        elements.connect.textContent = connected ? "RECONNECT" : "CONNECT AI ENGINE";

        if (status === "connecting") {
            elements.label.textContent = "CHECKING LOCAL ENGINE";
            elements.title.textContent = "Connecting…";
            elements.copy.textContent = "Looking for JAIMIE AI on this computer.";
            elements.connect.disabled = true;
            return;
        }

        elements.connect.disabled = false;

        if (isReady) {
            elements.label.textContent = "AI ENGINE CONNECTED";
            elements.title.textContent = `${health.model} is ready`;
            elements.copy.textContent = paired
                ? "Secure local session established. The assistant is ready."
                : "The local engine is ready. Pair this browser to open the assistant.";
        }
        else if (isDegraded) {
            elements.label.textContent = "AI ENGINE NEEDS ATTENTION";
            elements.title.textContent = "Engine connected, model unavailable";
            elements.copy.textContent = "Start Ollama and confirm the configured model is installed.";
        }
        else {
            elements.label.textContent = "AI ENGINE OFFLINE";
            elements.title.textContent = "Connect your local AI engine";
            elements.copy.textContent = "Start the JAIMIE AI Engine on this computer, then connect to enable local AI functionality.";
            updatePairingUI(false);
        }

        if (connected && health) {
            elements.model.textContent = health.model || "Unknown";
            elements.engine.textContent = `${health.engine || "JAIMIE AI"} v${health.version || "—"}`;
            elements.device.textContent = health.device || "Local machine";
            elements.backend.textContent = health.backend_status === "ready"
                ? `${health.backend || "Local"} ready`
                : `${health.backend || "Local"} offline`;
        }
    }

    async function validateSession(baseUrl) {
        const token = sessionToken();
        if (!token) return false;

        try {
            const response = await fetch(`${baseUrl}/session`, {
                headers: authHeaders({ "Accept": "application/json" }),
                cache: "no-store"
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }

    async function checkConnection({ silent = false } = {}) {
        clearTimeout(healthTimer);

        let baseUrl;
        try {
            baseUrl = engineUrl();
        }
        catch (error) {
            setState("offline", null, error.message);
            return;
        }

        elements.url.value = baseUrl;
        localStorage.setItem(URL_STORAGE_KEY, baseUrl);
        if (!silent) setState("connecting");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const response = await fetch(`${baseUrl}/health`, {
                headers: { "Accept": "application/json" },
                cache: "no-store",
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`Engine returned HTTP ${response.status}.`);

            const health = await response.json();
            if (health.engine !== "jaimie-ai") {
                throw new Error("The address responded, but it is not a compatible JAIMIE AI Engine.");
            }
            if (!Array.isArray(health.capabilities) || !health.capabilities.includes("read_only_context_v1")) {
                throw new Error("An older JAIMIE AI Engine is running. Stop every existing engine, start this Phase 3 build, then reconnect.");
            }

            const sessionIsValid = await validateSession(baseUrl);
            if (!sessionIsValid) sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            updatePairingUI(sessionIsValid);
            setState(health.status === "ready" ? "ready" : "degraded", health);
            updatePairingUI(sessionIsValid && health.status === "ready");
            healthTimer = setTimeout(() => checkConnection({ silent: true }), HEALTH_INTERVAL_MS);
        }
        catch (error) {
            const detail = error.name === "AbortError"
                ? "The connection timed out. Make sure the local engine is running."
                : error.message || "Could not reach the local engine. Run the command below, then retry.";
            setState("offline", null, detail);
        }
        finally {
            clearTimeout(timeout);
        }
    }

    async function pairEngine(event) {
        event.preventDefault();
        const code = elements.pairingCode.value.trim();

        if (!/^\d{6}$/.test(code)) {
            elements.pairingMessage.textContent = "Enter the six-digit code from the engine terminal.";
            return;
        }

        elements.pairingMessage.textContent = "PAIRING…";

        try {
            const response = await fetch(`${engineUrl()}/pair`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ code })
            });
            const payload = await response.json();

            if (!response.ok || !payload.session_token) {
                throw new Error("That code is invalid or expired. Restart the engine if you need a new code.");
            }

            sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.session_token);
            elements.pairingCode.value = "";
            elements.pairingMessage.textContent = "";
            updatePairingUI(true);
            elements.copy.textContent = "Secure local session established. The assistant is ready.";
            elements.chatInput.focus();
        }
        catch (error) {
            elements.pairingMessage.textContent = error.message;
        }
    }

    async function disconnect() {
        clearTimeout(healthTimer);
        chatController?.abort();

        try {
            if (sessionToken()) {
                await fetch(`${engineUrl()}/disconnect`, {
                    method: "POST",
                    headers: authHeaders({ "Content-Type": "application/json" }),
                    body: "{}"
                });
            }
        }
        catch {
            // Local engine may already be unavailable; client cleanup still proceeds.
        }

        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(URL_STORAGE_KEY);
        elements.url.value = DEFAULT_ENGINE_URL;
        setState("offline");
    }

    function addMessage(role, content = "") {
        elements.chatEmpty?.remove();

        const article = document.createElement("article");
        article.className = `chat-message ${role}`;

        const label = document.createElement("span");
        label.textContent = role === "user" ? "YOU" : "JAIMIE";

        const text = document.createElement("div");
        text.className = "message-content";
        text.textContent = content;

        article.append(label, text);
        elements.chatMessages.appendChild(article);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        return text;
    }

    function localDateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function addDays(date, amount) {
        const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        result.setDate(result.getDate() + amount);
        return result;
    }

    function requestedDateRange(message) {
        const today = new Date();
        const lower = message.toLowerCase();
        const explicitDate = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];

        if (explicitDate && !Number.isNaN(new Date(`${explicitDate}T12:00:00`).getTime())) {
            return { start: explicitDate, end: explicitDate, label: explicitDate };
        }

        if (/\b(this|my|the)\s+week\b|\bweekly\b/.test(lower)) {
            const mondayOffset = (today.getDay() + 6) % 7;
            const start = addDays(today, -mondayOffset);
            return { start: localDateKey(start), end: localDateKey(addDays(start, 6)), label: "this week" };
        }

        if (/\btomorrow\b/.test(lower)) {
            const tomorrow = addDays(today, 1);
            return { start: localDateKey(tomorrow), end: localDateKey(tomorrow), label: "tomorrow" };
        }

        if (/\byesterday\b/.test(lower)) {
            const yesterday = addDays(today, -1);
            return { start: localDateKey(yesterday), end: localDateKey(yesterday), label: "yesterday" };
        }

        const key = localDateKey(today);
        return { start: key, end: key, label: "today" };
    }

    function inRange(date, range) {
        return typeof date === "string" && date >= range.start && date <= range.end;
    }

    function dateKeysInRange(range) {
        const dates = [];
        const cursor = new Date(`${range.start}T12:00:00`);
        const end = new Date(`${range.end}T12:00:00`);
        while (cursor <= end && dates.length < 31) {
            dates.push(localDateKey(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    }

    function cleanText(value, maximum = 1000) {
        return typeof value === "string" ? value.slice(0, maximum) : "";
    }

    function compactDayItem(item, includeTime = false) {
        if (!item || typeof item !== "object") return null;
        const compact = {
            title: cleanText(item.title, 200),
            done: Boolean(item.done)
        };
        const note = cleanText(item.note);
        if (note) compact.note = note;
        if (includeTime && item.time) compact.time = cleanText(item.time, 20);
        if (item.date) compact.date = cleanText(item.date, 10);
        return compact.title ? compact : null;
    }

    function contextIntent(message) {
        const lower = message.toLowerCase();
        const broad = /\b(overview|summary|focus|prioriti[sz]e|plan my|planned for me|what do i have)\b/.test(lower);
        return {
            day: broad || /\b(schedule|quest|reminder|appointment|meeting)\b/.test(lower),
            calendar: broad || /\b(task|calendar|deadline|due|appointment|meeting)\b/.test(lower),
            workout: broad || /\b(workout|exercise|training|gym|lift|pr|1rm|3rm|5rm)\b/.test(lower),
            habits: broad || /\b(habit|streak|consistent|consistency)\b/.test(lower),
            journal: /\b(journal|reflection|reflect|mood|how was my day|what did i write)\b/.test(lower)
        };
    }

    async function buildJaimieContext(message) {
        if (!window.JAIMIEData) return { payload: null, sources: [] };

        const range = requestedDateRange(message);
        const intent = contextIntent(message);
        const payload = {
            schema_version: 1,
            user_context: {
                local_date: localDateKey(),
                local_time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
                requested_range: range
            }
        };
        const sources = [];

        const loads = await Promise.all([
            intent.day ? JAIMIEData.load("day") : null,
            intent.calendar ? JAIMIEData.load("calendar") : null,
            intent.workout ? JAIMIEData.load("workout") : null,
            intent.habits ? JAIMIEData.load("habits") : null,
            intent.journal ? JAIMIEData.load("journal") : null
        ]);
        const [dayData, calendarData, workoutData, habitsData, journalData] = loads;

        if (intent.day) {
            const safeDayData = dayData && typeof dayData === "object" ? dayData : {};
            const days = Object.fromEntries(dateKeysInRange(range).map(date => [date, { schedule: [], main_quests: [] }]));
            Object.entries(safeDayData).forEach(([date, value]) => {
                if (!inRange(date, range) || !value || typeof value !== "object") return;
                days[date] = {
                    schedule: (Array.isArray(value.schedule) ? value.schedule : []).slice(0, MAX_CONTEXT_ITEMS).map(item => compactDayItem(item, true)).filter(Boolean),
                    main_quests: (Array.isArray(value.quests) ? value.quests : []).slice(0, MAX_CONTEXT_ITEMS).map(item => compactDayItem(item)).filter(Boolean)
                };
            });
            payload.day = {
                data_checked: true,
                days,
                persistent_reminders: (Array.isArray(safeDayData.reminders) ? safeDayData.reminders : []).slice(0, MAX_CONTEXT_ITEMS).map(item => compactDayItem(item, true)).filter(Boolean)
            };
            sources.push("Day");
        }

        if (intent.calendar) {
            payload.calendar_tasks = (Array.isArray(calendarData) ? calendarData : [])
                .filter(task => task && inRange(task.date, range))
                .slice(0, MAX_CONTEXT_ITEMS)
                .map(task => ({
                    title: cleanText(task.title, 200),
                    date: task.date,
                    time: cleanText(task.time, 20),
                    category: cleanText(task.category, 100),
                    notes: cleanText(task.notes),
                    completed: Boolean(task.completed)
                }));
            sources.push("Calendar & Tasks");
        }

        if (intent.workout) {
            const safeWorkoutData = workoutData && typeof workoutData === "object" ? workoutData : {};
            const days = Object.fromEntries(dateKeysInRange(range).map(date => [date, { rest_day: false, exercises: [] }]));
            Object.entries(safeWorkoutData.days || {}).forEach(([date, value]) => {
                if (!inRange(date, range) || !value || typeof value !== "object") return;
                days[date] = {
                    rest_day: Boolean(value.rest),
                    exercises: (Array.isArray(value.exercises) ? value.exercises : []).slice(0, MAX_CONTEXT_ITEMS).map(exercise => ({
                        name: cleanText(exercise.name, 200),
                        target_reps: Number(exercise.targetReps) || 0,
                        sets: (Array.isArray(exercise.sets) ? exercise.sets : []).slice(0, 30).map(set => ({ reps: Number(set.reps) || 0, done: Boolean(set.done) }))
                    }))
                };
            });
            payload.workouts = {
                data_checked: true,
                days,
                personal_records: (Array.isArray(safeWorkoutData.personalRecords) ? safeWorkoutData.personalRecords : []).slice(0, MAX_CONTEXT_ITEMS).map(record => ({
                    lift: cleanText(record.lift, 200),
                    reps: Number(record.reps) || 0,
                    weight: Number(record.weight) || 0,
                    unit: record.unit === "lb" ? "lb" : "kg",
                    date: cleanText(record.date, 10)
                }))
            };
            sources.push("Workouts");
        }

        if (intent.habits) {
            const safeHabitsData = habitsData && typeof habitsData === "object" ? habitsData : {};
            const habits = Object.values(safeHabitsData.habits || {}).slice(0, MAX_CONTEXT_ITEMS);
            const completions = Object.fromEntries(dateKeysInRange(range).map(date => [date, []]));
            Object.entries(safeHabitsData.completions || {}).forEach(([date, bucket]) => {
                if (!inRange(date, range) || !bucket || typeof bucket !== "object") return;
                completions[date] = habits
                    .filter(habit => bucket[habit.id])
                    .map(habit => cleanText(habit.name, 200));
            });
            payload.habits = {
                data_checked: true,
                tracked: habits.map(habit => ({ name: cleanText(habit.name, 200), created_at: cleanText(habit.createdAt, 10) })),
                completed_by_date: completions
            };
            sources.push("Habits");
        }

        if (intent.journal) {
            const safeJournalData = journalData && typeof journalData === "object" ? journalData : {};
            payload.journal = Object.entries(safeJournalData.entries || {})
                .filter(([date]) => inRange(date, range))
                .slice(0, 31)
                .map(([date, entry]) => ({
                    date,
                    how_day_went: cleanText(entry?.howDay, 3000),
                    tomorrow: cleanText(entry?.tomorrow, 3000)
                }));
            sources.push("Journal");
        }

        return { payload, sources };
    }

    function setChatBusy(busy) {
        elements.send.disabled = busy;
        elements.chatInput.disabled = busy;
        elements.stop.hidden = !busy;
        elements.chatStatus.textContent = busy ? "GENERATING LOCALLY…" : "READY";
    }

    async function sendMessage(event) {
        event.preventDefault();
        if (!paired || chatController) return;

        const message = elements.chatInput.value.trim();
        if (!message) return;

        const priorHistory = chatHistory.slice(-20);
        chatHistory.push({ role: "user", content: message });
        addMessage("user", message);
        elements.chatInput.value = "";

        const responseText = addMessage("assistant");
        responseText.classList.add("is-streaming");
        chatController = new AbortController();
        setChatBusy(true);

        try {
            elements.chatStatus.textContent = "PREPARING RELEVANT CONTEXT…";
            const context = await buildJaimieContext(message);
            if (context.sources.length) {
                const contextLabel = document.createElement("small");
                contextLabel.className = "message-context";
                contextLabel.textContent = `Context shared: ${context.sources.join(", ")}`;
                responseText.parentElement.insertBefore(contextLabel, responseText);
            }
            elements.chatStatus.textContent = "GENERATING LOCALLY…";
            const response = await fetch(`${engineUrl()}/chat`, {
                method: "POST",
                headers: authHeaders({
                    "Content-Type": "application/json",
                    "Accept": "application/x-ndjson"
                }),
                body: JSON.stringify({ message, history: priorHistory, context: context.payload }),
                signal: chatController.signal
            });

            if (response.status === 401) {
                sessionStorage.removeItem(TOKEN_STORAGE_KEY);
                updatePairingUI(false);
                throw new Error("Your secure session expired. Pair the engine again.");
            }

            if (!response.ok || !response.body) {
                throw new Error("The local model could not start a response.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let completeText = "";

            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    const item = JSON.parse(line);
                    if (item.type === "token") {
                        completeText += item.content;
                        responseText.textContent = completeText;
                        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
                    }
                    else if (item.type === "error") {
                        throw new Error(item.error || "The model stream failed.");
                    }
                    else if (item.type === "done") {
                        const elapsed = item.metadata?.processing_time_ms;
                        elements.chatStatus.textContent = elapsed ? `DONE IN ${(elapsed / 1000).toFixed(1)}S` : "READY";
                    }
                }

                if (done) break;
            }

            if (!completeText.trim()) throw new Error("The model returned an empty response.");
            chatHistory.push({ role: "assistant", content: completeText });
            responseText.classList.remove("is-streaming");
        }
        catch (error) {
            responseText.classList.remove("is-streaming");
            responseText.classList.add("is-error");
            responseText.textContent = error.name === "AbortError"
                ? "Generation stopped."
                : error.message;
            if (error.name === "AbortError") chatHistory.pop();
        }
        finally {
            chatController = null;
            setChatBusy(false);
            elements.chatInput.focus();
        }
    }

    function clearChat() {
        if (chatController) return;
        chatHistory.length = 0;
        elements.chatMessages.replaceChildren();

        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.id = "chatEmpty";
        empty.innerHTML = "<span>J</span><strong>Your local assistant is ready.</strong><p>Messages remain in this browser tab and are sent only to the local engine.</p>";
        elements.chatMessages.appendChild(empty);
    }

    elements.connect.addEventListener("click", () => checkConnection());
    elements.retry.addEventListener("click", () => checkConnection());
    elements.disconnect.addEventListener("click", disconnect);
    elements.pairingForm.addEventListener("submit", pairEngine);
    elements.chatForm.addEventListener("submit", sendMessage);
    elements.clearChat.addEventListener("click", clearChat);
    elements.stop.addEventListener("click", () => chatController?.abort());
    elements.assistant.addEventListener("click", () => {
        elements.chatPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        elements.chatInput.focus();
    });
    elements.suggestedPrompts.addEventListener("click", event => {
        const prompt = event.target.closest("[data-prompt]")?.dataset.prompt;
        if (!prompt) return;
        elements.chatInput.value = prompt;
        elements.chatInput.focus();
    });
    elements.url.addEventListener("keydown", event => {
        if (event.key === "Enter") checkConnection();
    });
    elements.chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            elements.chatForm.requestSubmit();
        }
    });

    elements.url.value = localStorage.getItem(URL_STORAGE_KEY) || DEFAULT_ENGINE_URL;
    checkConnection();
})();
