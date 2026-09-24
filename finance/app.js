(() => {
    "use strict";

    const DATA_KEY = "finance";
    const safeContent = window.JAIMIESafeContent;
    const model = window.JAIMIEFinanceModel;
    const $ = id => document.getElementById(id);

    let data = {
        currency: "SAR",
        accounts: [],
        cards: [],
        transactions: []
    };

    function text(value, maxLength = 100) {
        return safeContent.normalizeText(value, { maxLength });
    }

    function amount(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
    }

    function id(prefix) {
        const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return `${prefix}-${token}`;
    }

    function todayKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    function formatMoney(value) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: data.currency,
                maximumFractionDigits: 2
            }).format(amount(value));
        } catch {
            return `${data.currency} ${amount(value).toFixed(2)}`;
        }
    }

    function formatDate(value) {
        const parsed = new Date(`${value}T00:00:00`);
        return Number.isNaN(parsed.getTime())
            ? value
            : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function emptyState(title, message) {
        const wrapper = element("div", "empty-state");
        wrapper.append(element("strong", "", title), document.createTextNode(message));
        return wrapper;
    }

    async function persist() {
        await window.JAIMIEData.save(DATA_KEY, data);
    }

    async function saveAndRender() {
        await persist();
        render();
    }

    async function load() {
        const stored = await window.JAIMIEData.load(DATA_KEY);
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
            data = {
                ...stored,
                currency: typeof stored.currency === "string" ? stored.currency : "SAR",
                accounts: Array.isArray(stored.accounts) ? stored.accounts : [],
                cards: Array.isArray(stored.cards) ? stored.cards : [],
                transactions: Array.isArray(stored.transactions) ? stored.transactions : []
            };
        }
    }

    function renderSummary() {
        const summary = model.summarize(data, new Date());
        $("accountTotal").textContent = formatMoney(summary.accountBalance);
        $("cardTotal").textContent = formatMoney(summary.cardBalance);
        $("netPosition").textContent = formatMoney(summary.netPosition);
        $("monthExpenses").textContent = formatMoney(summary.monthExpenses);
        $("monthIncome").textContent = `Income: ${formatMoney(summary.monthIncome)}`;
        $("accountCount").textContent = `${data.accounts.length} ${data.accounts.length === 1 ? "account" : "accounts"}`;
        $("cardCount").textContent = `${data.cards.length} ${data.cards.length === 1 ? "card" : "cards"}`;
    }

    function createEntityCard(item, kind) {
        const card = element("article", "entity-card");
        card.style.setProperty("--entity-color", /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#ff8a3d");
        const top = element("div", "entity-top");
        const copy = element("div");
        copy.append(element("div", "entity-name", item.name || (kind === "account" ? "Untitled account" : "Untitled card")));

        const details = [];
        if (kind === "account") details.push(item.institution, text(item.type).replace(/^./, character => character.toUpperCase()));
        else details.push(item.issuer);
        if (item.last4) details.push(`•••• ${item.last4}`);
        copy.append(element("div", "entity-meta", details.filter(Boolean).join(" · ") || "No additional details"));

        const edit = element("button", "edit-btn", "Edit");
        edit.type = "button";
        edit.addEventListener("click", () => kind === "account" ? openAccount(item.id) : openCard(item.id));
        top.append(copy, edit);
        card.append(top);

        if (kind === "account") {
            card.append(element("div", "entity-balance", formatMoney(item.balance)));
            card.append(element("div", "entity-sub", "Current balance"));
        } else {
            const available = Math.max(0, amount(item.limit) - amount(item.balance));
            card.append(element("div", "entity-balance", formatMoney(item.balance)));
            card.append(element("div", "entity-sub", `Outstanding · ${formatMoney(available)} available of ${formatMoney(item.limit)}`));
        }
        return card;
    }

    function renderAccounts() {
        const list = $("accountsList");
        list.replaceChildren();
        if (!data.accounts.length) {
            list.append(emptyState("No accounts yet", "Add an account to begin tracking its balance."));
            return;
        }
        data.accounts.forEach(account => list.append(createEntityCard(account, "account")));
    }

    function renderCards() {
        const list = $("cardsList");
        list.replaceChildren();
        if (!data.cards.length) {
            list.append(emptyState("No cards yet", "Add a card to track its outstanding balance."));
            return;
        }
        data.cards.forEach(card => list.append(createEntityCard(card, "card")));
    }

    function sourceName(transaction) {
        if (transaction.sourceKind === "account") {
            const account = data.accounts.find(item => item.id === transaction.sourceId);
            return account ? account.name : "Deleted account";
        }
        if (transaction.sourceKind === "card") {
            const card = data.cards.find(item => item.id === transaction.sourceId);
            return card ? card.name : "Deleted card";
        }
        return "Not linked";
    }

    function renderTransactions() {
        const list = $("transactionList");
        const filter = $("transactionFilter").value;
        const transactions = model.sortTransactions(data.transactions)
            .filter(transaction => filter === "all" || transaction.type === filter);
        list.replaceChildren();
        if (!transactions.length) {
            list.append(emptyState("No ledger entries", filter === "all" ? "Add income or an expense manually." : `No ${filter} entries match this filter.`));
            return;
        }

        transactions.forEach(transaction => {
            const income = transaction.type === "income";
            const row = element("article", `transaction-row${income ? " income" : ""}`);
            const main = element("div", "transaction-main");
            main.append(element("span", "transaction-sign", income ? "+" : "−"));
            const copy = element("div", "transaction-copy");
            copy.append(element("strong", "", transaction.category || "Uncategorized"));
            const metadata = [formatDate(transaction.date), sourceName(transaction), transaction.note].filter(Boolean).join(" · ");
            copy.append(element("span", "", metadata));
            main.append(copy);

            const side = element("div", "transaction-side");
            side.append(element("div", "transaction-amount", `${income ? "+" : "−"}${formatMoney(transaction.amount)}`));
            const edit = element("button", "edit-btn", "Edit");
            edit.type = "button";
            edit.addEventListener("click", () => openTransaction(transaction.id));
            side.append(edit);
            row.append(main, side);
            list.append(row);
        });
    }

    function render() {
        $("currencySelect").value = data.currency;
        renderSummary();
        renderAccounts();
        renderCards();
        renderTransactions();
    }

    function closeDialog(id) {
        const dialog = $(id);
        if (dialog.open) dialog.close();
    }

    function openAccount(accountId = "") {
        const current = data.accounts.find(item => item.id === accountId);
        $("accountForm").reset();
        $("accountId").value = current?.id || "";
        $("accountName").value = current?.name || "";
        $("accountInstitution").value = current?.institution || "";
        $("accountType").value = current?.type || "checking";
        $("accountLast4").value = current?.last4 || "";
        $("accountBalance").value = current?.balance ?? 0;
        $("accountColor").value = /^#[0-9a-f]{6}$/i.test(current?.color || "") ? current.color : "#ff8a3d";
        $("accountDialogTitle").textContent = current ? "Edit Account" : "Add Account";
        $("deleteAccountBtn").classList.toggle("hidden", !current);
        $("accountDialog").showModal();
    }

    function openCard(cardId = "") {
        const current = data.cards.find(item => item.id === cardId);
        $("cardForm").reset();
        $("cardId").value = current?.id || "";
        $("cardName").value = current?.name || "";
        $("cardIssuer").value = current?.issuer || "";
        $("cardLast4").value = current?.last4 || "";
        $("cardLimit").value = current?.limit ?? 0;
        $("cardBalance").value = current?.balance ?? 0;
        $("cardColor").value = /^#[0-9a-f]{6}$/i.test(current?.color || "") ? current.color : "#6ec8ff";
        $("cardDialogTitle").textContent = current ? "Edit Card" : "Add Card";
        $("deleteCardBtn").classList.toggle("hidden", !current);
        $("cardDialog").showModal();
    }

    function populateSources(selected = "none:") {
        const select = $("transactionSource");
        select.replaceChildren();
        select.add(new Option("Not linked", "none:"));
        if (data.accounts.length) {
            const group = document.createElement("optgroup");
            group.label = "Accounts";
            data.accounts.forEach(account => group.append(new Option(account.name, `account:${account.id}`)));
            select.append(group);
        }
        if (data.cards.length) {
            const group = document.createElement("optgroup");
            group.label = "Cards";
            data.cards.forEach(card => group.append(new Option(card.name, `card:${card.id}`)));
            select.append(group);
        }
        const optionExists = [...select.options].some(option => option.value === selected);
        select.value = optionExists ? selected : "none:";
    }

    function openTransaction(transactionId = "") {
        const current = data.transactions.find(item => item.id === transactionId);
        $("transactionForm").reset();
        $("transactionId").value = current?.id || "";
        $("transactionType").value = current?.type || "expense";
        $("transactionDate").value = current?.date || todayKey();
        $("transactionAmount").value = current?.amount ?? "";
        $("transactionCategory").value = current?.category || "";
        $("transactionNote").value = current?.note || "";
        populateSources(current ? `${current.sourceKind || "none"}:${current.sourceId || ""}` : "none:");
        $("transactionDialogTitle").textContent = current ? "Edit Entry" : "Add Entry";
        $("deleteTransactionBtn").classList.toggle("hidden", !current);
        $("transactionDialog").showModal();
    }

    $("accountForm").addEventListener("submit", async event => {
        event.preventDefault();
        const existing = data.accounts.find(item => item.id === $("accountId").value);
        const now = new Date().toISOString();
        const account = {
            ...(existing || {}),
            id: existing?.id || id("account"),
            name: text($("accountName").value, 80),
            institution: text($("accountInstitution").value, 80),
            type: $("accountType").value,
            last4: text($("accountLast4").value, 4),
            balance: amount($("accountBalance").value),
            color: $("accountColor").value,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        data.accounts = existing ? data.accounts.map(item => item.id === existing.id ? account : item) : [...data.accounts, account];
        closeDialog("accountDialog");
        await saveAndRender();
    });

    $("cardForm").addEventListener("submit", async event => {
        event.preventDefault();
        const existing = data.cards.find(item => item.id === $("cardId").value);
        const now = new Date().toISOString();
        const card = {
            ...(existing || {}),
            id: existing?.id || id("card"),
            name: text($("cardName").value, 80),
            issuer: text($("cardIssuer").value, 80),
            last4: text($("cardLast4").value, 4),
            limit: Math.max(0, amount($("cardLimit").value)),
            balance: Math.max(0, amount($("cardBalance").value)),
            color: $("cardColor").value,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        data.cards = existing ? data.cards.map(item => item.id === existing.id ? card : item) : [...data.cards, card];
        closeDialog("cardDialog");
        await saveAndRender();
    });

    $("transactionForm").addEventListener("submit", async event => {
        event.preventDefault();
        const existing = data.transactions.find(item => item.id === $("transactionId").value);
        const [sourceKind, sourceId = ""] = $("transactionSource").value.split(":");
        const now = new Date().toISOString();
        const transaction = {
            ...(existing || {}),
            id: existing?.id || id("transaction"),
            type: $("transactionType").value,
            amount: Math.max(0, amount($("transactionAmount").value)),
            date: $("transactionDate").value,
            category: text($("transactionCategory").value, 60),
            sourceKind,
            sourceId,
            note: text($("transactionNote").value, 160),
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        data.transactions = existing ? data.transactions.map(item => item.id === existing.id ? transaction : item) : [...data.transactions, transaction];
        closeDialog("transactionDialog");
        await saveAndRender();
    });

    $("deleteAccountBtn").addEventListener("click", async () => {
        const accountId = $("accountId").value;
        const current = data.accounts.find(item => item.id === accountId);
        if (!current || !confirm(`Delete ${current.name}? Existing ledger entries will remain as history.`)) return;
        data.accounts = data.accounts.filter(item => item.id !== accountId);
        closeDialog("accountDialog");
        await saveAndRender();
    });

    $("deleteCardBtn").addEventListener("click", async () => {
        const cardId = $("cardId").value;
        const current = data.cards.find(item => item.id === cardId);
        if (!current || !confirm(`Delete ${current.name}? Existing ledger entries will remain as history.`)) return;
        data.cards = data.cards.filter(item => item.id !== cardId);
        closeDialog("cardDialog");
        await saveAndRender();
    });

    $("deleteTransactionBtn").addEventListener("click", async () => {
        const transactionId = $("transactionId").value;
        if (!data.transactions.some(item => item.id === transactionId) || !confirm("Delete this ledger entry?")) return;
        data.transactions = data.transactions.filter(item => item.id !== transactionId);
        closeDialog("transactionDialog");
        await saveAndRender();
    });

    $("addAccountBtn").addEventListener("click", () => openAccount());
    $("addCardBtn").addEventListener("click", () => openCard());
    $("addTransactionBtn").addEventListener("click", () => openTransaction());
    $("transactionFilter").addEventListener("change", renderTransactions);
    $("currencySelect").addEventListener("change", async event => {
        data = { ...data, currency: event.target.value };
        await saveAndRender();
    });

    document.querySelectorAll("[data-close]").forEach(button => {
        button.addEventListener("click", () => closeDialog(button.dataset.close));
    });
    document.querySelectorAll("dialog").forEach(dialog => {
        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close();
        });
    });

    async function init() {
        try {
            await load();
            render();
        } catch (error) {
            console.error("Finance initialization failed:", error);
            alert("Could not load Finance data. Reload to try again.");
        }
    }

    init();
})();
