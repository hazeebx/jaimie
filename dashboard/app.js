(() => {
    "use strict";

    const DATA_KEY = "dashboard";
    const registry = window.JAIMIEDashboardWidgets;
    const elements = {
        grid: document.getElementById("dashboardGrid"),
        empty: document.getElementById("dashboardEmpty"),
        add: document.getElementById("addWidgetButton"),
        emptyAdd: document.getElementById("emptyAddWidgetButton"),
        dialog: document.getElementById("widgetDialog"),
        options: document.getElementById("widgetOptions"),
        date: document.getElementById("dashboardDate"),
        toast: document.getElementById("dashboardToast")
    };

    let state = { version: 1, widgets: [] };
    let toastTimer;
    let refreshPromise = null;
    let refreshQueued = false;

    function uid() {
        return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function dateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        elements.toast.textContent = message;
        elements.toast.classList.add("is-visible");
        toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
    }

    async function load() {
        const stored = await JAIMIEData.load(DATA_KEY);
        if (stored && Array.isArray(stored.widgets)) {
            state = {
                version: 1,
                widgets: stored.widgets.filter(widget => widget && typeof widget.id === "string" && registry.get(widget.type))
            };
        }
    }

    async function save() {
        await JAIMIEData.save(DATA_KEY, state);
    }

    function canAdd(definition) {
        return definition.allowMultiple || !state.widgets.some(widget => widget.type === definition.type);
    }

    function renderLibrary() {
        elements.options.replaceChildren();

        registry.list().forEach(definition => {
            const button = document.createElement("button");
            button.className = "widget-option";
            button.type = "button";
            button.disabled = !canAdd(definition);

            const icon = document.createElement("span");
            icon.className = "widget-option-icon";
            icon.textContent = definition.icon;
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            title.textContent = definition.label;
            const description = document.createElement("small");
            description.textContent = button.disabled ? "Already added" : definition.description;
            copy.append(title, description);
            const plus = document.createElement("span");
            plus.className = "widget-option-plus";
            plus.textContent = button.disabled ? "✓" : "+";
            button.append(icon, copy, plus);

            button.addEventListener("click", () => addWidget(definition.type));
            elements.options.appendChild(button);
        });
    }

    function openLibrary() {
        renderLibrary();
        elements.dialog.showModal();
    }

    async function addWidget(type) {
        const definition = registry.get(type);
        if (!definition || !canAdd(definition)) return;
        state.widgets.push({ id: uid(), type, settings: {} });
        await save();
        elements.dialog.close();
        await refresh();
        showToast(`${definition.label} added`);
    }

    async function removeWidget(id) {
        const widget = state.widgets.find(item => item.id === id);
        state.widgets = state.widgets.filter(item => item.id !== id);
        await save();
        await refresh();
        showToast(`${registry.get(widget?.type)?.label || "Widget"} removed`);
    }

    async function render() {
        const widgets = state.widgets.slice();
        const nextGrid = document.createDocumentFragment();

        const today = new Date();
        const context = {
            data: JAIMIEData,
            dateKey: dateKey(today),
            formattedDate: today.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            })
        };

        for (const instance of widgets) {
            const definition = registry.get(instance.type);
            if (!definition) continue;
            try {
                await definition.render({
                    container: nextGrid,
                    instance,
                    ...context,
                    remove: () => removeWidget(instance.id),
                    updateSettings: async settings => {
                        instance.settings = { ...instance.settings, ...settings };
                        await save();
                    }
                });
            }
            catch (error) {
                console.error(`Dashboard widget failed: ${instance.type}`, error);
                const failed = document.createElement("article");
                failed.className = "dashboard-widget widget-error";
                failed.textContent = `${definition.label} could not load.`;
                nextGrid.appendChild(failed);
            }
        }

        elements.grid.replaceChildren(nextGrid);
        elements.empty.hidden = widgets.length > 0;
        elements.grid.hidden = widgets.length === 0;
    }

    async function runRefreshLoop() {
        do {
            refreshQueued = false;
            await load();
            await render();
        } while (refreshQueued);
    }

    function refresh() {
        if (refreshPromise) {
            refreshQueued = true;
            return refreshPromise;
        }

        refreshPromise = runRefreshLoop().finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    }

    function requestRefresh() {
        void refresh().catch(error => {
            console.error("JAIMIE Dashboard refresh failed:", error);
        });
    }

    async function init() {
        if (!registry || !window.JAIMIEData) {
            throw new Error("Dashboard dependencies did not load.");
        }
        elements.date.textContent = new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
        elements.add.addEventListener("click", openLibrary);
        elements.emptyAdd.addEventListener("click", openLibrary);
        window.addEventListener("focus", requestRefresh);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) requestRefresh();
        });
        await refresh();
    }

    init().catch(error => {
        console.error("JAIMIE Dashboard:", error);
        elements.empty.hidden = false;
        elements.empty.querySelector("h2").textContent = "Dashboard could not load";
        elements.empty.querySelector("p").textContent = "Reload the page to try again.";
    });
})();
