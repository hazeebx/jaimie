(() => {
    "use strict";

    const EARTH_RADIUS_METERS = 6_371_000;

    function number(value) {
        if (value === null || value === undefined || value === "") return null;
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }

    function toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    function haversineMeters(from, to) {
        const lat1 = number(from?.latitude);
        const lon1 = number(from?.longitude);
        const lat2 = number(to?.latitude);
        const lon2 = number(to?.longitude);
        if ([lat1, lon1, lat2, lon2].some(value => value === null)) return Infinity;

        const latitudeDelta = toRadians(lat2 - lat1);
        const longitudeDelta = toRadians(lon2 - lon1);
        const a = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
            * Math.sin(longitudeDelta / 2) ** 2;
        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function angularDifference(first, second) {
        const a = number(first);
        const b = number(second);
        if (a === null || b === null) return null;
        return Math.abs(((a - b + 540) % 360) - 180);
    }

    function bearingDegrees(from, to) {
        const lat1 = number(from?.latitude);
        const lon1 = number(from?.longitude);
        const lat2 = number(to?.latitude);
        const lon2 = number(to?.longitude);
        if ([lat1, lon1, lat2, lon2].some(value => value === null)) return null;
        if (lat1 === lat2 && lon1 === lon2) return null;
        const longitudeDelta = toRadians(lon2 - lon1);
        const firstLatitude = toRadians(lat1);
        const secondLatitude = toRadians(lat2);
        const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
        const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
            - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function normalizeHeading(value) {
        const heading = number(value);
        return heading === null ? null : ((heading % 360) + 360) % 360;
    }

    function cardinalDirection(value) {
        const heading = normalizeHeading(value);
        if (heading === null) return "—";
        return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(heading / 45) % 8];
    }

    function uvRisk(value) {
        const uv = number(value);
        if (uv === null) return "Unavailable";
        if (uv < 3) return "Low";
        if (uv < 6) return "Moderate";
        if (uv < 8) return "High";
        if (uv < 11) return "Very high";
        return "Extreme";
    }

    function weatherCondition(code, isDay = true) {
        const value = number(code);
        const day = Boolean(Number(isDay));
        if (value === 0) return { label: "Clear", icon: day ? "☀" : "☾" };
        if (value === 1) return { label: "Mainly clear", icon: day ? "🌤" : "☾" };
        if (value === 2) return { label: "Partly cloudy", icon: "⛅" };
        if (value === 3) return { label: "Overcast", icon: "☁" };
        if ([45, 48].includes(value)) return { label: "Fog", icon: "≋" };
        if ([51, 53, 55, 56, 57].includes(value)) return { label: "Drizzle", icon: "🌦" };
        if ([61, 63, 65, 66, 67].includes(value)) return { label: "Rain", icon: "🌧" };
        if ([71, 73, 75, 77].includes(value)) return { label: "Snow", icon: "❄" };
        if ([80, 81, 82].includes(value)) return { label: "Rain showers", icon: "🌦" };
        if ([85, 86].includes(value)) return { label: "Snow showers", icon: "❄" };
        if ([95, 96, 99].includes(value)) return { label: "Thunderstorm", icon: "⚡" };
        return { label: "Unavailable", icon: "—" };
    }

    function isDirectionCompatible(userBearing, cameraDirection, tolerance = 45) {
        const difference = angularDifference(userBearing, cameraDirection);
        return difference === null || difference <= Math.max(0, Number(tolerance) || 45);
    }

    function camerasByDistance(cameras, position) {
        return (Array.isArray(cameras) ? cameras : [])
            .filter(camera => camera?.active !== false)
            .map(camera => ({ camera, distance: haversineMeters(position, camera) }))
            .sort((left, right) => left.distance - right.distance);
    }

    function findRelevantCamera(cameras, position, settings = {}, alertedIds = new Set()) {
        const radius = Math.max(50, Number(settings.warningRadius) || 500);
        const tolerance = Math.max(0, Number(settings.directionTolerance) || 45);
        return camerasByDistance(cameras, position).find(({ camera, distance }) =>
            distance <= radius
            && !alertedIds.has(camera.id)
            && isDirectionCompatible(position?.heading, camera.direction, tolerance)
        ) || null;
    }

    function possibleDuplicate(cameras, position, threshold = 30) {
        return camerasByDistance(cameras, position)
            .find(({ distance }) => distance <= threshold) || null;
    }

    function cameraFeatureCollection(cameras) {
        return {
            type: "FeatureCollection",
            features: (Array.isArray(cameras) ? cameras : [])
                .filter(camera => Number.isFinite(Number(camera.latitude)) && Number.isFinite(Number(camera.longitude)))
                .map(camera => ({
                    type: "Feature",
                    properties: {
                        id: camera.id,
                        cameraId: camera.cameraId,
                        type: camera.type,
                        active: camera.active !== false
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [Number(camera.longitude), Number(camera.latitude)]
                    }
                }))
        };
    }

    window.JAIMIEGeoModel = Object.freeze({
        haversineMeters,
        angularDifference,
        bearingDegrees,
        normalizeHeading,
        cardinalDirection,
        uvRisk,
        weatherCondition,
        isDirectionCompatible,
        camerasByDistance,
        findRelevantCamera,
        possibleDuplicate,
        cameraFeatureCollection
    });
})();
