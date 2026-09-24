(() => {
    "use strict";

    function timeValue(value) {
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
        return match ? (Number(match[1]) * 60) + Number(match[2]) : Number.POSITIVE_INFINITY;
    }

    function splitTime(value) {
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
        return match ? { hour: match[1], minute: match[2] } : { hour: "", minute: "" };
    }

    function composeTime(hour, minute) {
        const value = `${String(hour || "")}:${String(minute || "")}`;
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : "";
    }

    function sorted(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map((item, index) => ({ item, index, time: timeValue(item?.time) }))
            .sort((left, right) => left.time - right.time || left.index - right.index)
            .map(entry => entry.item);
    }

    function sortInPlace(items) {
        if (!Array.isArray(items)) return items;
        items.splice(0, items.length, ...sorted(items));
        return items;
    }

    function sortDayData(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) return data;
        for (const value of Object.values(data)) {
            if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.schedule)) {
                sortInPlace(value.schedule);
            }
        }
        return data;
    }

    window.JAIMIEScheduleOrder = Object.freeze({ timeValue, splitTime, composeTime, sorted, sortInPlace, sortDayData });
})();
