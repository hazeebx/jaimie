(() => {
    "use strict";

    const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
    const HTML_CHARACTERS = /[&<>"']/g;
    const HTML_ENTITIES = Object.freeze({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    });

    function normalizeText(value, { trim = true, maxLength = Infinity } = {}) {
        let normalized = value === undefined || value === null ? "" : String(value);
        normalized = normalized.normalize("NFC").replace(CONTROL_CHARACTERS, "");
        if (trim) normalized = normalized.trim();

        const limit = Number(maxLength);
        return Number.isFinite(limit) && limit >= 0
            ? normalized.slice(0, limit)
            : normalized;
    }

    function escapeHtml(value) {
        return normalizeText(value, { trim: false })
            .replace(HTML_CHARACTERS, character => HTML_ENTITIES[character]);
    }

    function safeUrl(value, {
        base = typeof document === "object" ? document.baseURI : "http://localhost/",
        allowedProtocols = ["http:", "https:"]
    } = {}) {
        const candidate = normalizeText(value);
        if (!candidate) return null;

        try {
            const parsed = new URL(candidate, base);
            return allowedProtocols.includes(parsed.protocol) ? parsed.href : null;
        } catch {
            return null;
        }
    }

    function setText(element, value, options) {
        if (!element) return "";
        const normalized = normalizeText(value, options);
        element.textContent = normalized;
        return normalized;
    }

    window.JAIMIESafeContent = Object.freeze({
        normalizeText,
        escapeHtml,
        safeUrl,
        setText
    });
})();
