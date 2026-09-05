(() => {
    "use strict";

    const registry = window.JAIMIEDashboardWidgets;
    if (!registry) throw new Error("Dashboard widget registry must load before Workout widget.");

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderEmpty(body, title, copy) {
        const empty = element("div", "workout-empty");
        empty.append(
            element("div", "workout-empty-mark", "○"),
            element("strong", "", title),
            element("p", "", copy)
        );
        body.appendChild(empty);
    }

    async function render({ container, data, dateKey, formattedDate, remove }) {
        const card = element("article", "dashboard-widget workout-widget");
        card.dataset.widgetType = "workout";

        const header = element("header", "widget-header");
        const heading = element("div", "widget-heading");
        const icon = element("div", "widget-icon", "✓");
        const headingCopy = element("div");
        headingCopy.append(
            element("span", "widget-kicker", "TODAY / WORKOUT"),
            element("h2", "", "Today's Workout")
        );
        heading.append(icon, headingCopy);

        const actions = element("div", "widget-actions");
        const open = element("a", "widget-link", "OPEN");
        open.href = "../workout-tracker/index.html";
        open.setAttribute("aria-label", "Open Workout Tracker");
        const removeButton = element("button", "widget-remove", "×");
        removeButton.type = "button";
        removeButton.title = "Remove widget";
        removeButton.setAttribute("aria-label", "Remove Today's Workout widget");
        removeButton.addEventListener("click", remove);
        actions.append(open, removeButton);
        header.append(heading, actions);

        const dateLine = element("div", "widget-date", formattedDate);
        const body = element("div", "workout-body");
        card.append(header, dateLine, body);
        container.appendChild(card);

        const workout = await data.load("workout");
        const today = workout?.days?.[dateKey];

        if (!today) {
            renderEmpty(body, "No workout logged", "Add exercises in Workout Tracker and they will appear here.");
            return;
        }

        if (today.rest) {
            card.classList.add("is-rest-day");
            renderEmpty(body, "Rest day", "Today is marked for recovery.");
            return;
        }

        const exercises = Array.isArray(today.exercises) ? today.exercises : [];
        if (!exercises.length) {
            renderEmpty(body, "No exercises yet", "Your workout is open, but no exercises have been added.");
            return;
        }

        const totalSets = exercises.reduce((sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0), 0);
        const completedSets = exercises.reduce(
            (sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.filter(set => set?.done).length : 0),
            0
        );
        const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;

        const summary = element("div", "workout-summary");
        const summaryText = element("div");
        summaryText.append(
            element("strong", "", `${completedSets} / ${totalSets} sets`),
            element("span", "", `${progress}% complete`)
        );
        const progressTrack = element("div", "workout-progress");
        const progressBar = element("span");
        progressBar.style.width = `${progress}%`;
        progressTrack.appendChild(progressBar);
        summary.append(summaryText, progressTrack);

        const list = element("div", "workout-exercises");
        exercises.forEach(exercise => {
            const row = element("div", "workout-exercise");
            const exerciseCopy = element("div", "exercise-copy");
            exerciseCopy.append(
                element("strong", "", String(exercise?.name || "Unnamed exercise")),
                element("span", "", `Target ${Number(exercise?.targetReps) || 0} reps`)
            );

            const sets = element("div", "exercise-sets");
            (Array.isArray(exercise?.sets) ? exercise.sets : []).forEach((set, index) => {
                const pill = element("span", set?.done ? "set-pill is-done" : "set-pill", `${index + 1}`);
                pill.title = `Set ${index + 1}: ${Number(set?.reps) || 0} reps${set?.done ? ", complete" : ""}`;
                sets.appendChild(pill);
            });
            row.append(exerciseCopy, sets);
            list.appendChild(row);
        });

        body.append(summary, list);
    }

    registry.register({
        type: "workout",
        label: "Today's Workout",
        description: "Exercises and set progress from today's Workout log.",
        icon: "✓",
        allowMultiple: false,
        render
    });
})();
