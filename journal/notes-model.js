(() => {
    "use strict";

    const safeContent = window.JAIMIESafeContent;
    if (!safeContent) throw new Error("Journal notes require JAIMIE safe-content services.");

    const normalizeTitle = value => safeContent.normalizeText(value, { maxLength: 200 }) || "Untitled Note";

    function extractWikiLinks(content) {
        const links = [];
        const seen = new Set();
        const pattern = /\[\[([^\]\n]{1,200})\]\]/g;
        let match;

        while ((match = pattern.exec(String(content || "")))) {
            const title = normalizeTitle(match[1]);
            const key = title.toLocaleLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                links.push(title);
            }
        }

        return links;
    }

    function extractTags(content) {
        const tags = [];
        const seen = new Set();
        const pattern = /(^|\s)#([\p{L}\p{N}_-]{1,64})/gu;
        let match;

        while ((match = pattern.exec(String(content || "")))) {
            const tag = match[2];
            const key = tag.toLocaleLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                tags.push(tag);
            }
        }

        return tags;
    }

    function wordCount(content) {
        const words = safeContent.normalizeText(content, { trim: true })
            .split(/\s+/)
            .filter(Boolean);
        return words.length;
    }

    function findNoteByTitle(notes, title) {
        const target = normalizeTitle(title).toLocaleLowerCase();
        return Object.values(notes || {}).find(note =>
            normalizeTitle(note?.title).toLocaleLowerCase() === target
        ) || null;
    }

    function getBacklinks(notes, currentNote) {
        if (!currentNote) return [];
        const target = normalizeTitle(currentNote.title).toLocaleLowerCase();

        return Object.values(notes || {})
            .filter(note => note?.id !== currentNote.id)
            .filter(note => extractWikiLinks(note?.content).some(link => link.toLocaleLowerCase() === target))
            .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    }

    function renderInline(value) {
        const source = String(value || "");
        const tokenPattern = /(\[\[[^\]\n]{1,200}\]\]|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|(^|\s)#[\p{L}\p{N}_-]{1,64})/gu;
        let html = "";
        let cursor = 0;
        let match;

        while ((match = tokenPattern.exec(source))) {
            html += safeContent.escapeHtml(source.slice(cursor, match.index));
            const token = match[0];

            if (token.startsWith("[[")) {
                const title = normalizeTitle(token.slice(2, -2));
                html += `<button type="button" class="wiki-link" data-wikilink="${safeContent.escapeHtml(title)}">${safeContent.escapeHtml(title)}</button>`;
            } else if (token.startsWith("`")) {
                html += `<code>${safeContent.escapeHtml(token.slice(1, -1))}</code>`;
            } else if (token.startsWith("**")) {
                html += `<strong>${safeContent.escapeHtml(token.slice(2, -2))}</strong>`;
            } else if (token.startsWith("*")) {
                html += `<em>${safeContent.escapeHtml(token.slice(1, -1))}</em>`;
            } else {
                const leadingSpace = token.match(/^\s/)?.[0] || "";
                const tag = token.trim().slice(1);
                html += `${safeContent.escapeHtml(leadingSpace)}<span class="markdown-tag">#${safeContent.escapeHtml(tag)}</span>`;
            }

            cursor = match.index + token.length;
        }

        return html + safeContent.escapeHtml(source.slice(cursor));
    }

    function renderMarkdown(content) {
        const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
        const html = [];
        let listType = "";
        let inCode = false;
        let codeLines = [];

        const closeList = () => {
            if (!listType) return;
            html.push(`</${listType}>`);
            listType = "";
        };

        for (const line of lines) {
            if (/^```/.test(line)) {
                closeList();
                if (inCode) {
                    html.push(`<pre><code>${safeContent.escapeHtml(codeLines.join("\n"))}</code></pre>`);
                    codeLines = [];
                }
                inCode = !inCode;
                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
            if (unordered || ordered) {
                const nextType = unordered ? "ul" : "ol";
                if (listType !== nextType) {
                    closeList();
                    listType = nextType;
                    html.push(`<${listType}>`);
                }
                html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
                continue;
            }

            closeList();

            if (!line.trim()) {
                html.push("");
                continue;
            }

            const heading = line.match(/^(#{1,4})\s+(.+)$/);
            if (heading) {
                const level = heading[1].length;
                html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            } else if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
                html.push("<hr>");
            } else if (/^>\s?/.test(line)) {
                html.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ""))}</blockquote>`);
            } else {
                html.push(`<p>${renderInline(line)}</p>`);
            }
        }

        closeList();
        if (inCode) html.push(`<pre><code>${safeContent.escapeHtml(codeLines.join("\n"))}</code></pre>`);

        return html.join("\n");
    }

    window.JAIMIEJournalNotes = Object.freeze({
        extractTags,
        extractWikiLinks,
        findNoteByTitle,
        getBacklinks,
        normalizeTitle,
        renderMarkdown,
        wordCount
    });
})();
