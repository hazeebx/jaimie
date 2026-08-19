# Braindump

A local-first freeform braindump board.

## Features

- Click anywhere and type.
- Multiple independent text blocks.
- Draw freely anywhere with a pen.
- Eraser tool.
- Custom pen color.
- Undo / redo.
- Clear board.
- Automatic saving.
- JSON export.
- IndexedDB storage.

## Why IndexedDB?

The board stores drawing strokes as coordinate data. That can become much larger than simple settings or short notes, so IndexedDB is used instead of localStorage.

## Run

Open `index.html` directly, or run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

No framework or backend is required.
