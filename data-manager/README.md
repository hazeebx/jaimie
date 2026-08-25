# JAIMIE Data Manager

Centralized local data layer for JAIMIE.

## Put it here

```text
JAIMIE/
└── data-manager/
    ├── app.js
    ├── styles.css
    └── README.md
```

## Include on a page

```html
<link rel="stylesheet" href="../data-manager/styles.css">
<script src="../data-manager/app.js"></script>
```

## API

```js
await JAIMIEData.save("example", { hello: "world" });
const data = await JAIMIEData.load("example");
await JAIMIEData.delete("example");

const backup = await JAIMIEData.exportAll();
JAIMIEData.downloadBackup(backup);

await JAIMIEData.importFile(file);
```

This version intentionally does **not** migrate existing page-specific databases. Existing Braindump data, for example, remains untouched until its page is explicitly migrated.
