# JAIMIE Responsive Side Menu

Standalone HTML/CSS/JS component.

## Files

- `component.html` — menu markup
- `styles.css` — menu styling
- `app.js` — desktop collapse persistence and mobile drawer behavior

## Pages currently included

- Day
- Calendar & Tasks
- Workout
- Journal
- Habits
- Diet
- Sleep
- Journal (Daily Entry, Notes, and Braindump)
- Pomodoro
- Event Countdown
- House Inventory
- Packing Tracker
- Home

News Tracker is shown as a disabled placeholder until that page is implemented.

Implemented page links are resolved from the JAIMIE project root, so the same component works from both the Home page and nested feature folders.

## Usage

Copy the contents of `component.html` into the page where you want the menu.

Then include:

```html
<link rel="stylesheet" href="styles.css">
<script src="app.js"></script>
```

If the menu is used on an existing page, give the main page wrapper:

```html
<main class="jaimie-content">
    ...
</main>
```

The shared stylesheet reserves the sidebar's width on every JAIMIE page, and the JS updates that offset when the menu expands or collapses. The optional `.jaimie-content` class remains supported for older page markup but no longer needs to provide its own sidebar margin.

The JS also marks the current page active. Both folder URLs (for example `/journal/`) and explicit `index.html` URLs are supported.

On desktop, the collapsed/expanded state is saved in localStorage. At 700px and below, the menu becomes an off-canvas drawer with a persistent top launcher, backdrop dismissal, Escape-key dismissal, and automatic closing after navigation. Mobile drawer state is intentionally not persisted.
