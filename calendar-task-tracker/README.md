# Calendar Task Tracker

A local-first calendar/task page built with plain HTML, CSS and JavaScript.

## Features

- Monthly interactive calendar
- Previous/next month navigation
- Today navigation
- Unlimited tasks on any date
- Small task indicators directly on calendar dates
- Click a date to inspect its tasks
- Seven-day upcoming task list
- Task completion state
- Add/edit/delete tasks
- Categories
- Optional notes
- Task details view
- Task search across all stored tasks
- Local IndexedDB persistence
- No traditional reminders or notifications
- Responsive JetBrains-inspired dark UI with orange highlights

## Data model

Tasks are stored individually in IndexedDB with a date index. This avoids putting an entire month or year into one large record and scales cleanly as the number of tasks grows.

## Running

Open `index.html` in a modern browser. For the most consistent browser behavior, serve the folder with a local static server (for example, VS Code Live Server or `python -m http.server`).

No external libraries or network requests are required.
