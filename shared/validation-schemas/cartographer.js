(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) throw new Error("Cartographer schema requires JAIMIE validation and safe-content services.");

    const TYPES = new Set(["speed-camera", "check-post", "fixed", "mobile", "red-light", "average-speed", "unknown"]);
    const VERIFICATION = new Set(["captured", "verified", "rejected"]);

    function issue(issues, code, message, path, severity = "error") {
        issues.push({ code, message, path, severity });
    }

    function finite(value, path, label, issues, { min = -Infinity, max = Infinity, optional = false } = {}) {
        if (optional && (value === "" || value === null || value === undefined)) return null;
        const result = Number(value);
        if (!Number.isFinite(result) || result < min || result > max) {
            issue(issues, "cartographer.number.invalid", `${label} is invalid.`, path);
            return null;
        }
        return result;
    }

    function text(value, maxLength = 120) {
        return safeContent.normalizeText(value, { maxLength });
    }

    function validateCartographer(value) {
        const issues = [];
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            issue(issues, "cartographer.dataset.invalid", "Cartographer data must be an object.", "");
            return { value: {}, issues };
        }

        const ids = new Set();
        const cameras = (Array.isArray(value.cameras) ? value.cameras : []).map((camera, index) => {
            const path = `cameras.${index}`;
            if (!camera || typeof camera !== "object" || Array.isArray(camera)) {
                issue(issues, "cartographer.camera.invalid", "Camera records must be objects.", path);
                return null;
            }
            const id = text(camera.id, 80);
            if (!id) issue(issues, "field.required", "Camera ID is required.", `${path}.id`);
            if (ids.has(id)) issue(issues, "field.duplicate-id", "Camera IDs must be unique.", `${path}.id`);
            ids.add(id);
            const type = text(camera.type || "unknown", 30);
            if (!TYPES.has(type)) issue(issues, "cartographer.type.invalid", "Camera type is not supported.", `${path}.type`);
            const verificationStatus = text(camera.verification?.status || "captured", 20);
            if (!VERIFICATION.has(verificationStatus)) issue(issues, "cartographer.verification.invalid", "Verification status is not supported.", `${path}.verification.status`);
            return {
                ...camera,
                id,
                cameraId: text(camera.cameraId || id, 80),
                latitude: finite(camera.latitude, `${path}.latitude`, "Latitude", issues, { min: -90, max: 90 }),
                longitude: finite(camera.longitude, `${path}.longitude`, "Longitude", issues, { min: -180, max: 180 }),
                type: TYPES.has(type) ? type : "unknown",
                direction: finite(camera.direction, `${path}.direction`, "Direction", issues, { min: 0, max: 359.99, optional: true }),
                speedLimit: finite(camera.speedLimit, `${path}.speedLimit`, "Speed limit", issues, { min: 1, max: 300, optional: true }),
                gpsAccuracy: finite(camera.gpsAccuracy, `${path}.gpsAccuracy`, "GPS accuracy", issues, { min: 0, max: 100000, optional: true }),
                confidence: finite(camera.confidence ?? 0.5, `${path}.confidence`, "Confidence", issues, { min: 0, max: 1 }),
                source: text(camera.source || "cartographer", 40),
                notes: text(camera.notes, 500),
                active: camera.active !== false,
                verification: {
                    ...(camera.verification || {}),
                    status: VERIFICATION.has(verificationStatus) ? verificationStatus : "captured"
                }
            };
        }).filter(Boolean);

        if (!Array.isArray(value.cameras)) issue(issues, "cartographer.cameras.invalid", "Cameras must be an array.", "cameras");
        const radius = finite(value.settings?.warningRadius ?? 500, "settings.warningRadius", "Warning radius", issues, { min: 50, max: 5000 });
        const tolerance = finite(value.settings?.directionTolerance ?? 45, "settings.directionTolerance", "Direction tolerance", issues, { min: 0, max: 180 });
        const mapTheme = text(value.settings?.mapTheme || "light", 10);
        if (!new Set(["light", "dark"]).has(mapTheme)) issue(issues, "cartographer.map-theme.invalid", "Map theme is not supported.", "settings.mapTheme");

        return {
            value: {
                ...value,
                cameras,
                settings: {
                    ...(value.settings || {}),
                    warningRadius: radius ?? 500,
                    directionTolerance: tolerance ?? 45,
                    audio: value.settings?.audio !== false,
                    mapTheme: mapTheme === "dark" ? "dark" : "light"
                },
                lastCaptureId: text(value.lastCaptureId, 80) || null
            },
            issues
        };
    }

    validation.register("cartographer", validateCartographer);
})();
