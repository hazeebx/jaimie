(() => {
    "use strict";

    const validation = window.JAIMIEValidation;
    const safeContent = window.JAIMIESafeContent;
    if (!validation || !safeContent) {
        throw new Error("Finance schema requires JAIMIE validation and safe-content services.");
    }

    const ACCOUNT_TYPES = new Set(["checking", "savings", "cash", "investment", "other"]);
    const INVESTMENT_TYPES = new Set(["stocks", "fund", "gold", "crypto", "real-estate", "deposit", "other"]);
    const TRANSACTION_TYPES = new Set(["expense", "income"]);
    const SOURCE_KINDS = new Set(["account", "card", "none"]);
    const CURRENCIES = new Set(["SAR", "USD", "EUR", "GBP", "INR"]);

    function issue(issues, code, message, path, severity = "error") {
        issues.push({ code, message, path, severity });
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function text(value, path, label, issues, { required = false, maxLength = 100 } = {}) {
        const normalized = safeContent.normalizeText(value, { maxLength });
        if (required && !normalized) issue(issues, "field.required", `${label} is required.`, path);
        return normalized;
    }

    function money(value, path, label, issues, { positive = false } = {}) {
        const normalized = Number(value);
        const valid = Number.isFinite(normalized) && Math.abs(normalized) <= 1_000_000_000_000;
        if (!valid || (positive && normalized <= 0)) {
            issue(issues, "field.invalid-number", `${label} must be a valid ${positive ? "positive " : ""}amount.`, path);
            return 0;
        }
        return Math.round((normalized + Number.EPSILON) * 100) / 100;
    }

    function lastFour(value, path, issues) {
        const normalized = safeContent.normalizeText(value);
        if (normalized && !/^\d{4}$/.test(normalized)) {
            issue(issues, "finance.last-four.invalid", "Last four digits must contain exactly four numbers.", path);
        }
        return /^\d{4}$/.test(normalized) ? normalized : "";
    }

    function color(value) {
        const normalized = safeContent.normalizeText(value, { maxLength: 7 });
        return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#ff8a3d";
    }

    function currency(value, fallback, path, issues) {
        const normalized = text(value || fallback, path, "Currency", issues, { maxLength: 3 }).toUpperCase();
        if (!CURRENCIES.has(normalized)) issue(issues, "finance.currency.invalid", "Currency is not supported.", path);
        return CURRENCIES.has(normalized) ? normalized : fallback;
    }

    function date(value, path, issues) {
        const normalized = safeContent.normalizeText(value, { maxLength: 10 });
        const parsed = new Date(`${normalized}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
            issue(issues, "finance.date.invalid", "Transaction date must be a real YYYY-MM-DD date.", path);
        }
        return normalized;
    }

    function uniqueId(value, path, label, issues, ids) {
        const id = text(value, path, `${label} ID`, issues, { required: true, maxLength: 80 });
        if (id && ids.has(id)) issue(issues, "field.duplicate-id", `${label} IDs must be unique.`, path);
        ids.add(id);
        return id;
    }

    function account(value, index, issues, ids, fallbackCurrency) {
        const path = `accounts.${index}`;
        if (!isRecord(value)) {
            issue(issues, "finance.account.invalid", "Accounts must be objects.", path);
            return null;
        }
        const type = text(value.type || "checking", `${path}.type`, "Account type", issues, { maxLength: 30 });
        if (!ACCOUNT_TYPES.has(type)) issue(issues, "finance.account-type.invalid", "Account type is not supported.", `${path}.type`);
        const normalized = {
            ...value,
            id: uniqueId(value.id, `${path}.id`, "Account", issues, ids),
            name: text(value.name, `${path}.name`, "Account name", issues, { required: true, maxLength: 80 }),
            institution: text(value.institution, `${path}.institution`, "Institution", issues, { maxLength: 80 }),
            type: ACCOUNT_TYPES.has(type) ? type : "other",
            last4: lastFour(value.last4, `${path}.last4`, issues),
            balance: money(value.balance, `${path}.balance`, "Account balance", issues),
            currency: currency(value.currency, fallbackCurrency, `${path}.currency`, issues),
            color: color(value.color)
        };
        return normalized;
    }

    function investment(value, index, issues, ids, fallbackCurrency) {
        const path = `investments.${index}`;
        if (!isRecord(value)) {
            issue(issues, "finance.investment.invalid", "Investments must be objects.", path);
            return null;
        }
        const type = text(value.type || "other", `${path}.type`, "Investment type", issues, { maxLength: 30 });
        if (!INVESTMENT_TYPES.has(type)) issue(issues, "finance.investment-type.invalid", "Investment type is not supported.", `${path}.type`);
        return {
            ...value,
            id: uniqueId(value.id, `${path}.id`, "Investment", issues, ids),
            name: text(value.name, `${path}.name`, "Investment name", issues, { required: true, maxLength: 80 }),
            institution: text(value.institution, `${path}.institution`, "Platform or institution", issues, { maxLength: 80 }),
            type: INVESTMENT_TYPES.has(type) ? type : "other",
            value: money(value.value, `${path}.value`, "Investment value", issues),
            currency: currency(value.currency, fallbackCurrency, `${path}.currency`, issues),
            notes: text(value.notes, `${path}.notes`, "Investment notes", issues, { maxLength: 160 }),
            color: color(value.color)
        };
    }

    function card(value, index, issues, ids, fallbackCurrency) {
        const path = `cards.${index}`;
        if (!isRecord(value)) {
            issue(issues, "finance.card.invalid", "Cards must be objects.", path);
            return null;
        }
        const normalized = {
            ...value,
            id: uniqueId(value.id, `${path}.id`, "Card", issues, ids),
            name: text(value.name, `${path}.name`, "Card name", issues, { required: true, maxLength: 80 }),
            issuer: text(value.issuer, `${path}.issuer`, "Issuer", issues, { maxLength: 80 }),
            last4: lastFour(value.last4, `${path}.last4`, issues),
            limit: Math.max(0, money(value.limit, `${path}.limit`, "Credit limit", issues)),
            balance: Math.max(0, money(value.balance, `${path}.balance`, "Outstanding balance", issues)),
            currency: currency(value.currency, fallbackCurrency, `${path}.currency`, issues),
            color: color(value.color)
        };
        return normalized;
    }

    function transaction(value, index, issues, ids, fallbackCurrency) {
        const path = `transactions.${index}`;
        if (!isRecord(value)) {
            issue(issues, "finance.transaction.invalid", "Transactions must be objects.", path);
            return null;
        }
        const type = text(value.type || "expense", `${path}.type`, "Transaction type", issues, { maxLength: 20 });
        const sourceKind = text(value.sourceKind || "none", `${path}.sourceKind`, "Source kind", issues, { maxLength: 20 });
        if (!TRANSACTION_TYPES.has(type)) issue(issues, "finance.transaction-type.invalid", "Transaction type is not supported.", `${path}.type`);
        if (!SOURCE_KINDS.has(sourceKind)) issue(issues, "finance.source-kind.invalid", "Transaction source kind is not supported.", `${path}.sourceKind`);
        const normalized = {
            ...value,
            id: uniqueId(value.id, `${path}.id`, "Transaction", issues, ids),
            type: TRANSACTION_TYPES.has(type) ? type : "expense",
            amount: money(value.amount, `${path}.amount`, "Transaction amount", issues, { positive: true }),
            date: date(value.date, `${path}.date`, issues),
            category: text(value.category, `${path}.category`, "Category", issues, { required: true, maxLength: 60 }),
            sourceKind: SOURCE_KINDS.has(sourceKind) ? sourceKind : "none",
            sourceId: text(value.sourceId, `${path}.sourceId`, "Source ID", issues, { maxLength: 80 }),
            currency: currency(value.currency, fallbackCurrency, `${path}.currency`, issues),
            note: text(value.note, `${path}.note`, "Note", issues, { maxLength: 160 })
        };
        if (Object.hasOwn(value, "balanceImpact")) {
            normalized.balanceImpact = money(value.balanceImpact, `${path}.balanceImpact`, "Balance impact", issues);
        }
        return normalized;
    }

    function validateFinance(value) {
        const issues = [];
        if (!isRecord(value)) {
            issue(issues, "finance.dataset.invalid", "Finance data must be an object.", "");
            return { value: {}, issues };
        }

        const displayCurrency = currency(value.currency, "SAR", "currency", issues);
        const accountIds = new Set();
        const investmentIds = new Set();
        const cardIds = new Set();
        const transactionIds = new Set();
        const accounts = (Array.isArray(value.accounts) ? value.accounts : [])
            .map((item, index) => account(item, index, issues, accountIds, displayCurrency)).filter(Boolean);
        const investments = (Array.isArray(value.investments) ? value.investments : [])
            .map((item, index) => investment(item, index, issues, investmentIds, displayCurrency)).filter(Boolean);
        const cards = (Array.isArray(value.cards) ? value.cards : [])
            .map((item, index) => card(item, index, issues, cardIds, displayCurrency)).filter(Boolean);
        const transactions = (Array.isArray(value.transactions) ? value.transactions : [])
            .map((item, index) => transaction(item, index, issues, transactionIds, displayCurrency)).filter(Boolean);

        if (!Array.isArray(value.accounts)) issue(issues, "finance.accounts.invalid", "Accounts must be an array.", "accounts");
        if (value.investments !== undefined && !Array.isArray(value.investments)) issue(issues, "finance.investments.invalid", "Investments must be an array.", "investments");
        if (!Array.isArray(value.cards)) issue(issues, "finance.cards.invalid", "Cards must be an array.", "cards");
        if (!Array.isArray(value.transactions)) issue(issues, "finance.transactions.invalid", "Transactions must be an array.", "transactions");

        for (const item of transactions) {
            if (item.sourceKind === "account" && item.sourceId && !accountIds.has(item.sourceId)) {
                issue(issues, "finance.source.missing", "Transaction references a missing account.", `transactions.${item.id}.sourceId`, "warning");
            }
            if (item.sourceKind === "card" && item.sourceId && !cardIds.has(item.sourceId)) {
                issue(issues, "finance.source.missing", "Transaction references a missing card.", `transactions.${item.id}.sourceId`, "warning");
            }
        }

        const hasRate = isRecord(value.exchangeRates) && Object.hasOwn(value.exchangeRates, "SAR_INR");
        const rawRate = Number(value.exchangeRates?.SAR_INR);
        const validRate = Number.isFinite(rawRate) && rawRate > 0 && rawRate <= 1_000_000;
        if (hasRate && !validRate) issue(issues, "finance.exchange-rate.invalid", "SAR to INR conversion factor must be a positive number.", "exchangeRates.SAR_INR");
        const exchangeRates = isRecord(value.exchangeRates) ? { ...value.exchangeRates } : {};
        if (validRate) exchangeRates.SAR_INR = rawRate;
        else delete exchangeRates.SAR_INR;

        return {
            value: {
                ...value,
                currency: displayCurrency,
                exchangeRates,
                accounts,
                investments,
                cards,
                transactions
            },
            issues
        };
    }

    validation.register("finance", validateFinance);
})();
