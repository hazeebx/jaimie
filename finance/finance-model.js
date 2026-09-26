(() => {
    "use strict";

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function monthKey(value) {
        return String(value || "").slice(0, 7);
    }

    function normalizedCurrency(value, fallback = "SAR") {
        const currency = String(value || fallback).trim().toUpperCase();
        return currency || fallback;
    }

    function sarInrRate(data) {
        const rate = number(data?.exchangeRates?.SAR_INR);
        return rate > 0 ? rate : 0;
    }

    function convertAmount(value, fromCurrency, toCurrency, exchangeRates = {}) {
        const amount = number(value);
        const from = normalizedCurrency(fromCurrency);
        const to = normalizedCurrency(toCurrency);
        if (from === to) return amount;

        const rate = number(exchangeRates.SAR_INR);
        if (rate <= 0) return null;
        if (from === "SAR" && to === "INR") return amount * rate;
        if (from === "INR" && to === "SAR") return amount / rate;
        return null;
    }

    function totalConverted(items, valueField, displayCurrency, exchangeRates, fallbackCurrency) {
        let total = 0;
        let unconvertedCount = 0;
        for (const item of items) {
            const converted = convertAmount(item?.[valueField], item?.currency || fallbackCurrency, displayCurrency, exchangeRates);
            if (converted === null) unconvertedCount += 1;
            else total += converted;
        }
        return { total, unconvertedCount };
    }

    function summarize(data, referenceDate = new Date()) {
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const investments = Array.isArray(data?.investments) ? data.investments : [];
        const cards = Array.isArray(data?.cards) ? data.cards : [];
        const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
        const displayCurrency = normalizedCurrency(data?.currency);
        const exchangeRates = data?.exchangeRates || {};
        const currentMonth = monthKey(
            `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`
        );

        const accountResult = totalConverted(accounts, "balance", displayCurrency, exchangeRates, displayCurrency);
        const investmentResult = totalConverted(investments, "value", displayCurrency, exchangeRates, displayCurrency);
        const cardResult = totalConverted(cards, "balance", displayCurrency, exchangeRates, displayCurrency);
        const accountBalance = accountResult.total;
        const investmentBalance = investmentResult.total;
        const cardBalance = cardResult.total;
        const monthTransactions = transactions.filter(transaction => monthKey(transaction.date) === currentMonth);
        const sumTransactions = type => monthTransactions
            .filter(transaction => transaction.type === type && (type !== "expense" || transaction.sourceKind === "account"))
            .reduce((result, transaction) => {
                const source = accounts.find(account => account.id === transaction.sourceId);
                const converted = convertAmount(
                    Math.max(0, number(transaction.amount)),
                    transaction.currency || source?.currency || displayCurrency,
                    displayCurrency,
                    exchangeRates
                );
                if (converted === null) result.unconvertedCount += 1;
                else result.total += converted;
                return result;
            }, { total: 0, unconvertedCount: 0 });
        const expenseResult = sumTransactions("expense");
        const incomeResult = sumTransactions("income");

        return {
            accountBalance,
            investmentBalance,
            cardBalance,
            netPosition: accountBalance + investmentBalance - cardBalance,
            monthExpenses: expenseResult.total,
            monthIncome: incomeResult.total,
            unconvertedCount: accountResult.unconvertedCount + investmentResult.unconvertedCount + cardResult.unconvertedCount + expenseResult.unconvertedCount + incomeResult.unconvertedCount
        };
    }

    function sortTransactions(transactions) {
        return [...(Array.isArray(transactions) ? transactions : [])]
            .sort((left, right) => {
                const dateOrder = String(right.date || "").localeCompare(String(left.date || ""));
                if (dateOrder) return dateOrder;
                return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
            });
    }

    function applyBalanceImpact(balance, impact) {
        return Math.round((number(balance) + number(impact) + Number.EPSILON) * 100) / 100;
    }

    window.JAIMIEFinanceModel = Object.freeze({ summarize, sortTransactions, applyBalanceImpact, convertAmount, sarInrRate });
})();
