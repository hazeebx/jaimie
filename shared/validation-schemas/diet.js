(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Diet schema requires JAIMIE validation and safe-content services.");
    }

    const ID_LIMIT = 128;
    const NAME_LIMIT = 200;
    const MAX_NUMBER = 1000000000;
    const NUTRIENTS = [
        "calories", "protein", "carbs", "fat", "fiber",
        "sugar", "sodium", "calcium", "iron", "potassium"
    ];

    function issue(issues, code, message, path, severity = "error") {
        issues.push({ code, message, path, severity });
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function isDateKey(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    function text(value, fallback, limit, path, label, issues, { required = false } = {}) {
        if (value !== undefined && value !== null && typeof value !== "string") {
            issue(issues, "field.wrong-type", `${label} must be text.`, path);
        }
        const source = typeof value === "string" ? value : fallback;
        const normalized = safeContent.normalizeText(source);
        if (normalized.length > limit) issue(issues, "field.too-long", `${label} cannot exceed ${limit} characters.`, path);
        const bounded = safeContent.normalizeText(source, { maxLength: limit });
        if (required && !bounded) issue(issues, "field.required", `${label} is required.`, path);
        return bounded;
    }

    function id(value, fallback, path, label, issues) {
        if (value === undefined || value === null || value === "") {
            issue(issues, "field.legacy-id-derived", `${label} ID was derived from its collection context.`, path, "warning");
            return fallback;
        }
        return text(value, fallback, ID_LIMIT, path, `${label} ID`, issues, { required: true });
    }

    function number(value, fallback, path, label, issues, { min = 0, max = MAX_NUMBER, integer = false, required = false } = {}) {
        if ((value === undefined || value === null || value === "") && !required) return fallback;
        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < min || normalized > max || (integer && !Number.isInteger(normalized))) {
            issue(issues, "field.invalid-number", `${label} must be a valid number from ${min} to ${max}.`, path);
            return fallback;
        }
        return normalized;
    }

    function validateNutrients(value, path, issues) {
        const normalized = { ...value };
        for (const nutrient of NUTRIENTS) {
            normalized[nutrient] = number(value[nutrient], 0, `${path}.${nutrient}`, nutrient, issues);
        }
        return normalized;
    }

    function validateFood(value, index, issues) {
        const path = `foods[${index}]`;
        if (!isRecord(value)) {
            issue(issues, "diet.food.invalid", "Foods must be objects.", path);
            return null;
        }
        return validateNutrients({
            ...value,
            id: id(value.id, `legacy-food-${index}`, `${path}.id`, "Food", issues),
            name: text(value.name, "", NAME_LIMIT, `${path}.name`, "Food name", issues, { required: true }),
            serving: number(value.serving, 0, `${path}.serving`, "Serving size", issues, { min: 0.1, required: true })
        }, path, issues);
    }

    function validateMealItem(value, itemIndex, path, issues) {
        const itemPath = `${path}.items[${itemIndex}]`;
        if (!isRecord(value)) {
            issue(issues, "diet.meal-item.invalid", "Meal items must be objects.", itemPath);
            return null;
        }
        return validateNutrients({
            ...value,
            id: id(value.id, `legacy-item-${itemIndex}`, `${itemPath}.id`, "Meal item", issues),
            name: text(value.name, "", NAME_LIMIT, `${itemPath}.name`, "Meal item name", issues, { required: true }),
            amount: number(value.amount, 0, `${itemPath}.amount`, "Meal item amount", issues, { min: 0.1, required: true })
        }, itemPath, issues);
    }

    function validateMeal(value, mealIndex, path, issues) {
        const mealPath = `${path}.meals[${mealIndex}]`;
        if (!isRecord(value)) {
            issue(issues, "diet.meal.invalid", "Meals must be objects.", mealPath);
            return null;
        }
        const time = text(value.time, "", 5, `${mealPath}.time`, "Meal time", issues);
        if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            issue(issues, "diet.meal.time.invalid", "Meal time must use 24-hour HH:MM format.", `${mealPath}.time`);
        }
        if (!Array.isArray(value.items)) issue(issues, "diet.meal-items.invalid", "Meal items must be an array.", `${mealPath}.items`);
        const items = (Array.isArray(value.items) ? value.items : [])
            .map((item, index) => validateMealItem(item, index, mealPath, issues))
            .filter(Boolean);
        reportDuplicateIds(items, `${mealPath}.items`, "Meal item", issues);
        return {
            ...value,
            id: id(value.id, `legacy-meal-${mealIndex}`, `${mealPath}.id`, "Meal", issues),
            name: text(value.name, "", NAME_LIMIT, `${mealPath}.name`, "Meal name", issues, { required: true }),
            time,
            items
        };
    }

    function validateDay(value, date, issues) {
        const path = `days.${date}`;
        if (!isRecord(value)) {
            issue(issues, "diet.day.invalid", "Diet days must be objects.", path);
            return null;
        }
        if (!Array.isArray(value.meals)) issue(issues, "diet.meals.invalid", "Day meals must be an array.", `${path}.meals`);
        const meals = (Array.isArray(value.meals) ? value.meals : [])
            .map((meal, index) => validateMeal(meal, index, path, issues))
            .filter(Boolean);
        reportDuplicateIds(meals, `${path}.meals`, "Meal", issues);
        const expectedId = `day:${date}`;
        const dayId = id(value.id, expectedId, `${path}.id`, "Diet day", issues);
        if (dayId && dayId !== expectedId) issue(issues, "diet.day.id-mismatch", "Diet day ID must match its date key.", `${path}.id`);
        return {
            ...value,
            id: dayId,
            water: number(value.water, 0, `${path}.water`, "Water intake", issues),
            meals
        };
    }

    function reportDuplicateIds(values, path, label, issues) {
        const seen = new Set();
        values.forEach((value, index) => {
            if (!value?.id) return;
            if (seen.has(value.id)) issue(issues, "field.duplicate-id", `${label} IDs must be unique.`, `${path}[${index}].id`);
            seen.add(value.id);
        });
    }

    function validateDiet(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "diet.dataset.invalid", "Diet data must be an object.", "");
            return { value: {}, issues };
        }

        if (!isRecord(value.targets)) issue(issues, "diet.targets.invalid", "Diet targets must be an object.", "targets");
        const targetSource = isRecord(value.targets) ? value.targets : {};
        const targets = {
            ...targetSource,
            calories: number(targetSource.calories, 0, "targets.calories", "Calorie target", issues, { required: true }),
            protein: number(targetSource.protein, 0, "targets.protein", "Protein target", issues, { required: true }),
            carbs: number(targetSource.carbs, 0, "targets.carbs", "Carbohydrate target", issues, { required: true }),
            fat: number(targetSource.fat, 0, "targets.fat", "Fat target", issues, { required: true }),
            water: number(targetSource.water, 0, "targets.water", "Water target", issues, { required: true })
        };

        if (!Array.isArray(value.foods)) issue(issues, "diet.foods.invalid", "Food library must be an array.", "foods");
        const foods = (Array.isArray(value.foods) ? value.foods : [])
            .map((food, index) => validateFood(food, index, issues))
            .filter(Boolean);
        reportDuplicateIds(foods, "foods", "Food", issues);

        if (!isRecord(value.days)) issue(issues, "diet.days.invalid", "Diet days must be an object.", "days");
        const days = {};
        for (const [date, day] of Object.entries(isRecord(value.days) ? value.days : {})) {
            if (!isDateKey(date)) {
                issue(issues, "diet.day-key.invalid", "Diet day keys must be real YYYY-MM-DD dates.", `days.${date}`);
                continue;
            }
            const normalizedDay = validateDay(day, date, issues);
            if (normalizedDay) days[date] = normalizedDay;
        }

        return { value: { ...value, targets, foods, days }, issues };
    }

    validation.register("diet", validateDiet);
})();
