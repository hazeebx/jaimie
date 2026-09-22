(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) throw new Error("Packing schema requires JAIMIE validation and safe-content services.");

    function issue(issues, code, message, path, severity = "error") { issues.push({ code, message, path, severity }); }
    function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
    function text(value, fallback, limit, path, label, issues, required = false) {
        if (value !== undefined && value !== null && typeof value !== "string") issue(issues, "field.wrong-type", `${label} must be text.`, path);
        const source = typeof value === "string" ? value : fallback;
        if (safeContent.normalizeText(source).length > limit) issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        const normalized = safeContent.normalizeText(source, { maxLength: limit });
        if (required && !normalized) issue(issues, "field.required", `${label} is required.`, path);
        return normalized;
    }
    function id(value, fallback, path, label, issues) {
        if (value === undefined || value === null || value === "") {
            issue(issues, "field.legacy-id-derived", `${label} ID was derived from its collection position.`, path, "warning");
            return fallback;
        }
        return text(value, fallback, 128, path, `${label} ID`, issues, true);
    }
    function duplicates(values, path, label, issues) {
        const seen = new Set();
        values.forEach((value, index) => {
            if (seen.has(value.id)) issue(issues, "field.duplicate-id", `${label} IDs must be unique.`, `${path}[${index}].id`);
            seen.add(value.id);
        });
    }
    function validateProfile(value, index, issues) {
        const path = `profiles[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "packing.profile.invalid", "Packing profiles must be objects.", path);
            return null;
        }
        return {
            ...value,
            id: id(value.id, `legacy-profile-${index}`, `${path}.id`, "Packing profile", issues),
            name: text(value.name, "", 120, `${path}.name`, "Profile name", issues, true)
        };
    }
    function validateItem(value, index, issues) {
        const path = `items[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "packing.item.invalid", "Packing items must be objects.", path);
            return null;
        }
        const quantity = Number(value.qty);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
            issue(issues, "field.invalid-number", "Packing quantity must be a positive whole number.", `${path}.qty`);
        }
        return {
            ...value,
            id: id(value.id, `legacy-item-${index}`, `${path}.id`, "Packing item", issues),
            profileId: text(value.profileId, "travel", 128, `${path}.profileId`, "Profile ID", issues, true),
            name: text(value.name, "", 200, `${path}.name`, "Item name", issues, true),
            category: text(value.category, "MISC", 80, `${path}.category`, "Category", issues, true),
            qty: Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000000 ? quantity : 1
        };
    }
    function validatePacking(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "packing.dataset.invalid", "Packing data must be an object.", "");
            return { value: { profiles: [], items: [], checks: {} }, issues };
        }
        if (!Array.isArray(value.profiles)) issue(issues, "packing.profiles.invalid", "Packing profiles must be an array.", "profiles");
        if (!Array.isArray(value.items)) issue(issues, "packing.items.invalid", "Packing items must be an array.", "items");
        if (!isRecord(value.checks)) issue(issues, "packing.checks.invalid", "Packing checks must be an object.", "checks");
        const profiles = (Array.isArray(value.profiles) ? value.profiles : []).map((profile, index) => validateProfile(profile, index, issues)).filter(Boolean);
        const items = (Array.isArray(value.items) ? value.items : []).map((item, index) => validateItem(item, index, issues)).filter(Boolean);
        duplicates(profiles, "profiles", "Packing profile", issues);
        duplicates(items, "items", "Packing item", issues);
        const profileIds = new Set(profiles.map(profile => profile.id));
        items.forEach((item, index) => {
            if (!profileIds.has(item.profileId)) issue(issues, "packing.item.profile-missing", "Packing item references an unknown profile.", `items[${index}].profileId`);
        });
        const checks = {};
        for (const [key, checked] of Object.entries(isRecord(value.checks) ? value.checks : {})) {
            if (!/^.{1,128}:(packing|returning):.{1,128}$/.test(key)) issue(issues, "packing.check-key.invalid", "Packing check keys must identify profile, mode and item.", `checks.${key}`);
            if (typeof checked !== "boolean") issue(issues, "field.wrong-type", "Packing check values must be true or false.", `checks.${key}`);
            checks[key] = typeof checked === "boolean" ? checked : Boolean(checked);
        }
        return { value: { ...value, profiles, items, checks }, issues };
    }

    validation.register("packing", validatePacking);
})();
