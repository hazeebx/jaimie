(() => {
    "use strict";

    const definitions = new Map();

    function register(definition) {
        if (
            !definition ||
            typeof definition.type !== "string" ||
            !definition.type.trim() ||
            typeof definition.label !== "string" ||
            typeof definition.render !== "function"
        ) {
            throw new TypeError("Dashboard widgets require a type, label, and render function.");
        }

        if (definitions.has(definition.type)) {
            throw new Error(`Dashboard widget already registered: ${definition.type}`);
        }

        definitions.set(definition.type, Object.freeze({
            description: "",
            icon: "□",
            allowMultiple: false,
            ...definition
        }));
    }

    window.JAIMIEDashboardWidgets = Object.freeze({
        register,
        get: type => definitions.get(type) || null,
        list: () => Array.from(definitions.values())
    });
})();
