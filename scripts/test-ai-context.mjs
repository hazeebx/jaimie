const code = process.argv[2];
const baseUrl = process.env.JAIMIE_AI_URL || "http://127.0.0.1:8765";
const origin = "http://localhost:8000";

if (!/^\d{6}$/.test(code || "")) {
    throw new Error("Usage: node scripts/test-ai-context.mjs <six-digit-pairing-code>");
}

const pairResponse = await fetch(`${baseUrl}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ code })
});
const pair = await pairResponse.json();
if (!pairResponse.ok || !pair.session_token) throw new Error(`Pairing failed: ${JSON.stringify(pair)}`);

const chatResponse = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pair.session_token}`,
        Origin: origin
    },
    body: JSON.stringify({
        message: "What should I prioritize today? Answer in one short sentence.",
        history: [],
        context: {
            schema_version: 1,
            user_context: {
                local_date: "2026-09-05",
                requested_range: { start: "2026-09-05", end: "2026-09-05", label: "today" }
            },
            calendar_tasks: [
                {
                    title: "Finish Phase 3 verification",
                    date: "2026-09-05",
                    category: "Work",
                    completed: false,
                    notes: "Due before lunch"
                },
                {
                    title: "Old completed item",
                    date: "2026-09-05",
                    category: "Work",
                    completed: true,
                    notes: ""
                }
            ]
        }
    })
});

if (!chatResponse.ok || !chatResponse.body) throw new Error(`Chat failed with HTTP ${chatResponse.status}`);

const reader = chatResponse.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let answer = "";

while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        if (item.type === "token") answer += item.content;
        if (item.type === "error") throw new Error(item.error);
    }
    if (done) break;
}

if (!answer.includes("Phase 3 verification")) {
    throw new Error(`Model did not use the supplied task context. Response: ${answer}`);
}

const unauthorized = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer invalid", Origin: origin },
    body: JSON.stringify({ message: "test", history: [] })
});
if (unauthorized.status !== 401) throw new Error(`Expected invalid token to return 401, got ${unauthorized.status}`);

const emptyWorkoutResponse = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pair.session_token}`,
        Origin: origin
    },
    body: JSON.stringify({
        message: "What workout do I have today?",
        history: [],
        context: {
            schema_version: 1,
            user_context: {
                local_date: "2026-09-05",
                requested_range: { start: "2026-09-05", end: "2026-09-05", label: "today" }
            },
            workouts: {
                data_checked: true,
                days: { "2026-09-05": { rest_day: false, exercises: [] } },
                personal_records: []
            }
        }
    })
});
if (!emptyWorkoutResponse.ok || !emptyWorkoutResponse.body) {
    throw new Error(`Empty-workout check failed with HTTP ${emptyWorkoutResponse.status}`);
}

let emptyWorkoutAnswer = "";
let emptyWorkoutBuffer = "";
const emptyWorkoutDecoder = new TextDecoder();
for await (const chunk of emptyWorkoutResponse.body) {
    emptyWorkoutBuffer += emptyWorkoutDecoder.decode(chunk, { stream: true });
    const lines = emptyWorkoutBuffer.split("\n");
    emptyWorkoutBuffer = lines.pop() || "";
    for (const line of lines) {
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        if (item.type === "token") emptyWorkoutAnswer += item.content;
    }
}
if (/don't have access|do not have access|cannot access/i.test(emptyWorkoutAnswer)) {
    throw new Error(`Model incorrectly denied context access: ${emptyWorkoutAnswer}`);
}

console.log(`Phase 3 context test passed. Task response: ${answer.trim()}`);
console.log(`Empty-workout response: ${emptyWorkoutAnswer.trim()}`);
