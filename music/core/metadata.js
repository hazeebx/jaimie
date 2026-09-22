(() => {
    "use strict";

    const TEXT_FRAMES = Object.freeze({
        TIT2: "title", TT2: "title",
        TPE1: "artist", TP1: "artist",
        TPE2: "albumArtist", TP2: "albumArtist",
        TALB: "album", TAL: "album",
        TCOM: "composer", TCM: "composer",
        TRCK: "trackNumber", TRK: "trackNumber",
        TPOS: "discNumber", TPA: "discNumber",
        TDRC: "year", TYER: "year", TYE: "year",
        TCON: "genre", TCO: "genre"
    });

    function synchsafe(bytes, offset = 0) {
        return ((bytes[offset] & 0x7f) << 21) |
            ((bytes[offset + 1] & 0x7f) << 14) |
            ((bytes[offset + 2] & 0x7f) << 7) |
            (bytes[offset + 3] & 0x7f);
    }

    function uint32(bytes, offset = 0) {
        return (((bytes[offset] << 24) >>> 0) +
            (bytes[offset + 1] << 16) +
            (bytes[offset + 2] << 8) +
            bytes[offset + 3]) >>> 0;
    }

    function ascii(bytes, start, length) {
        return String.fromCharCode(...bytes.subarray(start, start + length));
    }

    function trimText(value) {
        return String(value || "").replace(/\0/g, "").trim();
    }

    function decodeUtf16Be(bytes) {
        const swapped = new Uint8Array(bytes.length);
        for (let index = 0; index + 1 < bytes.length; index += 2) {
            swapped[index] = bytes[index + 1];
            swapped[index + 1] = bytes[index];
        }
        return new TextDecoder("utf-16le").decode(swapped);
    }

    function decodeText(bytes, encoding = 3) {
        if (!bytes?.length) return "";
        let decoded = "";
        try {
            if (encoding === 0) decoded = new TextDecoder("windows-1252").decode(bytes);
            else if (encoding === 1) decoded = new TextDecoder("utf-16").decode(bytes);
            else if (encoding === 2) decoded = decodeUtf16Be(bytes);
            else decoded = new TextDecoder("utf-8").decode(bytes);
        } catch {
            decoded = new TextDecoder().decode(bytes);
        }
        return trimText(decoded);
    }

    function terminatorLength(encoding) {
        return encoding === 1 || encoding === 2 ? 2 : 1;
    }

    function findTerminator(bytes, start, encoding) {
        const length = terminatorLength(encoding);
        for (let index = start; index <= bytes.length - length; index += length) {
            if (bytes[index] === 0 && (length === 1 || bytes[index + 1] === 0)) return index;
        }
        return bytes.length;
    }

    function parseArtwork(frame, version) {
        if (frame.length < 4) return null;
        const encoding = frame[0];
        let cursor = 1;
        let mime = "image/jpeg";

        if (version === 2) {
            const format = ascii(frame, cursor, 3).toLowerCase();
            cursor += 3;
            mime = format === "png" ? "image/png" : "image/jpeg";
        } else {
            const mimeEnd = frame.indexOf(0, cursor);
            if (mimeEnd < 0) return null;
            mime = ascii(frame, cursor, mimeEnd - cursor) || mime;
            cursor = mimeEnd + 1;
        }

        cursor += 1; // picture type
        const descriptionEnd = findTerminator(frame, cursor, encoding);
        cursor = descriptionEnd + terminatorLength(encoding);
        if (cursor >= frame.length) return null;
        return { type: mime, blob: new Blob([frame.slice(cursor)], { type: mime }) };
    }

    function parseComment(frame) {
        if (frame.length < 5) return "";
        const encoding = frame[0];
        const start = 4; // encoding + language
        const descriptionEnd = findTerminator(frame, start, encoding);
        return decodeText(frame.slice(descriptionEnd + terminatorLength(encoding)), encoding);
    }

    function parseId3v2(bytes) {
        const metadata = { rawTextTags: {} };
        if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return metadata;

        const version = bytes[3];
        const flags = bytes[5];
        const tagEnd = Math.min(bytes.length, 10 + synchsafe(bytes, 6));
        let cursor = 10;

        if (flags & 0x40 && cursor + 4 <= tagEnd) {
            const extendedSize = version === 4 ? synchsafe(bytes, cursor) : uint32(bytes, cursor);
            cursor += version === 3 ? extendedSize + 4 : extendedSize;
        }

        while (cursor < tagEnd) {
            const headerLength = version === 2 ? 6 : 10;
            if (cursor + headerLength > tagEnd) break;
            const idLength = version === 2 ? 3 : 4;
            const frameId = ascii(bytes, cursor, idLength);
            if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;
            const size = version === 2
                ? (bytes[cursor + 3] << 16) | (bytes[cursor + 4] << 8) | bytes[cursor + 5]
                : version === 4
                    ? synchsafe(bytes, cursor + 4)
                    : uint32(bytes, cursor + 4);
            if (!size || cursor + headerLength + size > tagEnd) break;

            const frame = bytes.slice(cursor + headerLength, cursor + headerLength + size);
            const mapped = TEXT_FRAMES[frameId];
            if (mapped && frame.length > 1) {
                const value = decodeText(frame.slice(1), frame[0]);
                metadata[mapped] = value;
                metadata.rawTextTags[frameId] = value;
            } else if (frameId === "APIC" || frameId === "PIC") {
                metadata.artwork ||= parseArtwork(frame, version);
            } else if (frameId === "COMM" || frameId === "COM") {
                const value = parseComment(frame);
                if (value) {
                    metadata.comment = value;
                    metadata.rawTextTags[frameId] = value;
                }
            } else if (frameId === "USLT" || frameId === "ULT") {
                const value = parseComment(frame);
                if (value) {
                    metadata.lyrics = value;
                    metadata.rawTextTags[frameId] = value;
                }
            }

            cursor += headerLength + size;
        }

        return metadata;
    }

    async function parseId3v1(file) {
        if (file.size < 128) return {};
        const bytes = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
        if (ascii(bytes, 0, 3) !== "TAG") return {};
        const decode = (start, length) => decodeText(bytes.slice(start, start + length), 0);
        return {
            title: decode(3, 30),
            artist: decode(33, 30),
            album: decode(63, 30),
            year: decode(93, 4),
            comment: decode(97, 30)
        };
    }

    async function duration(file) {
        return new Promise(resolve => {
            const audio = document.createElement("audio");
            const url = URL.createObjectURL(file);
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                URL.revokeObjectURL(url);
                audio.removeAttribute("src");
                resolve(Number.isFinite(value) ? value : 0);
            };
            const timer = setTimeout(() => finish(0), 12000);
            audio.preload = "metadata";
            audio.onloadedmetadata = () => {
                clearTimeout(timer);
                finish(audio.duration);
            };
            audio.onerror = () => {
                clearTimeout(timer);
                finish(0);
            };
            audio.src = url;
        });
    }

    function filenameTitle(filename) {
        return String(filename || "Unknown track").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    }

    async function parse(file) {
        const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
        let id3v2 = {};
        if (header.length === 10 && ascii(header, 0, 3) === "ID3") {
            const tagSize = Math.min(file.size, 10 + synchsafe(header, 6), 32 * 1024 * 1024);
            id3v2 = parseId3v2(new Uint8Array(await file.slice(0, tagSize).arrayBuffer()));
        }
        const id3v1 = await parseId3v1(file);
        const length = await duration(file);

        return {
            title: id3v2.title || id3v1.title || filenameTitle(file.name),
            artist: id3v2.artist || id3v1.artist || "Unknown Artist",
            albumArtist: id3v2.albumArtist || "",
            album: id3v2.album || id3v1.album || "Unknown Album",
            composer: id3v2.composer || "",
            year: id3v2.year || id3v1.year || "",
            trackNumber: id3v2.trackNumber || "",
            discNumber: id3v2.discNumber || "",
            genre: id3v2.genre || "",
            comment: id3v2.comment || id3v1.comment || "",
            lyrics: id3v2.lyrics || "",
            duration: length,
            artwork: id3v2.artwork || null,
            rawTextTags: id3v2.rawTextTags || {}
        };
    }

    window.JAIMIEMusicMetadata = Object.freeze({ parse, synchsafe, parseId3v2 });
})();
