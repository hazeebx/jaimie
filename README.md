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

The shared validation foundation runs in compatibility mode. Registered schemas can normalize values and report structured issues at storage boundaries, while legacy data remains untouched until feature-specific enforcement is enabled and tested.

Run its focused test with:

```bash
npm run test:validation
```

Calendar and Reminder schemas are also active in compatibility mode. They inspect IDs, titles, real dates, 24-hour times, notification requirements, completion values, timestamps and one-to-one link identifiers. Existing legacy reminders without dates are reported as warnings but remain usable and unchanged.

Run their focused test with:

```bash
npm run test:calendar-reminders
```

Day Schedule entries are automatically rendered and saved in chronological
time order. Entries without a valid time remain at the end, and equal-time
entries keep their prior relative order. Main Quest and Reminders retain manual
reordering.

```bash
npm run test:day-schedule-order
```

Phase 3B adds a shared safe-content layer for user-entered JAIMIE data. Text is
Unicode-normalized, control characters are removed, dynamic HTML/attributes are
escaped, and untrusted URLs are restricted to explicitly allowed protocols.
Dynamic Inventory and Packing actions use delegated event handlers instead of
embedding saved values in inline JavaScript. The local AI conversation remains
outside this policy by design.

Run the malicious-payload and unsafe-markup regression checks with:

```bash
npm run test:content-safety
```

Workout data now has a compatibility-mode schema covering dated exercise logs,
sets, reusable workout templates, and 1RM/3RM/5RM personal records. Unknown
properties are intentionally preserved at every level so future fields can be
introduced without a destructive migration. Missing legacy IDs are reported as
warnings until strict enforcement is enabled.

```bash
npm run test:workout
```

The Workout page includes a one-year activity heatmap below Personal Records.
Intensity is calculated from completed sets because daily workout logs do not
currently store working weight. Each day also exposes completed reps in its
tooltip and can be selected to open that workout log.

```bash
npm run test:workout-history
```

Habits data also has a compatibility-mode schema covering habit definitions,
hex color tags, dated completion-history buckets, and food-recency tracking.
The Habits load/edit paths merge existing records so new root or record fields
survive ordinary edits instead of being overwritten.

```bash
npm run test:habits
```

Event Countdown data has a compatibility-mode schema for event IDs, names,
real calendar dates, color tags, timestamps, and duplicate detection. Unknown
event properties remain intact, while legacy countdowns without creation
timestamps use a safe display fallback on both the Event page and Dashboard.

```bash
npm run test:event-countdown
```

Diet and Sleep have separate compatibility-mode schemas. Diet validation covers
targets, the food library, dated water/meal logs, meal items, nutrients, IDs and
meal times. Sleep validation covers dated entries, bedtime/wake time, duration,
rested state and the current fell-asleep options. Retired quality and wake-up
fields remain compatible with old records without appearing in new entries.

```bash
npm run test:diet-sleep
```

Journal, House Inventory and Packing Tracker now have compatibility-mode
schemas as well. Their save and edit paths preserve unknown root and record
fields, allowing future data-model additions without silently deleting them.
Validation covers dated journal entries, inventory and shopping quantities,
packing profiles, item ownership, check keys and duplicate IDs.

```bash
npm run test:journal-inventory-packing
```

## Finance

The Finance page presents every bank account as its own balance widget. Each
widget opens a private manual expense ledger from its menu; adding an expense
immediately reduces that account's balance, and deleting a balance-linked
expense restores it. Older ledger records remain compatible without being
retroactively applied. Cards retain manually maintained limits and outstanding
balances. Finance accepts only an optional last-four identifier and must not be
used for banking credentials, PINs or security codes.

Finance uses the central `JAIMIEData` store under the `finance` dataset and a
compatibility-mode schema that preserves unknown future fields.

```bash
npm run test:finance
```

### Firestore Security Rules

Firestore Rules tests run entirely against a local demo-project emulator and never connect to JAIMIE's production database. They require Node.js and Java JDK 21 or newer.

Install the project dependencies once:

```bash
npm install
```

Then run both the application smoke test and Firestore Rules tests:

```bash
npm test
```

To run only the rules suite:

```bash
npm run test:rules
```

The rules suite verifies owner access, cross-user isolation, unauthenticated denial and denial of paths outside each user's dataset collection.

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

## Local Music library

The Music page imports individual audio files or an entire desktop folder,
reads embedded metadata and artwork, and stores the audio in the browser's
Origin Private File System. Its searchable catalog, playlists and player
settings use a separate IndexedDB database. Music never enters `JAIMIEData`,
Firebase, or JAIMIE backup exports.

On Android Chrome, select multiple files with **Import Files**. Install the
JAIMIE Music PWA from Chrome for the most reliable lock-screen and background
Media Session controls. Playback normally continues when Chrome is backgrounded
or the screen is locked, but Android can stop it if Chrome is force-closed or
the operating system kills the browser process. The library is local to each
browser/device and must be imported separately on other devices.

Run the Music isolation and PWA architecture checks with:

```bash
npm run test:music
```
