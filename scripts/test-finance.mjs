globalThis.window = globalThis;

import { readFileSync } from "node:fs";

await import("../shared/safe-content.js");
await import("../shared/validation.js");
await import("../shared/validation-schemas/finance.js");
await import("../finance/finance-model.js");

const validation = globalThis.JAIMIEValidation;
const model = globalThis.JAIMIEFinanceModel;
const data = {
    currency: "SAR",
    exchangeRates: { SAR_INR: 20 },
    futureRootField: { version: 2 },
    accounts: [{
        id: "account-1",
        name: "Daily Account",
        institution: "Local Bank",
        type: "checking",
        last4: "1234",
        balance: 5000,
        color: "#ff8a3d",
        futureAccountField: true,
        currency: "SAR"
    }],
    investments: [{
        id: "investment-1",
        name: "Index Fund",
        institution: "Broker",
        type: "fund",
        value: 20000,
        currency: "INR",
        color: "#70d9a0",
        futureInvestmentField: true
    }],
    cards: [{
        id: "card-1",
        name: "Rewards Card",
        issuer: "Local Bank",
        last4: "9876",
        limit: 10000,
        balance: 1250,
        color: "#6ec8ff",
        currency: "SAR"
    }],
    transactions: [
        { id: "t1", type: "expense", amount: 250, balanceImpact: -250, date: "2026-09-10", category: "Food", sourceKind: "account", sourceId: "account-1", note: "Groceries", createdAt: "2026-09-10T12:00:00Z" },
        { id: "t2", type: "income", amount: 1000, date: "2026-09-11", category: "Salary", sourceKind: "account", sourceId: "account-1", note: "", createdAt: "2026-09-11T12:00:00Z" }
    ]
};

const valid = validation.validate("finance", data, { source: "test" });
if (!valid.valid || valid.issues.length) throw new Error("A current Finance dataset failed validation.");
if (valid.value.futureRootField?.version !== 2 || valid.value.accounts[0].futureAccountField !== true || valid.value.investments[0].futureInvestmentField !== true) {
    throw new Error("Finance normalization discarded forward-compatible fields.");
}

const summary = model.summarize(valid.value, new Date(2026, 8, 24));
if (summary.accountBalance !== 5000 || summary.investmentBalance !== 1000 || summary.cardBalance !== 1250 || summary.netPosition !== 4750) {
    throw new Error("Finance balance summary is incorrect.");
}
if (summary.monthExpenses !== 250 || summary.monthIncome !== 1000) {
    throw new Error("Finance monthly transaction summary is incorrect.");
}
if (model.sortTransactions(data.transactions)[0].id !== "t2") {
    throw new Error("Finance transactions are not sorted newest first.");
}
if (
    model.applyBalanceImpact(5000, -250) !== 4750 ||
    model.applyBalanceImpact(4750, 250) !== 5000 ||
    model.applyBalanceImpact(5000, 300) !== 5300
) {
    throw new Error("Finance account balance impacts are not reversible.");
}
if (model.convertAmount(100, "SAR", "INR", { SAR_INR: 20 }) !== 2000 || model.convertAmount(2000, "INR", "SAR", { SAR_INR: 20 }) !== 100) {
    throw new Error("Finance SAR/INR reciprocal conversion is incorrect.");
}
if (model.convertAmount(100, "SAR", "INR", {}) !== null) {
    throw new Error("Finance must not invent a conversion when the manual factor is missing.");
}
const inrSummary = model.summarize({ ...valid.value, currency: "INR" }, new Date(2026, 8, 24));
if (inrSummary.netPosition !== 95000 || inrSummary.accountBalance !== 100000 || inrSummary.investmentBalance !== 20000 || inrSummary.cardBalance !== 25000) {
    throw new Error("Finance display-currency conversion changed the net-worth arithmetic.");
}

const invalid = validation.validate("finance", {
    currency: "XYZ",
    accounts: [{ id: "same", name: "", last4: "123456", balance: "bad" }, { id: "same", name: "Second", balance: 1 }],
    cards: [],
    transactions: [{ id: "t", type: "transfer", amount: -2, date: "bad", category: "", sourceKind: "bank", sourceId: "missing" }]
});
const codes = new Set(invalid.issues.map(issue => issue.code));
for (const code of ["finance.currency.invalid", "field.required", "field.duplicate-id", "finance.last-four.invalid", "field.invalid-number", "finance.transaction-type.invalid", "finance.source-kind.invalid", "finance.date.invalid"]) {
    if (!codes.has(code)) throw new Error(`Missing Finance validation issue: ${code}`);
}
if (validation.inspect("finance", invalid, { mode: "compatibility" }).value !== invalid) {
    throw new Error("Finance compatibility mode changed existing data.");
}

const html = readFileSync(new URL("../finance/index.html", import.meta.url), "utf8");
if (/id=["'][^"']*(?:cardNumber|accountNumber|cvv|pin)[^"']*["']/i.test(html) || /type=["']password["']/i.test(html)) {
    throw new Error("Finance UI asks for prohibited sensitive banking credentials.");
}
for (const id of ["accountForm", "investmentForm", "cardForm", "accountExpenseForm", "accountsList", "investmentsList", "cardsList", "accountLedgerList", "sarInrRate", "investmentTotal", "netPosition"]) {
    if (!html.includes(`id="${id}"`)) throw new Error(`Finance UI is missing ${id}.`);
}
for (const removedId of ["transactionForm", "transactionList", "transactionFilter"]) {
    if (html.includes(`id="${removedId}"`)) throw new Error(`Global Finance ledger remains in the UI: ${removedId}`);
}
if (!html.includes("<option value=\"expense\">Debit</option>") || !html.includes("<option value=\"income\">Credit</option>")) {
    throw new Error("Account ledger does not expose both Debit and Credit entry types.");
}
if (!/<dialog id="accountDialog"[^>]*data-static-backdrop/.test(html)) {
    throw new Error("Add Account dialog can still be dismissed by clicking its backdrop.");
}
const appSource = readFileSync(new URL("../finance/app.js", import.meta.url), "utf8");
for (const requiredPattern of ["openAccountLedger", "openInvestment", "entryType === \"income\" ? entryAmount : -entryAmount", "applyBalanceImpact", "convertAmount", "!dialog.hasAttribute(\"data-static-backdrop\")"]) {
    if (!appSource.includes(requiredPattern)) throw new Error(`Account ledger balance wiring is missing: ${requiredPattern}`);
}

console.log("Finance passed: summaries, ordering, validation, future fields, and safe last-four-only UI are correct.");
