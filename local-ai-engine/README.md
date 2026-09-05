# JAIMIE Local AI Engine

Phase 3 adds request-scoped, read-only JAIMIE context to the secure local chat.
The browser selects only the relevant date range and data sections for each
prompt, then sends that payload directly to the local engine. The engine has no
Firebase credentials and no direct access to JAIMIE's database.

## Run

Make sure Ollama is running, then start the engine from the JAIMIE repository:

```powershell
python local-ai-engine/jaimie_ai.py
```

The default endpoint is `http://127.0.0.1:8765` and the speed-optimized default
model is `qwen3:1.7b`.

The terminal prints a six-digit pairing code when the engine starts. Enter this
code on the Home page. The code is single-use and valid for ten minutes. The
resulting browser session token remains in the current tab only and is held in
engine memory for up to eight hours; restarting the engine invalidates it.
Only one engine can bind to a port. If startup reports that port `8765` is in
use, stop the older engine window before starting the updated build.

## Phase 3 context

Context currently supports:

- Day schedules, Main Quests, and persistent reminders.
- Calendar tasks.
- Workout logs and personal records.
- Habit definitions and completion dates.
- Journal entries, only when the prompt explicitly asks about journaling or
  reflection.

Prompts about today, tomorrow, yesterday, this week, or an explicit ISO date
(`YYYY-MM-DD`) select the matching range. Each assistant response shows the
sections shared. Context is validated, bounded, and treated as untrusted data by
the engine. Phase 3 remains read-only; the model cannot create, edit, complete,
or delete JAIMIE data.

## Endpoints

- `GET /health` — engine and Ollama availability.
- `GET /model` — configured and installed model information.
- `POST /pair` — exchange the one-time code for a session token.
- `GET /session` — validate an authenticated local session.
- `POST /chat` — authenticated NDJSON streaming with optional read-only context.
- `POST /disconnect` — revoke the session and create a new pairing code.

## Configuration

Environment variables:

- `JAIMIE_AI_HOST` — loopback host; defaults to `127.0.0.1`.
- `JAIMIE_AI_PORT` — local port; defaults to `8765`.
- `JAIMIE_AI_MODEL` — Ollama model name; defaults to `qwen3:1.7b`.
- `OLLAMA_URL` — Ollama API base; defaults to `http://127.0.0.1:11434`.
- `JAIMIE_AI_ALLOWED_ORIGINS` — comma-separated deployed JAIMIE origins.

Localhost and `127.0.0.1` web origins are permitted automatically. For a
deployed site, explicitly provide its full HTTPS origin before starting the
engine:

```powershell
$env:JAIMIE_AI_ALLOWED_ORIGINS="https://your-project.web.app"
python local-ai-engine/jaimie_ai.py
```

Do not expose this service through port forwarding or bind it to a public
network interface.
