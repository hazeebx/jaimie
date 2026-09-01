# JAIMIE

JAIMIE (Just An Intelligent Memory Integrated Environment) is a local-first personal dashboard built with vanilla HTML, CSS and JavaScript.

## Run

Serve the repository root with a local HTTP server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`. Serving over HTTP is required because shared components are loaded with `fetch()` and Firebase integration uses ES modules.

## Architecture

- Each feature lives in its own folder and can be opened as a standalone page.
- `side-bar/` provides shared navigation and the Settings launcher.
- `data-manager/` provides the IndexedDB-backed local data API, backup/restore and optional sync integration.
- `firebase/` provides authentication and batched cloud synchronization.
- Feature data remains local-first; Firebase is not required for ordinary local use.

## Verification

Run the dependency-free smoke test after changing page wiring:

```bash
node scripts/smoke-test.mjs
```

The smoke test checks JavaScript syntax, required page files, shared script order and sidebar destinations. It does not modify browser data.
