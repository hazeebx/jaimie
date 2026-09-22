import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    setDoc
} from "firebase/firestore";

const PROJECT_ID = "demo-jaimie-rules";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;

let testEnvironment;

function datasetRecord(key) {
    return {
        key,
        value: {},
        updatedAt: "2026-09-08T00:00:00.000Z",
        updatedAtMs: 1788825600000,
        version: 1,
        deviceId: "rules-test-device"
    };
}

before(async () => {
    testEnvironment = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            host: FIRESTORE_HOST,
            port: FIRESTORE_PORT,
            rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
        }
    });
});

beforeEach(async () => {
    await testEnvironment.clearFirestore();
});

after(async () => {
    await testEnvironment?.cleanup();
});

test("an authenticated user can create, read, list, and delete their own datasets", async () => {
    const alice = testEnvironment.authenticatedContext("alice").firestore();
    const day = doc(alice, "users/alice/data/day");

    await assertSucceeds(setDoc(day, datasetRecord("day")));
    const snapshot = await assertSucceeds(getDoc(day));
    assert.equal(snapshot.data().key, "day");
    await assertSucceeds(getDocs(collection(alice, "users/alice/data")));
    await assertSucceeds(deleteDoc(day));
});

test("a user cannot read, list, write, or delete another user's datasets", async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
        await setDoc(
            doc(context.firestore(), "users/bob/data/day"),
            datasetRecord("day")
        );
    });

    const alice = testEnvironment.authenticatedContext("alice").firestore();
    const bobDay = doc(alice, "users/bob/data/day");

    await assertFails(getDoc(bobDay));
    await assertFails(getDocs(collection(alice, "users/bob/data")));
    await assertFails(setDoc(bobDay, datasetRecord("day")));
    await assertFails(deleteDoc(bobDay));
});

test("unauthenticated requests are denied", async () => {
    const guest = testEnvironment.unauthenticatedContext().firestore();
    const day = doc(guest, "users/alice/data/day");

    await assertFails(getDoc(day));
    await assertFails(setDoc(day, datasetRecord("day")));
});

test("paths outside the user dataset collection are denied", async () => {
    const alice = testEnvironment.authenticatedContext("alice").firestore();

    await assertFails(setDoc(
        doc(alice, "users/alice/profile/settings"),
        { theme: "dark" }
    ));
    await assertFails(setDoc(
        doc(alice, "public/example"),
        { visible: true }
    ));
    await assertFails(setDoc(
        doc(alice, "users/alice/data/day/private/example"),
        { visible: false }
    ));
});
