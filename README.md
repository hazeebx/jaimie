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

## Local AI engine

The Home page includes Phase 3 local-engine connection detection, secure
pairing, streamed chat, and selective read-only context from JAIMIE. With Ollama running, start the
dependency-free Python service from the repository root:

```bash
python local-ai-engine/jaimie_ai.py
```

It binds to `127.0.0.1:8765` and uses the faster `qwen3:1.7b` by default. Enter the one-time
pairing code printed in its terminal on the Home page. The browser selects
relevant Day, Calendar, Workout, Habit, or explicitly requested Journal data for
each prompt. The engine has no database credentials and cannot modify JAIMIE.
See `local-ai-engine/README.md` for configuration and security details.

The engine directory is explicitly excluded from Firebase Hosting in
`firebase.json`. Engine source remains versioned, while local models, virtual
environments, caches, and secrets are excluded by `.gitignore`.
