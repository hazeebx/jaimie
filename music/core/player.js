(() => {
    "use strict";

    class MusicPlayer {
        constructor({ audio, database, storage, onTrack, onState, onTime, onError }) {
            this.audio = audio;
            this.database = database;
            this.storage = storage;
            this.onTrack = onTrack || (() => {});
            this.onState = onState || (() => {});
            this.onTime = onTime || (() => {});
            this.onError = onError || (() => {});
            this.queue = [];
            this.index = -1;
            this.currentTrack = null;
            this.shuffle = false;
            this.repeat = "off";
            this.audioUrl = null;
            this.artworkUrl = null;
            this.bindAudio();
            this.bindMediaSession();
        }

        bindAudio() {
            this.audio.addEventListener("play", () => {
                this.setMediaPlaybackState("playing");
                this.onState({ playing: true, shuffle: this.shuffle, repeat: this.repeat });
            });
            this.audio.addEventListener("pause", () => {
                this.setMediaPlaybackState("paused");
                this.onState({ playing: false, shuffle: this.shuffle, repeat: this.repeat });
            });
            this.audio.addEventListener("timeupdate", () => {
                this.onTime({ current: this.audio.currentTime || 0, duration: this.audio.duration || 0 });
                this.updatePositionState();
            });
            this.audio.addEventListener("durationchange", () => {
                this.onTime({ current: this.audio.currentTime || 0, duration: this.audio.duration || 0 });
            });
            this.audio.addEventListener("ended", () => {
                if (this.repeat === "one") {
                    this.audio.currentTime = 0;
                    this.audio.play().catch(error => this.onError(error));
                    return;
                }
                this.next(true);
            });
            this.audio.addEventListener("error", () => {
                this.onError(new Error("This audio file could not be played by the browser."));
            });
        }

        bindMediaSession() {
            if (!("mediaSession" in navigator)) return;
            const handlers = {
                play: () => this.play(),
                pause: () => this.pause(),
                previoustrack: () => this.previous(),
                nexttrack: () => this.next(),
                seekbackward: details => this.seek(Math.max(0, this.audio.currentTime - (details.seekOffset || 10))),
                seekforward: details => this.seek(Math.min(this.audio.duration || Infinity, this.audio.currentTime + (details.seekOffset || 10))),
                seekto: details => this.seek(details.seekTime || 0),
                stop: () => this.stop()
            };
            for (const [action, handler] of Object.entries(handlers)) {
                try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
            }
        }

        setMediaPlaybackState(state) {
            if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
        }

        updatePositionState() {
            if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
            const duration = this.audio.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;
            try {
                navigator.mediaSession.setPositionState({
                    duration,
                    playbackRate: this.audio.playbackRate || 1,
                    position: Math.min(this.audio.currentTime || 0, duration)
                });
            } catch { /* transient metadata state */ }
        }

        async setQueue(trackIds, startId = null) {
            this.queue = [...new Set(trackIds.filter(Boolean))];
            if (startId) this.index = this.queue.indexOf(startId);
            else if (!this.queue.includes(this.currentTrack?.id)) this.index = this.queue.length ? 0 : -1;
        }

        async playTrack(trackId, queue = null) {
            if (queue) await this.setQueue(queue, trackId);
            else if (!this.queue.includes(trackId)) await this.setQueue([trackId], trackId);

            const track = await this.database.tracks.get(trackId);
            if (!track) throw new Error("Track is no longer in the library.");
            const file = await this.storage.audioFile(track);
            if (!file) throw new Error("The locally stored audio file is missing.");

            this.revokeUrls();
            this.currentTrack = track;
            this.index = this.queue.indexOf(trackId);
            this.audioUrl = URL.createObjectURL(file);
            this.audio.src = this.audioUrl;

            let artwork = null;
            if (track.artworkPath) {
                try {
                    const artworkFile = await this.storage.artworkFile(track);
                    if (artworkFile) {
                        this.artworkUrl = URL.createObjectURL(artworkFile);
                        artwork = this.artworkUrl;
                    }
                } catch { /* artwork is optional */ }
            }

            this.updateMediaMetadata(track, artwork);
            this.onTrack({ track, artwork });
            await this.audio.play();
            await this.database.settings.set("lastTrackId", track.id);
        }

        updateMediaMetadata(track, artwork) {
            if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
            const artworkEntries = artwork
                ? [{ src: artwork, sizes: "512x512", type: track.artworkType || "image/jpeg" }]
                : [{ src: new URL("../assets/jaimie-music.svg", location.href).href, sizes: "any", type: "image/svg+xml" }];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || "Unknown track",
                artist: track.artist || "Unknown Artist",
                album: track.album || "Unknown Album",
                artwork: artworkEntries
            });
        }

        async play() {
            if (!this.audio.src) {
                const id = this.currentTrack?.id || this.queue[this.index] || this.queue[0];
                if (id) return this.playTrack(id);
                return;
            }
            return this.audio.play();
        }

        pause() { this.audio.pause(); }

        stop() {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.setMediaPlaybackState("none");
        }

        removeTrack(trackId) {
            const removedIndex = this.queue.indexOf(trackId);
            this.queue = this.queue.filter(id => id !== trackId);
            if (removedIndex !== -1 && removedIndex < this.index) this.index -= 1;

            if (this.currentTrack?.id !== trackId) return;
            this.stop();
            this.revokeUrls();
            this.audio.removeAttribute("src");
            this.audio.load();
            this.currentTrack = null;
            this.index = Math.min(this.index, this.queue.length - 1);
            if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
            this.onTrack({ track: null, artwork: null });
            this.onTime({ current: 0, duration: 0 });
        }

        seek(seconds) {
            if (Number.isFinite(seconds)) this.audio.currentTime = Math.max(0, seconds);
        }

        async next(fromEnded = false) {
            if (!this.queue.length) return;
            if (this.shuffle && this.queue.length > 1) {
                let nextIndex = this.index;
                while (nextIndex === this.index) nextIndex = Math.floor(Math.random() * this.queue.length);
                this.index = nextIndex;
            } else if (this.index < this.queue.length - 1) {
                this.index += 1;
            } else if (this.repeat === "all") {
                this.index = 0;
            } else {
                if (fromEnded) this.stop();
                return;
            }
            return this.playTrack(this.queue[this.index]).catch(error => this.onError(error));
        }

        async previous() {
            if (this.audio.currentTime > 4) {
                this.audio.currentTime = 0;
                return;
            }
            if (!this.queue.length) return;
            this.index = this.index > 0 ? this.index - 1 : (this.repeat === "all" ? this.queue.length - 1 : 0);
            return this.playTrack(this.queue[this.index]).catch(error => this.onError(error));
        }

        toggleShuffle() {
            this.shuffle = !this.shuffle;
            this.onState({ playing: !this.audio.paused, shuffle: this.shuffle, repeat: this.repeat });
            this.database.settings.set("shuffle", this.shuffle);
            return this.shuffle;
        }

        cycleRepeat() {
            this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
            this.onState({ playing: !this.audio.paused, shuffle: this.shuffle, repeat: this.repeat });
            this.database.settings.set("repeat", this.repeat);
            return this.repeat;
        }

        async restore() {
            this.shuffle = Boolean(await this.database.settings.get("shuffle", false));
            this.repeat = await this.database.settings.get("repeat", "off");
            const volume = Number(await this.database.settings.get("volume", 0.8));
            this.audio.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.8;
            this.onState({ playing: false, shuffle: this.shuffle, repeat: this.repeat, volume: this.audio.volume });
        }

        setVolume(value) {
            this.audio.volume = Math.min(1, Math.max(0, Number(value) || 0));
            this.database.settings.set("volume", this.audio.volume);
        }

        revokeUrls() {
            if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
            if (this.artworkUrl) URL.revokeObjectURL(this.artworkUrl);
            this.audioUrl = null;
            this.artworkUrl = null;
        }
    }

    window.JAIMIEMusicPlayer = MusicPlayer;
})();
