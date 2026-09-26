globalThis.window = globalThis;

import { readFileSync } from "node:fs";

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/cartographer.js");
await import("../cartographer/geo-model.js");

const model = globalThis.JAIMIEGeoModel;
const validation = globalThis.JAIMIEValidation;
const origin = { latitude: 24.7136, longitude: 46.6753, heading: 90 };
const nearby = { id: "near", cameraId: "NEAR", latitude: 24.7136, longitude: 46.6798, direction: 92, active: true };
const far = { id: "far", cameraId: "FAR", latitude: 24.8, longitude: 46.8, direction: 90, active: true };

const distance = model.haversineMeters(origin, nearby);
if (distance < 400 || distance > 500) throw new Error(`Haversine distance is implausible: ${distance}`);
if (model.angularDifference(350, 10) !== 20) throw new Error("Angular difference does not wrap across north.");
if (!model.isDirectionCompatible(90, 120, 45) || model.isDirectionCompatible(90, 180, 45)) throw new Error("Direction filtering is incorrect.");
if (!model.isDirectionCompatible(null, 180, 45)) throw new Error("Missing device bearing should not hide cameras.");
const eastBearing = model.bearingDegrees(origin, nearby);
if (eastBearing < 89 || eastBearing > 91) throw new Error(`Movement bearing is incorrect: ${eastBearing}`);

const match = model.findRelevantCamera([far, nearby], origin, { warningRadius: 500, directionTolerance: 45 }, new Set());
if (match?.camera.id !== "near") throw new Error("Nearest relevant camera was not selected.");
if (model.findRelevantCamera([nearby], origin, { warningRadius: 500 }, new Set(["near"])) !== null) throw new Error("Alert de-duplication did not exclude an alerted camera.");
if (model.possibleDuplicate([nearby], nearby, 30)?.camera.id !== "near") throw new Error("Duplicate proximity detection failed.");

const dataset = {
    futureRootField: { version: 2 },
    settings: { warningRadius: 500, directionTolerance: 45, audio: true, mapTheme: "dark", futureSetting: true },
    cameras: [{
        ...nearby,
        type: "fixed",
        gpsAccuracy: 7,
        source: "cartographer",
        confidence: 0.75,
        notes: "Northbound",
        createdAt: "2026-09-25T10:00:00.000Z",
        updatedAt: "2026-09-25T10:00:00.000Z",
        verification: { status: "captured", futureVerification: true },
        futureCameraField: true
    }],
    lastCaptureId: "near"
};
const valid = validation.validate("cartographer", dataset, { source: "test" });
if (!valid.valid || valid.issues.length) throw new Error("A valid Cartographer dataset failed validation.");
if (valid.value.futureRootField?.version !== 2 || !valid.value.cameras[0].futureCameraField || !valid.value.settings.futureSetting) {
    throw new Error("Cartographer normalization discarded forward-compatible fields.");
}

const invalid = validation.validate("cartographer", {
    settings: { warningRadius: 5, directionTolerance: 500, mapTheme: "neon" },
    cameras: [
        { id: "same", latitude: 100, longitude: 200, type: "laser", confidence: 2, verification: { status: "maybe" } },
        { id: "same", latitude: 0, longitude: 0 }
    ]
});
const codes = new Set(invalid.issues.map(issue => issue.code));
for (const code of ["cartographer.number.invalid", "cartographer.type.invalid", "cartographer.verification.invalid", "cartographer.map-theme.invalid", "field.duplicate-id"]) {
    if (!codes.has(code)) throw new Error(`Missing Cartographer validation issue: ${code}`);
}

const html = readFileSync(new URL("../cartographer/index.html", import.meta.url), "utf8");
for (const id of ["map", "mapThemeButton", "gpsButton", "captureButton", "driverButton", "cameraList", "cameraDialog", "radiusSelect", "driveHud", "driveSpeed", "driveHeading", "recenterButton", "addSpeedCameraButton", "addCheckPostButton", "driverCaptureMessage"]) {
    if (!html.includes(`id="${id}"`)) throw new Error(`Cartographer UI is missing ${id}.`);
}
const app = readFileSync(new URL("../cartographer/app.js", import.meta.url), "utf8");
for (const behavior of ["watchPosition", "possibleDuplicate", "findRelevantCamera", "speechSynthesis", "JAIMIEData.save", "journey-trail", "miniMapZoom", "setMiniMapFollowing", "bearingDegrees", "captureMarker(\"speed-camera\"", "captureMarker(\"check-post\"", "toggleMapTheme", "dark-map"]) {
    if (!app.includes(behavior)) throw new Error(`Cartographer behavior is missing: ${behavior}`);
}

console.log("Cartographer passed: distance, direction, deduplication, validation, future fields, and UI wiring are correct.");
