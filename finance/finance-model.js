(() => {
    "use strict";

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function monthKey(value) {
        return String(value || "").slice(0, 7);
    }

    function summarize(data, referenceDate = new Date()) {
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const cards = Array.isArray(data?.cards) ? data.cards : [];
        const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
        const currentMonth = monthKey(
            `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`
        );

        const accountBalance = accounts.reduce((total, account) => total + number(account.balance), 0);
        const cardBalance = cards.reduce((total, card) => total + Math.max(0, number(card.balance)), 0);
        const monthTransactions = transactions.filter(transaction => monthKey(transaction.date) === currentMonth);
        const monthExpenses = monthTransactions
            .filter(transaction => transaction.type === "expense" && transaction.sourceKind === "account")
            .reduce((total, transaction) => total + Math.max(0, number(transaction.amount)), 0);
        const monthIncome = monthTransactions
            .filter(transaction => transaction.type === "income")
            .reduce((total, transaction) => total + Math.max(0, number(transaction.amount)), 0);

        return {
            accountBalance,
            cardBalance,
            netPosition: accountBalance - cardBalance,
            monthExpenses,
            monthIncome
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

    window.JAIMIEFinanceModel = Object.freeze({ summarize, sortTransactions, applyBalanceImpact });
})();
