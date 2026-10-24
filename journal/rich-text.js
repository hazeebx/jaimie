(() => {
    "use strict";

    const safeContent = window.JAIMIESafeContent;
    if (!safeContent) throw new Error("Journal rich text requires JAIMIE safe-content services.");

    const ALLOWED_TAGS = new Set([
        "P", "DIV", "BR", "STRONG", "EM", "U", "S",
        "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE"
    ]);
    const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"]);
    const TAG_ALIASES = Object.freeze({ B: "strong", I: "em", STRIKE: "s" });

    function copySafeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return document.createTextNode(safeContent.normalizeText(node.nodeValue, { trim: false, maxLength: 500000 }));
        }

        if (node.nodeType !== Node.ELEMENT_NODE || DROP_WITH_CONTENT.has(node.tagName)) {
            return document.createDocumentFragment();
        }

        const output = ALLOWED_TAGS.has(node.tagName) || TAG_ALIASES[node.tagName]
            ? document.createElement(TAG_ALIASES[node.tagName] || node.tagName.toLowerCase())
            : document.createDocumentFragment();

        for (const child of node.childNodes) output.appendChild(copySafeNode(child));
        return output;
    }

    function sanitizeHtml(value) {
        const source = document.createElement("template");
        source.innerHTML = String(value || "");
        const output = document.createElement("div");
        for (const child of source.content.childNodes) output.appendChild(copySafeNode(child));
        return output.innerHTML;
    }

    function plainTextToHtml(value) {
        const output = document.createElement("div");
        const lines = safeContent.normalizeText(value, { trim: false, maxLength: 500000 }).split(/\r?\n/);
        for (const line of lines) {
            const block = document.createElement("div");
            if (line) block.textContent = line;
            else block.appendChild(document.createElement("br"));
            output.appendChild(block);
        }
        return output.innerHTML;
    }

    function textContent(editor) {
        return safeContent.normalizeText(editor?.innerText || "", { trim: true, maxLength: 100000 });
    }

    window.JAIMIEJournalRichText = Object.freeze({ sanitizeHtml, plainTextToHtml, textContent });
})();
