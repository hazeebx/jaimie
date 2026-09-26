(() => {
    "use strict";

    const DATA_KEY = "cartographer";
    const DEFAULT_CENTER = [46.6753, 24.7136];
    const model = window.JAIMIEGeoModel;
    const safe = window.JAIMIESafeContent;
    const $ = id => document.getElementById(id);
    let data = { cameras: [], settings: { warningRadius: 500, directionTolerance: 45, audio: true, mapTheme: "light" }, lastCaptureId: null };
    let position = null;
    let watchId = null;
    let map = null;
    let positionMarker = null;
    let driverActive = false;
    let miniMapFollowing = true;
    let previousPosition = null;
    let journeyPoints = [];
    const alertedIds = new Set();

    function id(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    async function persist() {
        await window.JAIMIEData.save(DATA_KEY, data);
        render();
    }

    async function load() {
        const stored = await window.JAIMIEData.load(DATA_KEY);
        if (stored && typeof stored === "object") data = { ...data, ...stored, settings: { ...data.settings, ...(stored.settings || {}) }, cameras: Array.isArray(stored.cameras) ? stored.cameras : [] };
        $("radiusSelect").value = String(data.settings.warningRadius || 500);
        $("audioToggle").checked = data.settings.audio !== false;
        applyMapTheme();
        render();
    }

    function initMap() {
        if (!window.maplibregl) {
            $("mapFallback").classList.remove("hidden");
            return;
        }
        try {
            map = new maplibregl.Map({
                container: "map",
                center: DEFAULT_CENTER,
                zoom: 10,
                attributionControl: true,
                style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] }
            });
            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
            map.on("load", () => {
                map.addSource("cameras", { type: "geojson", data: model.cameraFeatureCollection(data.cameras) });
                map.addLayer({ id: "camera-points", type: "circle", source: "cameras", paint: { "circle-radius": 7, "circle-color": ["case", ["get", "active"], "#ff892e", "#74777e"], "circle-stroke-width": 2, "circle-stroke-color": "#121315" } });
                map.addSource("journey-trail", { type: "geojson", data: trailFeature() });
                map.addLayer({ id: "journey-trail-line", type: "line", source: "journey-trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#5ca9ff", "line-width": 4, "line-opacity": 0.8 } });
                map.on("click", "camera-points", event => {
                    const camera = data.cameras.find(item => item.id === event.features?.[0]?.properties?.id);
                    if (camera) openEditor(camera.id);
                });
                map.on("mouseenter", "camera-points", () => { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", "camera-points", () => { map.getCanvas().style.cursor = ""; });
                updateMapData();
            });
            ["dragstart", "zoomstart", "rotatestart"].forEach(eventName => map.on(eventName, event => {
                if (driverActive && event.originalEvent) setMiniMapFollowing(false);
            }));
            map.on("error", event => console.warn("Cartographer map:", event.error));
        } catch (error) {
            console.warn("Cartographer map unavailable:", error);
            $("mapFallback").classList.remove("hidden");
        }
    }

    function updateMapData() {
        const source = map?.getSource("cameras");
        if (source) source.setData(model.cameraFeatureCollection(data.cameras));
    }

    function trailFeature() {
        return {
            type: "FeatureCollection",
            features: journeyPoints.length < 2 ? [] : [{
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: journeyPoints.map(point => [point.longitude, point.latitude]) }
            }]
        };
    }

    function updateTrail() {
        const source = map?.getSource("journey-trail");
        if (source) source.setData(trailFeature());
    }

    function enableGps() {
        if (!navigator.geolocation) {
            setGpsState("GPS unavailable", "This browser does not expose geolocation.", false);
            return;
        }
        if (watchId !== null) return;
        setGpsState("Requesting GPS permission", "Approve the browser prompt to continue.", false);
        watchId = navigator.geolocation.watchPosition(onPosition, error => {
            setGpsState("GPS unavailable", error.message || "Permission was denied.", false);
            $("gpsButton").textContent = "Retry GPS";
            watchId = null;
        }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
        $("gpsButton").textContent = "GPS requested";
    }

    function onPosition(event) {
        previousPosition = position;
        position = { latitude: event.coords.latitude, longitude: event.coords.longitude, accuracy: event.coords.accuracy, heading: Number.isFinite(event.coords.heading) ? event.coords.heading : null, speed: Number.isFinite(event.coords.speed) ? Math.max(0, event.coords.speed) : null, timestamp: event.timestamp };
        if (position.heading === null && previousPosition && model.haversineMeters(previousPosition, position) >= 3) position.heading = model.bearingDegrees(previousPosition, position);
        if (position.speed === null && previousPosition && position.timestamp > previousPosition.timestamp) position.speed = model.haversineMeters(previousPosition, position) / ((position.timestamp - previousPosition.timestamp) / 1000);
        setGpsState("GPS locked", `${Math.round(position.accuracy)} m accuracy${position.heading === null ? "" : ` · ${Math.round(position.heading)}° bearing`}`, true);
        $("gpsButton").textContent = "GPS active";
        $("captureButton").disabled = false;
        $("driverButton").disabled = false;
        $("addSpeedCameraButton").disabled = false;
        $("addCheckPostButton").disabled = false;
        if (map) {
            const location = [position.longitude, position.latitude];
            if (!positionMarker) {
                const markerElement = document.createElement("div");
                markerElement.className = "user-marker";
                positionMarker = new maplibregl.Marker({ element: markerElement, rotationAlignment: "viewport" }).setLngLat(location).addTo(map);
            }
            else positionMarker.setLngLat(location);
            if (!map.__jaimieLocated) { map.flyTo({ center: location, zoom: 15 }); map.__jaimieLocated = true; }
        }
        renderStats();
        if (driverActive) {
            addJourneyPoint(position);
            updateMiniMap();
            checkDriverAlert();
        }
    }

    function setGpsState(title, detail, live) {
        safe.setText($("gpsStatus"), title);
        safe.setText($("gpsDetail"), detail);
        $("gpsDot").classList.toggle("live", live);
    }

    function applyMapTheme() {
        const dark = data.settings.mapTheme === "dark";
        document.querySelector(".map-panel")?.classList.toggle("dark-map", dark);
        $("mapThemeButton").setAttribute("aria-pressed", String(dark));
        $("mapThemeButton").textContent = dark ? "☀ Light map" : "☾ Dark map";
    }

    async function toggleMapTheme() {
        data.settings.mapTheme = data.settings.mapTheme === "dark" ? "light" : "dark";
        applyMapTheme();
        await persist();
    }

    function markerLabel(type) {
        if (type === "speed-camera") return "Speed camera";
        if (type === "check-post") return "Check post";
        return "Camera";
    }

    async function captureMarker(type = "unknown", { openEditorAfter = false, messageTarget = "captureMessage" } = {}) {
        if (!position) return;
        const recordId = id("camera");
        const duplicate = model.possibleDuplicate(data.cameras, position, 30);
        const now = new Date().toISOString();
        const prefix = type === "speed-camera" ? "SPEED" : type === "check-post" ? "POST" : "LOCAL";
        const camera = {
            id: recordId,
            cameraId: `${prefix}-${Date.now().toString(36).toUpperCase()}`,
            latitude: position.latitude,
            longitude: position.longitude,
            type,
            direction: position.heading,
            speedLimit: null,
            active: true,
            gpsAccuracy: position.accuracy,
            source: "cartographer",
            confidence: 0.5,
            createdAt: now,
            updatedAt: now,
            notes: "",
            possibleDuplicateOf: duplicate?.camera?.id || null,
            verification: { status: "captured", verifiedAt: null }
        };
        data.cameras.unshift(camera);
        data.lastCaptureId = recordId;
        await persist();
        const label = markerLabel(type);
        $(messageTarget).textContent = duplicate
            ? `${label} saved. Possible duplicate ${Math.round(duplicate.distance)} m away.`
            : `${label} saved at your current position.`;
        if (openEditorAfter) openEditor(recordId);
    }

    async function undoLast() {
        const camera = data.cameras.find(item => item.id === data.lastCaptureId);
        if (!camera || !confirm(`Undo the last capture (${camera.cameraId})?`)) return;
        data.cameras = data.cameras.filter(item => item.id !== camera.id);
        data.lastCaptureId = null;
        await persist();
        $("captureMessage").textContent = "Last capture removed.";
    }

    function setMode(mode) {
        const driver = mode === "driver";
        document.querySelectorAll(".mode-button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
        $("cartographerPanel").classList.toggle("hidden", driver);
        $("driverPanel").classList.toggle("hidden", !driver);
        if (!driver && driverActive) stopDriver();
    }

    function toggleDriver() {
        if (!position) return;
        if (driverActive) stopDriver();
        else startDriver();
    }

    function startDriver() {
        driverActive = true;
        journeyPoints = [];
        alertedIds.clear();
        setMiniMapFollowing(true);
        addJourneyPoint(position, true);
        $("driverButton").textContent = "Stop Mini-map";
        $("driverButton").classList.add("running");
        $("driveHud").classList.remove("hidden");
        $("recenterButton").classList.remove("hidden");
        updateMiniMap(true);
        checkDriverAlert();
    }

    function stopDriver() {
        driverActive = false;
        journeyPoints = [];
        alertedIds.clear();
        updateTrail();
        setDriverAlert(null);
        $("driverButton").textContent = "Start Mini-map";
        $("driverButton").classList.remove("running");
        $("driveHud").classList.add("hidden");
        $("recenterButton").classList.add("hidden");
        if (map) map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    }

    function addJourneyPoint(point, force = false) {
        const last = journeyPoints.at(-1);
        if (!force && last && model.haversineMeters(last, point) < 3) return;
        journeyPoints.push({ latitude: point.latitude, longitude: point.longitude, timestamp: point.timestamp });
        if (journeyPoints.length > 150) journeyPoints = journeyPoints.slice(-150);
        updateTrail();
    }

    function miniMapZoom(speedMetersPerSecond) {
        const speed = Number(speedMetersPerSecond) || 0;
        if (speed >= 25) return 14;
        if (speed >= 12) return 14.7;
        if (speed >= 5) return 15.3;
        return 16;
    }

    function updateMiniMap(immediate = false) {
        if (!map || !position) return;
        const speedKmh = Math.round((Number(position.speed) || 0) * 3.6);
        $("driveSpeed").textContent = `${speedKmh} km/h`;
        $("driveHeading").textContent = position.heading === null ? "—" : `${Math.round(position.heading)}°`;
        if (!miniMapFollowing) return;
        map.easeTo({ center: [position.longitude, position.latitude], bearing: position.heading ?? map.getBearing(), pitch: 45, zoom: miniMapZoom(position.speed), duration: immediate ? 0 : 700, essential: true });
    }

    function setMiniMapFollowing(following) {
        miniMapFollowing = following;
        $("recenterButton").classList.toggle("detached", !following);
        $("recenterButton").textContent = following ? "⌖ Following" : "⌖ Recenter";
    }

    function recenterMiniMap() {
        setMiniMapFollowing(true);
        updateMiniMap(true);
    }

    function checkDriverAlert() {
        for (const camera of data.cameras) {
            if (model.haversineMeters(position, camera) > Math.max(1000, data.settings.warningRadius * 2)) alertedIds.delete(camera.id);
        }
        const match = model.findRelevantCamera(data.cameras, position, data.settings, alertedIds);
        if (!match) return;
        alertedIds.add(match.camera.id);
        setDriverAlert(match);
        if (data.settings.audio && "speechSynthesis" in window) {
            speechSynthesis.cancel();
            speechSynthesis.speak(new SpeechSynthesisUtterance(`${markerLabel(match.camera.type)} ahead in ${Math.max(10, Math.round(match.distance / 10) * 10)} meters`));
        }
    }

    function setDriverAlert(match) {
        const alert = $("driverAlert");
        alert.classList.toggle("active", Boolean(match));
        alert.replaceChildren();
        const label = document.createElement("span");
        label.textContent = match ? `${markerLabel(match.camera.type)} ahead` : "No active alert";
        const value = document.createElement("strong");
        value.textContent = match ? `${Math.round(match.distance)} m · ${match.camera.type}` : (driverActive ? "Monitoring your route" : "Monitoring is off");
        alert.append(label, value);
    }

    function render() {
        renderStats();
        renderList();
        updateMapData();
        const today = new Date().toLocaleDateString("en-CA");
        const todayCount = data.cameras.filter(camera => String(camera.createdAt || "").slice(0, 10) === today).length;
        $("todayCount").textContent = `${todayCount} captured today`;
        $("undoButton").disabled = !data.lastCaptureId || !data.cameras.some(camera => camera.id === data.lastCaptureId);
    }

    function renderStats() {
        $("totalCount").textContent = String(data.cameras.length);
        $("activeCount").textContent = String(data.cameras.filter(camera => camera.active !== false).length);
        const nearest = position ? model.camerasByDistance(data.cameras, position)[0] : null;
        $("nearestDistance").textContent = nearest ? (nearest.distance < 1000 ? `${Math.round(nearest.distance)} m` : `${(nearest.distance / 1000).toFixed(1)} km`) : "—";
    }

    function renderList() {
        const list = $("cameraList");
        list.replaceChildren();
        if (!data.cameras.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "No camera captures yet. Enable GPS and use Add camera.";
            list.append(empty);
            return;
        }
        data.cameras.slice(0, 12).forEach(camera => {
            const card = document.createElement("article");
            card.className = "camera-card";
            const head = document.createElement("div");
            head.className = "camera-card-head";
            const title = document.createElement("div");
            const h3 = document.createElement("h3"); h3.textContent = camera.cameraId;
            const date = document.createElement("small"); date.textContent = new Date(camera.createdAt).toLocaleString();
            title.append(h3, date);
            const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => openEditor(camera.id));
            head.append(title, edit);
            const coordinates = document.createElement("div"); coordinates.className = "camera-coordinates"; coordinates.textContent = `${Number(camera.latitude).toFixed(6)}, ${Number(camera.longitude).toFixed(6)} · ±${Math.round(camera.gpsAccuracy || 0)} m`;
            const badges = document.createElement("div"); badges.className = "camera-badges";
            [camera.type, camera.active !== false ? "active" : "inactive", camera.possibleDuplicateOf ? "possible duplicate" : null].filter(Boolean).forEach((value, index) => { const badge = document.createElement("span"); badge.className = `badge${index === 1 && camera.active !== false ? " active" : ""}`; badge.textContent = value; badges.append(badge); });
            card.append(head, coordinates, badges);
            list.append(card);
        });
    }

    function openEditor(cameraId) {
        const camera = data.cameras.find(item => item.id === cameraId);
        if (!camera) return;
        $("cameraRecordId").value = camera.id;
        $("cameraId").value = camera.cameraId || camera.id;
        $("cameraType").value = camera.type || "unknown";
        $("cameraDirection").value = camera.direction ?? "";
        $("speedLimit").value = camera.speedLimit ?? "";
        $("cameraConfidence").value = String(camera.confidence ?? 0.5);
        $("cameraNotes").value = camera.notes || "";
        $("cameraActive").checked = camera.active !== false;
        $("cameraDialog").showModal();
    }

    async function saveEditor(event) {
        event.preventDefault();
        const camera = data.cameras.find(item => item.id === $("cameraRecordId").value);
        if (!camera) return;
        camera.cameraId = safe.normalizeText($("cameraId").value, { maxLength: 80 });
        camera.type = $("cameraType").value;
        camera.direction = $("cameraDirection").value === "" ? null : Number($("cameraDirection").value);
        camera.speedLimit = $("speedLimit").value === "" ? null : Number($("speedLimit").value);
        camera.confidence = Number($("cameraConfidence").value);
        camera.notes = safe.normalizeText($("cameraNotes").value, { maxLength: 500 });
        camera.active = $("cameraActive").checked;
        camera.updatedAt = new Date().toISOString();
        camera.verification = { ...(camera.verification || {}), status: camera.confidence === 1 ? "verified" : "captured", verifiedAt: camera.confidence === 1 ? new Date().toISOString() : null };
        await persist();
        $("cameraDialog").close();
    }

    async function deleteCamera() {
        const camera = data.cameras.find(item => item.id === $("cameraRecordId").value);
        if (!camera || !confirm(`Delete ${camera.cameraId}? This cannot be undone.`)) return;
        data.cameras = data.cameras.filter(item => item.id !== camera.id);
        if (data.lastCaptureId === camera.id) data.lastCaptureId = null;
        await persist();
        $("cameraDialog").close();
    }

    document.querySelectorAll(".mode-button").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    $("gpsButton").addEventListener("click", enableGps);
    $("captureButton").addEventListener("click", () => captureMarker("unknown", { openEditorAfter: true }));
    $("undoButton").addEventListener("click", undoLast);
    $("driverButton").addEventListener("click", toggleDriver);
    $("addSpeedCameraButton").addEventListener("click", () => captureMarker("speed-camera", { messageTarget: "driverCaptureMessage" }));
    $("addCheckPostButton").addEventListener("click", () => captureMarker("check-post", { messageTarget: "driverCaptureMessage" }));
    $("recenterButton").addEventListener("click", recenterMiniMap);
    $("mapThemeButton").addEventListener("click", toggleMapTheme);
    $("radiusSelect").addEventListener("change", async event => { data.settings.warningRadius = Number(event.target.value); await persist(); });
    $("audioToggle").addEventListener("change", async event => { data.settings.audio = event.target.checked; await persist(); });
    $("cameraForm").addEventListener("submit", saveEditor);
    $("deleteCamera").addEventListener("click", deleteCamera);
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $("cameraDialog").close()));
    window.addEventListener("beforeunload", () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); });

    if (window.maplibregl) {
        initMap();
    } else {
        window.addEventListener("jaimie-maplibre-ready", initMap, { once: true });
        window.setTimeout(() => {
            if (!window.maplibregl && !map) $("mapFallback").classList.remove("hidden");
        }, 5000);
    }
    load().catch(error => { console.error("Cartographer failed to load:", error); $("captureMessage").textContent = "Cartographer data could not load."; });
})();
