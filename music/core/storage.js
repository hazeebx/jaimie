(() => {
    "use strict";

    const AUDIO_DIRECTORY = "audio";
    const ARTWORK_DIRECTORY = "artwork";

    let rootDirectory = null;

    function requireOPFS() {
        if (!navigator.storage?.getDirectory) {
            throw new Error("This browser does not support local OPFS music storage.");
        }
    }

    async function root() {
        requireOPFS();
        if (!rootDirectory) rootDirectory = await navigator.storage.getDirectory();
        return rootDirectory;
    }

    async function directory(name) {
        return (await root()).getDirectoryHandle(name, { create: true });
    }

    function extension(filename, fallback = "bin") {
        const match = String(filename || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
        return match ? match[1] : fallback;
    }

    async function writeFile(directoryName, filename, blob) {
        const targetDirectory = await directory(directoryName);
        const handle = await targetDirectory.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        try {
            if (blob.stream && typeof blob.stream === "function") {
                await blob.stream().pipeTo(writable);
            } else {
                await writable.write(blob);
                await writable.close();
            }
        } catch (error) {
            try { await writable.abort(error); } catch { /* already closed */ }
            throw error;
        }
        return filename;
    }

    async function saveAudio(trackId, file) {
        const filename = `${trackId}.${extension(file.name, "mp3")}`;
        return writeFile(AUDIO_DIRECTORY, filename, file);
    }

    async function saveArtwork(trackId, artwork) {
        if (!artwork?.blob) return null;
        const typeExtension = artwork.type?.split("/")[1]?.replace("jpeg", "jpg") || "img";
        const filename = `${trackId}.${typeExtension.replace(/[^a-z0-9]/gi, "")}`;
        return writeFile(ARTWORK_DIRECTORY, filename, artwork.blob);
    }

    async function getFile(directoryName, filename) {
        if (!filename) return null;
        const targetDirectory = await directory(directoryName);
        const handle = await targetDirectory.getFileHandle(filename);
        return handle.getFile();
    }

    async function removeFile(directoryName, filename) {
        if (!filename) return;
        try {
            const targetDirectory = await directory(directoryName);
            await targetDirectory.removeEntry(filename);
        } catch (error) {
            if (error?.name !== "NotFoundError") throw error;
        }
    }

    async function removeTrackFiles(track) {
        await Promise.all([
            removeFile(AUDIO_DIRECTORY, track?.filePath),
            removeFile(ARTWORK_DIRECTORY, track?.artworkPath)
        ]);
    }

    async function audioFile(track) {
        return getFile(AUDIO_DIRECTORY, track?.filePath);
    }

    async function artworkFile(track) {
        return getFile(ARTWORK_DIRECTORY, track?.artworkPath);
    }

    async function requestPersistence() {
        if (!navigator.storage?.persist) return false;
        if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
        return navigator.storage.persist();
    }

    async function status() {
        const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
        const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
        return {
            supported: Boolean(navigator.storage?.getDirectory),
            persisted,
            usage: Number(estimate.usage) || 0,
            quota: Number(estimate.quota) || 0
        };
    }

    window.JAIMIEMusicStorage = Object.freeze({
        saveAudio,
        saveArtwork,
        audioFile,
        artworkFile,
        removeTrackFiles,
        requestPersistence,
        status
    });
})();
