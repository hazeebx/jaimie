(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) throw new Error("Inventory schema requires JAIMIE validation and safe-content services.");

    function issue(issues, code, message, path, severity = "error") {
        issues.push({ code, message, path, severity });
    }
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
    function number(value, fallback, path, label, issues) {
        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1000000000) {
            issue(issues, "field.invalid-number", `${label} must be a non-negative number.`, path);
            return fallback;
        }
        return normalized;
    }
    function boolean(value, fallback, path, label, issues) {
        if (typeof value !== "boolean") {
            issue(issues, "field.wrong-type", `${label} must be true or false.`, path);
            return fallback;
        }
        return value;
    }
    function duplicates(values, path, label, issues) {
        const seen = new Set();
        values.forEach((value, index) => {
            if (seen.has(value.id)) issue(issues, "field.duplicate-id", `${label} IDs must be unique.`, `${path}[${index}].id`);
            seen.add(value.id);
        });
    }
    function validateItem(value, index, issues) {
        const path = `items[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "inventory.item.invalid", "Inventory items must be objects.", path);
            return null;
        }
        return {
            ...value,
            id: id(value.id, `legacy-item-${index}`, `${path}.id`, "Inventory item", issues),
            name: text(value.name, "", 200, `${path}.name`, "Item name", issues, true),
            category: text(value.category, "other", 80, `${path}.category`, "Category", issues, true),
            unit: text(value.unit, "pcs", 40, `${path}.unit`, "Unit", issues, true),
            qty: number(value.qty, 0, `${path}.qty`, "Quantity", issues),
            min: number(value.min, 0, `${path}.min`, "Minimum quantity", issues),
            notes: text(value.notes, "", 5000, `${path}.notes`, "Notes", issues)
        };
    }
    function validateShoppingItem(value, index, issues) {
        const path = `shopping[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "inventory.shopping-item.invalid", "Shopping items must be objects.", path);
            return null;
        }
        return {
            ...value,
            id: id(value.id, `legacy-shopping-${index}`, `${path}.id`, "Shopping item", issues),
            name: text(value.name, "", 200, `${path}.name`, "Shopping item name", issues, true),
            qty: number(value.qty, 0, `${path}.qty`, "Shopping quantity", issues),
            unit: text(value.unit, "pcs", 40, `${path}.unit`, "Unit", issues, true),
            done: boolean(value.done, false, `${path}.done`, "Shopping completion", issues)
        };
    }
    function validateInventory(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "inventory.dataset.invalid", "Inventory data must be an object.", "");
            return { value: { items: [], shopping: [] }, issues };
        }
        if (!Array.isArray(value.items)) issue(issues, "inventory.items.invalid", "Inventory items must be an array.", "items");
        if (!Array.isArray(value.shopping)) issue(issues, "inventory.shopping.invalid", "Shopping items must be an array.", "shopping");
        const items = (Array.isArray(value.items) ? value.items : []).map((item, index) => validateItem(item, index, issues)).filter(Boolean);
        const shopping = (Array.isArray(value.shopping) ? value.shopping : []).map((item, index) => validateShoppingItem(item, index, issues)).filter(Boolean);
        duplicates(items, "items", "Inventory item", issues);
        duplicates(shopping, "shopping", "Shopping item", issues);
        return { value: { ...value, items, shopping }, issues };
    }

    validation.register("inventory", validateInventory);
})();
