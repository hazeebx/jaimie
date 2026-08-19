# JAIMIE Collapsible Side Menu

Standalone HTML/CSS/JS component.

## Files

- `component.html` — menu markup
- `styles.css` — menu styling
- `app.js` — collapse/expand logic + persistence

## Pages currently included

- Day
- Calendar & Tasks
- Workout
- Diet
- Sleep
- Braindump
- Pomodoro
- Event Countdown
- House Inventory
- Packing Tracker
- News Tracker

All page `href` values are intentionally empty so you can fill them with your own relative paths.

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

The JS will automatically toggle `.menu-collapsed` on that wrapper.

The collapsed/expanded state is saved in localStorage.
