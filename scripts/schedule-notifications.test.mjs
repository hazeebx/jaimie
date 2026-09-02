import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../day_page/schedule-notifications.js", import.meta.url), "utf8");
const enabledKey = "jaimie-schedule-notifications-enabled-v1";
const date = "2026-09-02";
const at = time => new Date(`${date}T${time}:00`).getTime();
const item = (extra = {}) => ({ id: "a", title: "Test schedule", time: "12:00", notifyMinutes: 0, ...extra });

function harness({ now = at("12:00"), entries = [item()], permission = "granted", active = true,
    supported = true, storage = new Map(), locks, failNotification = false } = {}) {
    if (!storage.has(enabledKey)) storage.set(enabledKey, String(active));
    const notifications = [];
    const nodes = Object.fromEntries(["scheduleNotificationStatus", "enableScheduleNotifications", "testScheduleNotification"].map(id => [id, {
        textContent: "", disabled: false, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }
    }]));
    let prompts = 0;
    const data = { [date]: { schedule: entries } };
    class Clock extends Date { static now() { return now; } }
    class Notification {
        static permission = permission;
        static async requestPermission() { prompts++; return this.permission; }
        constructor(title, options) {
            if (failNotification) throw new Error("Unsupported desktop notification");
            Object.assign(this, { title, options, close() {} });
            notifications.push(this);
        }
    }
    const context = {
        Date: Clock, URL, Object, JSON, Number, console: { warn() {} }, Notification,
        navigator: { locks: locks || { request: async (_, options, callback) => callback({}) } },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        document: { currentScript: { src: "http://localhost:8000/JAIMIE/day_page/schedule-notifications.js" },
            getElementById: id => nodes[id], addEventListener() {} },
        isSecureContext: supported,
        JAIMIEData: { load: async () => data },
        location: { href: "" }, focus() {}, addEventListener() {}, setInterval() {}
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, notifications, nodes, data, storage, prompts: () => prompts,
        settle: async () => { await new Promise(resolve => setImmediate(resolve)); },
        check: () => context.JAIMIEScheduleNotifications.check() };
}

test("fires due reminder once across checks and reloads, using local time and normal sound", async () => {
    const h = harness(); await h.settle();
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].options.silent, undefined);
    await h.check(); assert.equal(h.notifications.length, 1);
    const reload = harness({ storage: h.storage }); await reload.settle();
    assert.equal(reload.notifications.length, 0);
    h.notifications[0].onclick();
    assert.equal(h.context.location.href, "http://localhost:8000/JAIMIE/day_page/index.html?date=2026-09-02");
});

test("lead times fire at their due time, never early", async () => {
    for (const lead of [0, 5, 10, 15]) {
        const due = at("12:00") - lead * 60_000;
        const early = harness({ now: due - 1, entries: [item({ notifyMinutes: lead })] }); await early.settle();
        assert.equal(early.notifications.length, 0);
        const ready = harness({ now: due, entries: [item({ notifyMinutes: lead })] }); await ready.settle();
        assert.equal(ready.notifications.length, 1);
    }
});

test("off, legacy, missing time, invalid dates and stale reminders do not fire", async () => {
    const h = harness({ entries: [item({ notifyMinutes: null }), item({ notifyMinutes: undefined }),
        item({ id: undefined }), item({ time: "" }), item({ time: "24:00" }), item({ notifyMinutes: -5 })] });
    await h.settle(); assert.equal(h.notifications.length, 0);
    const stale = harness({ now: at("12:06") }); await stale.settle(); assert.equal(stale.notifications.length, 0);
    const late = harness({ now: at("12:04") }); await late.settle(); assert.equal(late.notifications.length, 1);
});

test("disabled, denied, unsupported and dismissed permission never auto-prompt", async () => {
    for (const options of [{ active: false }, { permission: "denied" }, { permission: "default" }, { supported: false }]) {
        const h = harness(options); await h.settle();
        assert.equal(h.notifications.length, 0); assert.equal(h.prompts(), 0);
    }
    const h = harness({ permission: "default", active: false }); await h.settle();
    await h.nodes.enableScheduleNotifications.handlers.click();
    assert.equal(h.prompts(), 1); assert.equal(h.storage.get(enabledKey), "false");
});

test("test button sends a separate notification; disabling stops reminders", async () => {
    const h = harness({ entries: [] }); await h.settle();
    h.nodes.testScheduleNotification.handlers.click(); assert.equal(h.notifications.length, 1);
    await h.nodes.enableScheduleNotifications.handlers.click();
    h.data[date].schedule.push(item()); await h.check(); assert.equal(h.notifications.length, 1);
});

test("edited/deleted data is reloaded; reorder does not duplicate delivery", async () => {
    const h = harness({ entries: [item({ time: "12:10" })] }); await h.settle();
    h.data[date].schedule = []; await h.check(); assert.equal(h.notifications.length, 0);
    h.data[date].schedule = [item({ title: "Updated" }), item({ id: "b" })];
    await h.check(); assert.equal(h.notifications.length, 2);
    assert.match(h.notifications[0].title, /Updated/);
    h.data[date].schedule.reverse(); await h.check(); assert.equal(h.notifications.length, 2);
});

test("shared tab lock and receipts suppress simultaneous duplicates", async () => {
    let held = false;
    const locks = { async request(_, options, callback) {
        if (held) return callback(null);
        held = true;
        try { return await callback({}); } finally { held = false; }
    } };
    const storage = new Map();
    const a = harness({ storage, locks }); const b = harness({ storage, locks });
    await a.settle(); await b.settle(); await b.check();
    assert.equal(a.notifications.length + b.notifications.length, 1);
});

test("constructor failure is handled and does not mark an undelivered reminder sent", async () => {
    const h = harness({ failNotification: true }); await h.settle();
    assert.match(h.nodes.scheduleNotificationStatus.textContent, /failed/);
    const retry = harness({ storage: h.storage }); await retry.settle();
    assert.equal(retry.notifications.length, 1);
});

test("pre-midnight reminders for next-day schedules use local calendar date", async () => {
    const h = harness({ now: new Date("2026-09-01T23:55:00").getTime(), entries: [item({ time: "00:05", notifyMinutes: 10 })] });
    await h.settle(); assert.equal(h.notifications.length, 1);
});

test("Test works without scheduling enabled or Web Locks and does not turn scheduling on", async () => {
    const h = harness({ active: false, entries: [] }); await h.settle();
    h.context.navigator.locks = undefined;
    assert.equal(h.nodes.testScheduleNotification.disabled, false);
    await h.nodes.testScheduleNotification.handlers.click();
    assert.equal(h.notifications.length, 1);
    assert.equal(h.storage.get(enabledKey), "false");
    assert.match(h.nodes.scheduleNotificationStatus.textContent, /requested/);
    h.notifications[0].onshow();
    assert.match(h.nodes.scheduleNotificationStatus.textContent, /confirmed/);
});

test("Test requests permission from its own click, while blocked states remain actionable", async () => {
    const h = harness({ active: false, permission: "default", entries: [] }); await h.settle();
    h.context.Notification.requestPermission = async () => {
        h.context.Notification.permission = "granted";
        return "granted";
    };
    await h.nodes.testScheduleNotification.handlers.click();
    assert.equal(h.notifications.length, 1);
    for (const options of [{ permission: "denied" }, { supported: false }]) {
        const blocked = harness(options); await blocked.settle();
        assert.equal(blocked.nodes.testScheduleNotification.disabled, false);
        await blocked.nodes.testScheduleNotification.handlers.click();
        assert.equal(blocked.notifications.length, 0);
        assert.match(blocked.nodes.scheduleNotificationStatus.textContent, /blocked|HTTPS/);
    }
});

test("missing Notifications API gives recovery advice without throwing", async () => {
    const h = harness({ active: false }); await h.settle();
    delete h.context.Notification;
    await h.nodes.testScheduleNotification.handlers.click();
    assert.match(h.nodes.scheduleNotificationStatus.textContent, /does not expose/);
});
