import test from "node:test";
import assert from "node:assert/strict";
import { describeChanges } from "../src/history.js";
import {
  userStorage,
  writeStore,
  readStore,
  backupQuote,
  findBackup,
} from "../src/storage.js";
const original = () => ({
  customerData: { name: "Customer", contactPerson: "Representative" },
  conditions: "Original terms",
  discount: 0,
  netTotal: 100,
  items: [{ item: { id: "a", name: "Artwork", price: 100 }, quantity: 1 }],
});
test("Version comparison identifies client details, conditions, item quantities, prices and notes", () => {
  const before = original(),
    after = structuredClone(before);
  after.customerData.contactPerson = "Updated contact";
  after.conditions = "Updated terms";
  after.discount = 10;
  after.items[0].quantity = 2;
  after.items[0].customPrice = 150;
  after.items[0].customDescription = "New notes";
  after.netTotal = 270;
  const changes = describeChanges(before, after);
  assert.equal(changes.length, 7);
  assert.ok(changes.some((v) => v.startsWith("Artwork: quantity 1")));
  assert.ok(changes.includes("Notes changed: Artwork"));
  assert.equal(before.items[0].quantity, 1);
});
test("Version comparison handles removed and added products without relying on array order", () => {
  const before = original(),
    after = {
      ...original(),
      items: [{ item: { id: "b", name: "Tank", price: 100 }, quantity: 1 }],
    };
  assert.deepEqual(describeChanges(before, after), [
    "Removed: Artwork",
    "Added: Tank",
  ]);
  assert.deepEqual(describeChanges(before, structuredClone(before)), []);
});
test("Browser drafts and confirmed backups are isolated between verified users on the same device", () => {
  const data = new Map(),
    storage = {
      getItem: (key) => data.get(key) || null,
      setItem: (key, value) => data.set(key, value),
    };
  const a = userStorage("00000000-0000-4000-8000-000000000001", storage),
    b = userStorage("00000000-0000-4000-8000-000000000002", storage);
  writeStore("draft", { customer: "Private A" }, a);
  assert.equal(readStore("draft", null, b), null);
  const q = {
    vendor: "PASHA",
    quotationNumber: "2026-036",
    dateOfIssue: "2026-11-21",
    customerData: { name: "Private A" },
  };
  backupQuote(q, a);
  assert.equal(
    findBackup(q.vendor, q.quotationNumber, q.dateOfIssue, b),
    undefined,
  );
  assert.deepEqual(
    findBackup(q.vendor, q.quotationNumber, q.dateOfIssue, a),
    q,
  );
});
test("Unscoped historic browser copies are not loaded into an authenticated user account", () => {
  const data = new Map([
      [
        "pashaquotes:quotations",
        JSON.stringify([{ customer: "Legacy private data" }]),
      ],
    ]),
    storage = {
      getItem: (key) => data.get(key) || null,
      setItem: (key, value) => data.set(key, value),
    };
  const scope = userStorage("00000000-0000-4000-8000-000000000001", storage);
  assert.deepEqual(readStore("pashaquotes:quotations", [], scope), []);
  assert.throws(() => userStorage(""), /verified user/);
});
