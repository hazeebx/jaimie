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
    let activeLedgerAccountId = "";

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
        const actions = element("div", "entity-actions");
        if (kind === "account") {
            const ledger = element("button", "menu-btn", "☰");
            ledger.type = "button";
            ledger.setAttribute("aria-label", `Open ledger for ${item.name || "account"}`);
            ledger.title = "Open account ledger";
            ledger.addEventListener("click", () => openAccountLedger(item.id));
            actions.append(ledger);
        }
        actions.append(edit);
        top.append(copy, actions);
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

    function renderAccountLedger() {
        const account = data.accounts.find(item => item.id === activeLedgerAccountId);
        if (!account) return;
        $("ledgerAccountName").textContent = account.name || "Account";
        $("ledgerAccountBalance").textContent = formatMoney(account.balance);
        const list = $("accountLedgerList");
        const transactions = model.sortTransactions(data.transactions)
            .filter(transaction => ["expense", "income"].includes(transaction.type) && transaction.sourceKind === "account" && transaction.sourceId === account.id);
        list.replaceChildren();
        if (!transactions.length) {
            list.append(emptyState("No entries yet", "Add a debit or credit for this account above."));
            return;
        }

        transactions.forEach(transaction => {
            const isCredit = transaction.type === "income";
            const row = element("article", `transaction-row${isCredit ? " income" : ""}`);
            const main = element("div", "transaction-main");
            main.append(element("span", "transaction-sign", isCredit ? "+" : "−"));
            const copy = element("div", "transaction-copy");
            copy.append(element("strong", "", transaction.category || "Uncategorized"));
            const metadata = [formatDate(transaction.date), transaction.note].filter(Boolean).join(" · ");
            copy.append(element("span", "", metadata));
            main.append(copy);

            const side = element("div", "transaction-side");
            side.append(element("div", "transaction-amount", `${isCredit ? "+" : "−"}${formatMoney(transaction.amount)}`));
            const remove = element("button", "edit-btn", "Delete");
            remove.type = "button";
            remove.addEventListener("click", () => deleteLedgerExpense(transaction.id));
            side.append(remove);
            row.append(main, side);
            list.append(row);
        });
    }

    function render() {
        $("currencySelect").value = data.currency;
        renderSummary();
        renderAccounts();
        renderCards();
        if ($("accountLedgerDialog").open) renderAccountLedger();
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

    function openAccountLedger(accountId) {
        if (!data.accounts.some(item => item.id === accountId)) return;
        activeLedgerAccountId = accountId;
        $("accountExpenseForm").reset();
        $("expenseDate").value = todayKey();
        renderAccountLedger();
        $("accountLedgerDialog").showModal();
    }

    async function deleteLedgerExpense(transactionId) {
        const transaction = data.transactions.find(item => item.id === transactionId);
        const account = data.accounts.find(item => item.id === transaction?.sourceId);
        if (!transaction || !account || !confirm(`Delete this ${formatMoney(transaction.amount)} expense?`)) return;

        // Only entries created by the balance-linked ledger carry this value.
        // Older records remain removable without retroactively altering balance.
        const reverseImpact = Object.hasOwn(transaction, "balanceImpact")
            ? -amount(transaction.balanceImpact)
            : 0;
        const updatedAccount = {
            ...account,
            balance: model.applyBalanceImpact(account.balance, reverseImpact),
            updatedAt: new Date().toISOString()
        };
        data.accounts = data.accounts.map(item => item.id === account.id ? updatedAccount : item);
        data.transactions = data.transactions.filter(item => item.id !== transactionId);
        await saveAndRender();
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

    $("accountExpenseForm").addEventListener("submit", async event => {
        event.preventDefault();
        const account = data.accounts.find(item => item.id === activeLedgerAccountId);
        const entryAmount = Math.max(0, amount($("expenseAmount").value));
        const entryType = $("ledgerEntryType").value === "income" ? "income" : "expense";
        if (!account || entryAmount <= 0) return;
        const now = new Date().toISOString();
        const transaction = {
            id: id("transaction"),
            type: entryType,
            amount: entryAmount,
            balanceImpact: entryType === "income" ? entryAmount : -entryAmount,
            date: $("expenseDate").value,
            category: text($("expenseCategory").value, 60),
            sourceKind: "account",
            sourceId: account.id,
            note: text($("expenseNote").value, 160),
            createdAt: now,
            updatedAt: now
        };
        const updatedAccount = {
            ...account,
            balance: model.applyBalanceImpact(account.balance, transaction.balanceImpact),
            updatedAt: now
        };
        data.accounts = data.accounts.map(item => item.id === account.id ? updatedAccount : item);
        data.transactions = [...data.transactions, transaction];
        $("accountExpenseForm").reset();
        $("expenseDate").value = todayKey();
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

    $("addAccountBtn").addEventListener("click", () => openAccount());
    $("addCardBtn").addEventListener("click", () => openCard());
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
