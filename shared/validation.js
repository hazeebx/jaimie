(() => {
    "use strict";

    const validators = new Map();
    const reports = [];
    const reportFingerprints = new Set();
    const reportOrder = [];
    const MAX_REPORTS = 100;
    const MODES = new Set(["compatibility", "enforce"]);

    class JAIMIEValidationError extends Error {
        constructor(result) {
            super(`Validation failed for JAIMIE dataset "${result.key}".`);
            this.name = "JAIMIEValidationError";
            this.key = result.key;
            this.source = result.source;
            this.issues = result.issues;
        }
    }

    function normalizeIssue(issue, index) {
        if (typeof issue === "string") {
            return {
                code: `validation.issue.${index + 1}`,
                message: issue,
                path: "",
                severity: "error"
            };
        }

        const value = issue && typeof issue === "object" ? issue : {};
        return {
            code: String(value.code || `validation.issue.${index + 1}`),
            message: String(value.message || "Invalid value."),
            path: String(value.path || ""),
            severity: value.severity === "warning" ? "warning" : "error"
        };
    }

    function register(key, validator) {
        if (typeof key !== "string" || !key.trim()) {
            throw new TypeError("JAIMIEValidation.register(): key must be a non-empty string.");
        }
        if (typeof validator !== "function") {
            throw new TypeError("JAIMIEValidation.register(): validator must be a function.");
        }
        if (validators.has(key)) {
            throw new Error(`A validator is already registered for "${key}".`);
        }

        validators.set(key, validator);
        return () => validators.delete(key);
    }

    function validate(key, value, { source = "unknown" } = {}) {
        const validator = validators.get(key);
        if (!validator) {
            return {
                key,
                source,
                valid: true,
                hasValidator: false,
                value,
                issues: []
            };
        }

        try {
            const raw = validator(value, { key, source }) || {};
            const issues = (Array.isArray(raw.issues) ? raw.issues : [])
                .map(normalizeIssue);
            const hasErrors = issues.some(issue => issue.severity === "error");
            const valid = raw.valid === false ? false : !hasErrors;
            if (!valid && !issues.length) {
                issues.push(normalizeIssue({
                    code: "validation.invalid",
                    message: "The dataset is invalid."
                }, 0));
            }

            return {
                key,
                source,
                valid,
                hasValidator: true,
                value: Object.hasOwn(raw, "value") ? raw.value : value,
                issues
            };
        } catch (error) {
            return {
                key,
                source,
                valid: false,
                hasValidator: true,
                value,
                issues: [{
                    code: "validation.validator-failed",
                    message: error instanceof Error ? error.message : "Validator failed.",
                    path: "",
                    severity: "error"
                }]
            };
        }
    }

    function recordReport(result) {
        if (!result.issues.length) return;

        const fingerprint = JSON.stringify([
            result.key,
            result.source,
            result.issues.map(issue => [issue.code, issue.path, issue.message])
        ]);
        if (reportFingerprints.has(fingerprint)) return;

        const report = Object.freeze({
            key: result.key,
            source: result.source,
            valid: result.valid,
            issues: result.issues.map(issue => Object.freeze({ ...issue })),
            detectedAt: new Date().toISOString()
        });
        reports.push(report);
        reportFingerprints.add(fingerprint);
        reportOrder.push(fingerprint);

        while (reports.length > MAX_REPORTS) {
            reports.shift();
            reportFingerprints.delete(reportOrder.shift());
        }

        if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
            window.dispatchEvent(new CustomEvent("jaimie-validation-report", {
                detail: report
            }));
        }
    }

    function inspect(key, value, { source = "unknown", mode = "compatibility" } = {}) {
        if (!MODES.has(mode)) {
            throw new TypeError(`Unknown JAIMIE validation mode: ${mode}`);
        }

        const result = validate(key, value, { source });
        recordReport(result);

        if (mode === "enforce" && !result.valid) {
            throw new JAIMIEValidationError(result);
        }

        return {
            ...result,
            value: mode === "compatibility" ? value : result.value
        };
    }

    function getReports() {
        return reports.map(report => ({
            ...report,
            issues: report.issues.map(issue => ({ ...issue }))
        }));
    }

    function clearReports() {
        reports.length = 0;
        reportFingerprints.clear();
        reportOrder.length = 0;
    }

    window.JAIMIEValidation = Object.freeze({
        register,
        unregister: key => validators.delete(key),
        has: key => validators.has(key),
        validate,
        inspect,
        getReports,
        clearReports,
        ValidationError: JAIMIEValidationError,
        modes: Object.freeze(["compatibility", "enforce"])
    });
})();
