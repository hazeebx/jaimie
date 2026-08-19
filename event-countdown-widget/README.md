# Event Countdown

A vanilla HTML/CSS/JavaScript event countdown widget with a JetBrains-inspired soft dark UI and orange accents.

## Screens

1. **Countdown Widget** — event name, target date, days remaining, and animated circular dial.
2. **Main Screen** — responsive collection of countdown cards, navigation, delete menu, and **Add New**.
3. **Add New** — event name, event date, and live-calculated **Days remaining** preview.

## Storage

Events are stored in the browser using `localStorage`. No backend is required.

## Run

Open `index.html` directly in a browser, or serve the folder with any static web server.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
