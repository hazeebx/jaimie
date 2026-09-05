(() => {
    "use strict";

    const registry = window.JAIMIEDashboardWidgets;
    if (!registry) throw new Error("Dashboard widget registry must load before Countdown widget.");

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function daysRemaining(dateString) {
        const target = new Date(`${dateString}T23:59:59`);
        return Math.max(0, Math.ceil((target - new Date()) / 86400000));
    }

    function formatDate(dateString) {
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        }).format(new Date(`${dateString}T12:00:00`));
    }

    function progressDegrees(event, days) {
        const created = new Date(event.createdAt);
        const target = new Date(`${event.date}T00:00:00`);
        const ageDays = Math.max(1, Math.ceil((target - created) / 86400000));
        return Math.min(360, Math.max(0, ((ageDays - days) / ageDays) * 360));
    }

    function eventColor(event) {
        const color = String(event?.color || "");
        return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ff8a2a";
    }

    async function render({ container, data, dateKey, instance, remove, updateSettings }) {
        const stored = await data.load("event-countdown");
        const events = (Array.isArray(stored) ? stored : [])
            .filter(event => event && typeof event.date === "string" && event.date >= dateKey);

        const card = element("article", "dashboard-widget countdown-widget");
        card.dataset.widgetType = "countdown";

        const top = element("div", "countdown-top");
        const previous = element("button", "countdown-arrow", "←");
        previous.type = "button";
        previous.setAttribute("aria-label", "Previous active countdown");
        const title = element("div", "countdown-title");
        const next = element("button", "countdown-arrow", "→");
        next.type = "button";
        next.setAttribute("aria-label", "Next active countdown");
        top.append(previous, title, next);

        const stage = element("div", "countdown-stage");
        const footer = element("div", "countdown-footer");
        const position = element("span", "countdown-position");
        const actions = element("div", "widget-actions");
        const open = element("a", "widget-link", "OPEN EVENTS");
        open.href = "../event-countdown-widget/index.html";
        const removeButton = element("button", "widget-remove", "×");
        removeButton.type = "button";
        removeButton.title = "Remove widget";
        removeButton.setAttribute("aria-label", "Remove Event Countdown widget");
        removeButton.addEventListener("click", remove);
        actions.append(open, removeButton);
        footer.append(position, actions);
        card.append(top, stage, footer);
        container.appendChild(card);

        if (!events.length) {
            previous.disabled = true;
            next.disabled = true;
            title.append(
                element("span", "widget-kicker", "EVENT COUNTDOWN"),
                element("h2", "", "No active events")
            );
            const empty = element("div", "countdown-empty");
            empty.append(
                element("div", "countdown-empty-mark", "◉"),
                element("strong", "", "Nothing to count down yet"),
                element("p", "", "Create an upcoming event and it will appear here.")
            );
            stage.appendChild(empty);
            position.textContent = "0 EVENTS";
            return;
        }

        let index = Number(instance.settings?.activeIndex) || 0;
        index = ((index % events.length) + events.length) % events.length;

        function showEvent() {
            const event = events[index];
            const days = daysRemaining(event.date);
            const progress = progressDegrees(event, days);
            const color = eventColor(event);

            title.replaceChildren();
            title.append(
                element("h2", "", String(event.name || "Unnamed event")),
                element("span", "countdown-date", formatDate(event.date))
            );

            const dial = element("div", "countdown-dial");
            dial.style.setProperty("--countdown-progress", `${progress}deg`);
            dial.style.setProperty("--countdown-color", color);
            const dialInner = element("div", "countdown-dial-inner");
            const number = element("strong", "", String(days));
            const label = element("span", "", days === 1 ? "DAY LEFT" : "DAYS LEFT");
            dialInner.append(number, label);
            dial.appendChild(dialInner);

            const status = element("div", "countdown-status");
            status.append(
                element("span", "", days === 0 ? "EVENT DAY" : "COUNTING DOWN"),
                element("span", "", days === 0 ? "TODAY" : formatDate(event.date))
            );
            stage.replaceChildren(dial, status);
            position.textContent = `${index + 1} / ${events.length}`;
            previous.disabled = events.length < 2;
            next.disabled = events.length < 2;
        }

        async function move(direction) {
            index = (index + direction + events.length) % events.length;
            showEvent();
            await updateSettings({ activeIndex: index });
        }

        previous.addEventListener("click", () => move(-1));
        next.addEventListener("click", () => move(1));
        showEvent();
    }

    registry.register({
        type: "countdown",
        label: "Event Countdown",
        description: "Switch between active Event Countdown entries.",
        icon: "◉",
        allowMultiple: false,
        render
    });
})();
