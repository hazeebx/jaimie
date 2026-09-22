globalThis.window = globalThis;

await import("../shared/validation.js");

const validation = globalThis.JAIMIEValidation;
if (!validation) throw new Error("Validation service did not initialize.");

const original = { title: "  Example  " };
validation.register("test-dataset", value => {
    const title = typeof value?.title === "string" ? value.title.trim() : "";
    return {
        valid: Boolean(title),
        value: { ...value, title },
        issues: title ? [] : [{
            code: "test.title-required",
            path: "title",
            message: "Title is required."
        }]
    };
});

const normalized = validation.inspect("test-dataset", original, { mode: "enforce" });
if (normalized.value.title !== "Example") {
    throw new Error("Enforcement mode did not return the normalized value.");
}

const invalid = { title: "   " };
const compatible = validation.inspect("test-dataset", invalid, {
    source: "test",
    mode: "compatibility"
});
if (compatible.valid || compatible.value !== invalid) {
    throw new Error("Compatibility mode did not preserve invalid input.");
}

validation.inspect("test-dataset", invalid, {
    source: "test",
    mode: "compatibility"
});
if (validation.getReports().length !== 1) {
    throw new Error("Validation reports were not deduplicated.");
}

let enforcementFailed = false;
try {
    validation.inspect("test-dataset", invalid, { mode: "enforce" });
} catch (error) {
    enforcementFailed = error instanceof validation.ValidationError;
}
if (!enforcementFailed) {
    throw new Error("Enforcement mode did not throw a structured validation error.");
}

const untouched = { legacy: true };
const unregistered = validation.inspect("legacy-dataset", untouched);
if (!unregistered.valid || unregistered.hasValidator || unregistered.value !== untouched) {
    throw new Error("Unregistered legacy data was not left untouched.");
}

console.log("JAIMIE validation foundation passed: normalization, compatibility, reporting, and enforcement behavior are valid.");
