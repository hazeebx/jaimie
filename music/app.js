(() => {
    "use strict";

    const database = window.JAIMIEMusicDatabase;
    const storage = window.JAIMIEMusicStorage;
    const metadata = window.JAIMIEMusicMetadata;
    const safeContent = window.JAIMIESafeContent;

    const state = {
        tracks: [],
        playlists: [],
        activePlaylistId: "all",
        pendingPlaylistTrackId: null,
        pendingFolderPlaylistId: null,
        search: "",
        sort: "title"
    };

    const $ = id => document.getElementById(id);
    let toastTimer = null;

    function uid() {
        return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let size = value / 1024;
        let unit = units[0];
        for (let index = 1; index < units.length && size >= 1024; index += 1) {
            size /= 1024;
            unit = units[index];
        }
        return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
    }

    function formatTime(seconds) {
        const value = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
        return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
    }

    function toast(message) {
        const element = $("musicToast");
        element.textContent = message;
        element.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
    }

    async function fingerprint(file) {
        const chunkSize = 64 * 1024;
        const first = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());
        const lastStart = Math.max(0, file.size - chunkSize);
        const last = new Uint8Array(await file.slice(lastStart).arrayBuffer());
        const sizeBytes = new TextEncoder().encode(String(file.size));
        const sample = new Uint8Array(first.length + last.length + sizeBytes.length);
        sample.set(first, 0);
        sample.set(last, first.length);
        sample.set(sizeBytes, first.length + last.length);
        const digest = await crypto.subtle.digest("SHA-256", sample);
        return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }

    function isAudioFile(file) {
        return file.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(file.name);
    }

    function normalizeTagMap(rawTags) {
        if (!rawTags || typeof rawTags !== "object" || Array.isArray(rawTags)) return {};
        return Object.fromEntries(
            Object.entries(rawTags)
                .slice(0, 100)
                .map(([key, value]) => [
                    safeContent.normalizeText(key, { maxLength: 20 }),
                    safeContent.normalizeText(value, { trim: false, maxLength: 5000 })
                ])
                .filter(([key]) => key)
        );
    }

    async function refreshLibrary() {
        [state.tracks, state.playlists] = await Promise.all([
            database.tracks.all(),
            database.playlists.all()
        ]);
        renderPlaylists();
        renderTracks();
        await renderStorageStatus();
    }

    function activePlaylist() {
        return state.playlists.find(item => item.id === state.activePlaylistId) || null;
    }

    function visibleTracks() {
        const playlist = activePlaylist();
        const allowedIds = playlist ? new Set(playlist.trackIds || []) : null;
        const query = state.search.toLocaleLowerCase();
        const result = state.tracks.filter(track => {
            if (allowedIds && !allowedIds.has(track.id)) return false;
            if (!query) return true;
            return [track.title, track.artist, track.album, track.genre]
                .some(value => String(value || "").toLocaleLowerCase().includes(query));
        });
        return result.sort((left, right) => {
            if (state.sort === "addedAt") return String(right.addedAt).localeCompare(String(left.addedAt));
            return String(left[state.sort] || "").localeCompare(String(right[state.sort] || ""), undefined, { sensitivity: "base" });
        });
    }

    function renderPlaylists() {
        const list = $("playlistList");
        list.replaceChildren();
        list.appendChild(playlistRow({ id: "all", name: "All Music", trackIds: state.tracks.map(track => track.id) }, false));
        for (const playlist of [...state.playlists].sort((a, b) => a.name.localeCompare(b.name))) {
            list.appendChild(playlistRow(playlist, true));
        }
    }

    function playlistRow(playlist, editable) {
        const row = document.createElement("div");
        row.className = `playlist-row${state.activePlaylistId === playlist.id ? " active" : ""}`;
        row.dataset.playlistId = playlist.id;

        const copy = document.createElement("button");
        copy.type = "button";
        copy.style.cssText = "border:0;background:transparent;padding:0;text-align:left;min-width:0";
        const name = document.createElement("strong");
        name.textContent = playlist.name;
        const count = document.createElement("span");
        count.textContent = `${playlist.trackIds?.length || 0} TRACKS`;
        copy.append(name, count);
        copy.addEventListener("click", () => {
            state.activePlaylistId = playlist.id;
            renderPlaylists();
            renderTracks();
        });
        row.appendChild(copy);

        if (editable) {
            const actions = document.createElement("div");
            actions.className = "playlist-actions";
            const rename = document.createElement("button");
            rename.type = "button";
            rename.textContent = "✎";
            rename.title = "Rename playlist";
            rename.addEventListener("click", () => renamePlaylist(playlist));
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Delete playlist";
            remove.addEventListener("click", () => deletePlaylist(playlist));
            actions.append(rename, remove);
            row.appendChild(actions);
        }
        return row;
    }

    function renderTracks() {
        const tracks = visibleTracks();
        const list = $("trackList");
        list.replaceChildren();
        $("libraryHeading").textContent = activePlaylist()?.name || "Music List";
        $("trackCount").textContent = `${tracks.length} ${tracks.length === 1 ? "TRACK" : "TRACKS"}`;
        const duration = tracks.reduce((total, track) => total + (Number(track.duration) || 0), 0);
        $("libraryDuration").textContent = duration >= 3600
            ? `${(duration / 3600).toFixed(1)} HOURS`
            : `${Math.round(duration / 60)} MIN`;

        if (!tracks.length) {
            const empty = document.createElement("div");
            empty.className = "empty-library";
            empty.innerHTML = "<div><strong>No music here yet.</strong><span>Import audio files or choose another playlist.</span></div>";
            list.appendChild(empty);
            return;
        }

        const queue = tracks.map(track => track.id);
        for (const track of tracks) list.appendChild(trackRow(track, queue));
    }

    function trackRow(track, queue) {
        const row = document.createElement("article");
        row.className = `track-row${player.currentTrack?.id === track.id ? " is-playing" : ""}`;
        row.dataset.trackId = track.id;

        const play = document.createElement("button");
        play.className = "track-play";
        play.type = "button";
        play.textContent = player.currentTrack?.id === track.id && !player.audio.paused ? "Ⅱ" : "▶";
        play.setAttribute("aria-label", `Play ${track.title}`);
        play.addEventListener("click", async () => {
            if (player.currentTrack?.id === track.id && !player.audio.paused) player.pause();
            else if (player.currentTrack?.id === track.id) await player.play().catch(handlePlaybackError);
            else await player.playTrack(track.id, queue).catch(handlePlaybackError);
            renderTracks();
        });

        const title = document.createElement("div");
        title.className = "track-copy";
        const titleName = document.createElement("strong");
        titleName.textContent = track.title || "Unknown track";
        const mobileArtist = document.createElement("span");
        mobileArtist.textContent = track.artist || "Unknown Artist";
        title.append(titleName, mobileArtist);

        const artist = document.createElement("div");
        artist.className = "track-copy track-artist-column";
        const artistName = document.createElement("span");
        artistName.textContent = track.artist || "Unknown Artist";
        artist.appendChild(artistName);

        const album = document.createElement("div");
        album.className = "track-album";
        album.textContent = track.album || "Unknown Album";

        const length = document.createElement("div");
        length.className = "track-duration";
        length.textContent = formatTime(track.duration);

        const actions = document.createElement("div");
        actions.className = "track-actions";
        const add = document.createElement("button");
        add.type = "button";
        add.textContent = "＋";
        add.title = "Add to playlist";
        add.addEventListener("click", () => openPlaylistDialog(track.id));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.title = "Delete local track";
        remove.addEventListener("click", () => deleteTrack(track));
        actions.append(add, remove);

        row.append(play, title, artist, album, length, actions);
        return row;
    }

    async function createPlaylist() {
        const raw = prompt("Playlist name:");
        const name = safeContent.normalizeText(raw, { maxLength: 80 });
        if (!name) return;
        const now = new Date().toISOString();
        const playlist = { id: uid(), name, trackIds: [], createdAt: now, updatedAt: now };
        await database.playlists.put(playlist);
        state.playlists.push(playlist);
        state.activePlaylistId = playlist.id;
        renderPlaylists();
        renderTracks();
    }

    async function renamePlaylist(playlist) {
        const raw = prompt("Rename playlist:", playlist.name);
        const name = safeContent.normalizeText(raw, { maxLength: 80 });
        if (!name || name === playlist.name) return;
        Object.assign(playlist, { name, updatedAt: new Date().toISOString() });
        await database.playlists.put(playlist);
        renderPlaylists();
        renderTracks();
    }

    async function deletePlaylist(playlist) {
        if (!confirm(`Delete playlist "${playlist.name}"? Music files will remain in the library.`)) return;
        await database.playlists.remove(playlist.id);
        state.playlists = state.playlists.filter(item => item.id !== playlist.id);
        if (state.activePlaylistId === playlist.id) state.activePlaylistId = "all";
        renderPlaylists();
        renderTracks();
    }

    function openPlaylistDialog(trackId) {
        state.pendingPlaylistTrackId = trackId;
        const list = $("playlistDialogList");
        list.replaceChildren();
        if (!state.playlists.length) {
            const create = document.createElement("button");
            create.type = "button";
            create.textContent = "Create your first playlist";
            create.addEventListener("click", async () => {
                $("playlistDialog").close();
                await createPlaylist();
                if (state.activePlaylistId !== "all") await addTrackToPlaylist(trackId, state.activePlaylistId);
            });
            list.appendChild(create);
        } else {
            for (const playlist of state.playlists) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = playlist.name;
                button.disabled = playlist.trackIds?.includes(trackId);
                button.addEventListener("click", async () => {
                    await addTrackToPlaylist(trackId, playlist.id);
                    $("playlistDialog").close();
                });
                list.appendChild(button);
            }
        }
        $("playlistDialog").showModal();
    }

    async function addTrackToPlaylist(trackId, playlistId) {
        const playlist = await addTracksToPlaylist([trackId], playlistId);
        if (!playlist) return;
        toast(`Added to ${playlist.name}.`);
    }

    async function addTracksToPlaylist(trackIds, playlistId) {
        const playlist = state.playlists.find(item => item.id === playlistId);
        if (!playlist) return null;
        playlist.trackIds = [...new Set([...(playlist.trackIds || []), ...trackIds])];
        playlist.updatedAt = new Date().toISOString();
        await database.playlists.put(playlist);
        renderPlaylists();
        return playlist;
    }

    function openFolderPlaylistDialog() {
        const dialog = $("folderPlaylistDialog");
        const list = $("folderPlaylistDialogList");
        list.replaceChildren();

        const libraryOnly = document.createElement("button");
        libraryOnly.type = "button";
        libraryOnly.textContent = "Music Library only";
        libraryOnly.addEventListener("click", () => chooseFolderPlaylist(null));
        list.appendChild(libraryOnly);

        for (const playlist of [...state.playlists].sort((a, b) => a.name.localeCompare(b.name))) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = playlist.name;
            button.addEventListener("click", () => chooseFolderPlaylist(playlist.id));
            list.appendChild(button);
        }

        dialog.showModal();
    }

    function chooseFolderPlaylist(playlistId) {
        state.pendingFolderPlaylistId = playlistId;
        $("folderPlaylistDialog").close();
        $("folderInput").click();
    }

    async function deleteTrack(track) {
        if (!confirm(`Delete "${track.title}" from this device? This cannot be undone.`)) return;
        player.removeTrack(track.id);
        await storage.removeTrackFiles(track);
        await database.tracks.remove(track.id);
        await refreshLibrary();
        toast("Track deleted from local storage.");
    }

    async function importFiles(fileList, { playlistId = null } = {}) {
        const files = [...fileList].filter(isAudioFile);
        if (!files.length) {
            toast("No supported audio files were selected.");
            return;
        }

        const status = await storage.status();
        if (!status.supported) {
            toast("This browser cannot store music locally. Use current Chrome or Edge.");
            return;
        }
        const required = files.reduce((sum, file) => sum + file.size, 0);
        if (status.quota && required > Math.max(0, status.quota - status.usage)) {
            toast(`Not enough browser storage. Selected ${formatBytes(required)}.`);
            return;
        }

        await storage.requestPersistence().catch(() => false);
        const dialog = $("importDialog");
        $("importProgress").max = files.length;
        $("importProgress").value = 0;
        $("importCount").textContent = `0 / ${files.length}`;
        dialog.showModal();

        let imported = 0;
        let duplicates = 0;
        let failed = 0;
        const playlistTrackIds = new Set();

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            $("importMessage").textContent = `Reading ${file.name}`;
            try {
                const fileFingerprint = await fingerprint(file);
                const duplicate = await database.tracks.findByFingerprint(fileFingerprint);
                if (duplicate) {
                    duplicates += 1;
                    playlistTrackIds.add(duplicate.id);
                } else {
                    const tags = await metadata.parse(file);
                    const id = uid();
                    let filePath = null;
                    let artworkPath = null;
                    try {
                        $("importMessage").textContent = `Saving ${tags.title || file.name}`;
                        filePath = await storage.saveAudio(id, file);
                        artworkPath = await storage.saveArtwork(id, tags.artwork);
                        const track = {
                            id,
                            fingerprint: fileFingerprint,
                            filePath,
                            artworkPath,
                            artworkType: tags.artwork?.type || null,
                            originalName: file.name,
                            type: file.type || "audio/mpeg",
                            size: file.size,
                            lastModified: file.lastModified,
                            title: safeContent.normalizeText(tags.title, { maxLength: 300 }),
                            artist: safeContent.normalizeText(tags.artist, { maxLength: 300 }),
                            albumArtist: safeContent.normalizeText(tags.albumArtist, { maxLength: 300 }),
                            album: safeContent.normalizeText(tags.album, { maxLength: 300 }),
                            composer: safeContent.normalizeText(tags.composer, { maxLength: 300 }),
                            year: safeContent.normalizeText(tags.year, { maxLength: 20 }),
                            trackNumber: safeContent.normalizeText(tags.trackNumber, { maxLength: 30 }),
                            discNumber: safeContent.normalizeText(tags.discNumber, { maxLength: 30 }),
                            genre: safeContent.normalizeText(tags.genre, { maxLength: 120 }),
                            comment: safeContent.normalizeText(tags.comment, { trim: false, maxLength: 5000 }),
                            lyrics: safeContent.normalizeText(tags.lyrics, { trim: false, maxLength: 100000 }),
                            rawTextTags: normalizeTagMap(tags.rawTextTags),
                            duration: Number(tags.duration) || 0,
                            addedAt: new Date().toISOString()
                        };
                        await database.tracks.put(track);
                        playlistTrackIds.add(track.id);
                        imported += 1;
                    } catch (error) {
                        await storage.removeTrackFiles({ filePath, artworkPath }).catch(() => {});
                        throw error;
                    }
                }
            } catch (error) {
                failed += 1;
                console.error(`Could not import ${file.name}:`, error);
            }

            $("importProgress").value = index + 1;
            $("importCount").textContent = `${index + 1} / ${files.length}`;
        }

        let destinationPlaylist = null;
        if (playlistId && playlistTrackIds.size) {
            destinationPlaylist = await addTracksToPlaylist([...playlistTrackIds], playlistId);
        }
        dialog.close();
        await refreshLibrary();
        const destination = destinationPlaylist ? ` Added ${playlistTrackIds.size} to ${destinationPlaylist.name}.` : "";
        toast(`Imported ${imported}. Skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}${failed ? `. Failed ${failed}` : ""}.${destination}`);
    }

    async function renderStorageStatus() {
        const status = await storage.status();
        const banner = $("storageBanner");
        const persistButton = $("persistStorageButton");
        banner.classList.toggle("is-warning", !status.supported || !status.persisted);
        if (!status.supported) {
            $("storageStatus").textContent = "LOCAL MUSIC STORAGE UNSUPPORTED — USE CURRENT CHROME OR EDGE";
            persistButton.hidden = true;
            return;
        }
        const usage = status.quota ? `${formatBytes(status.usage)} USED OF ${formatBytes(status.quota)}` : `${formatBytes(status.usage)} USED`;
        $("storageStatus").textContent = `${status.persisted ? "PERSISTENT STORAGE" : "STORAGE CAN BE EVICTED"} · ${usage}`;
        persistButton.hidden = status.persisted;
    }

    function handlePlaybackError(error) {
        console.error("Music playback failed:", error);
        if (error?.name === "NotAllowedError") toast("Android blocked the first start. Tap the main Play button once.");
        else toast(error?.message || "Could not play this track.");
    }

    function renderPlayerTrack({ track, artwork }) {
        if (!track) {
            $("playerTitle").textContent = "Nothing playing";
            $("playerArtist").textContent = "Choose a track from your library";
            const emptyArtwork = $("playerArtwork");
            emptyArtwork.replaceChildren();
            const note = document.createElement("span");
            note.textContent = "♫";
            emptyArtwork.appendChild(note);
            renderTracks();
            return;
        }
        $("playerTitle").textContent = track.title || "Unknown track";
        $("playerArtist").textContent = `${track.artist || "Unknown Artist"} · ${track.album || "Unknown Album"}`;
        const container = $("playerArtwork");
        container.replaceChildren();
        if (artwork) {
            const image = document.createElement("img");
            image.src = artwork;
            image.alt = "";
            container.appendChild(image);
        } else {
            const note = document.createElement("span");
            note.textContent = "♫";
            container.appendChild(note);
        }
        renderTracks();
    }

    function renderPlayerState({ playing, shuffle, repeat, volume }) {
        $("playButton").textContent = playing ? "Ⅱ" : "▶";
        $("playButton").setAttribute("aria-label", playing ? "Pause" : "Play");
        $("shuffleButton").classList.toggle("active", Boolean(shuffle));
        $("repeatButton").classList.toggle("active", repeat !== "off");
        $("repeatButton").textContent = repeat === "one" ? "↻1" : "↻";
        if (volume !== undefined) $("volumeControl").value = volume;
    }

    function renderPlayerTime({ current, duration }) {
        $("elapsedTime").textContent = formatTime(current);
        $("totalTime").textContent = formatTime(duration);
        $("seekBar").max = Number.isFinite(duration) && duration > 0 ? duration : 100;
        if (!$("seekBar").matches(":active")) $("seekBar").value = current || 0;
    }

    const player = new window.JAIMIEMusicPlayer({
        audio: $("audioElement"),
        database,
        storage,
        onTrack: renderPlayerTrack,
        onState: renderPlayerState,
        onTime: renderPlayerTime,
        onError: handlePlaybackError
    });

    function bind() {
        $("importFilesButton").addEventListener("click", () => $("fileInput").click());
        $("importFolderButton").addEventListener("click", openFolderPlaylistDialog);
        $("fileInput").addEventListener("change", event => {
            importFiles(event.target.files).finally(() => { event.target.value = ""; });
        });
        $("folderInput").addEventListener("change", event => {
            const playlistId = state.pendingFolderPlaylistId;
            state.pendingFolderPlaylistId = null;
            importFiles(event.target.files, { playlistId }).finally(() => { event.target.value = ""; });
        });
        $("persistStorageButton").addEventListener("click", async () => {
            const persisted = await storage.requestPersistence();
            await renderStorageStatus();
            toast(persisted ? "Persistent storage enabled." : "Chrome did not grant persistent storage.");
        });
        $("createPlaylistButton").addEventListener("click", createPlaylist);
        $("musicSearch").addEventListener("input", event => {
            state.search = event.target.value;
            renderTracks();
        });
        $("musicSort").addEventListener("change", event => {
            state.sort = event.target.value;
            renderTracks();
        });
        $("playButton").addEventListener("click", () => {
            if (!player.currentTrack && visibleTracks().length) {
                const queue = visibleTracks().map(track => track.id);
                player.playTrack(queue[0], queue).catch(handlePlaybackError);
            } else if (player.audio.paused) player.play().catch(handlePlaybackError);
            else player.pause();
        });
        $("previousButton").addEventListener("click", () => player.previous());
        $("nextButton").addEventListener("click", () => player.next());
        $("shuffleButton").addEventListener("click", () => player.toggleShuffle());
        $("repeatButton").addEventListener("click", () => player.cycleRepeat());
        $("seekBar").addEventListener("input", event => player.seek(Number(event.target.value)));
        $("volumeControl").addEventListener("input", event => player.setVolume(event.target.value));
    }

    async function init() {
        try {
            await database.open();
            bind();
            await player.restore();
            await refreshLibrary();
            if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
                navigator.serviceWorker.register("../sw.js").catch(error => console.warn("Music PWA registration failed:", error));
            }
        } catch (error) {
            console.error("JAIMIE Music failed to initialize:", error);
            $("storageBanner").classList.add("is-warning");
            $("storageStatus").textContent = error.message || "Music storage could not initialize.";
        }
    }

    init();
})();
