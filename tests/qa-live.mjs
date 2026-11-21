import assert from "node:assert/strict";
import fs from "node:fs";
import { handler, rpc } from "../netlify/functions/quotes.mjs";
import { loadKit } from "../src/domain.js";
assert.equal(
  process.env.QUOTATION_MODE,
  "qa",
  "Live tests must use isolated QA numbering",
);
const results = [];
const base = () => ({
  vendor: "SCHROEDER",
  customerData: {
    name: "QA - automated test",
    country: "España",
    contactPerson: "Test representative",
    phone: "+00 000",
    email: "qa@example.invalid",
  },
  discount: 10,
  conditions: "QA terms\nSecond line & symbols €",
  items: loadKit("SCHROEDER", "kit-schroeder-34"),
});
const call = async (body, query, method = "POST", actor = "owner") => {
  const token =
    actor === "owner"
      ? process.env.QA_ACCESS_TOKEN
      : actor === "other"
        ? process.env.QA_OTHER_TOKEN
        : actor === "forged"
          ? "fake.invalid.signature".repeat(3)
          : null;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
  if (process.env.QA_BASE_URL) {
    const url =
      process.env.QA_BASE_URL +
      "/api/quotations" +
      (query ? "?" + new URLSearchParams(query) : "");
    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...(await response.json()) };
  }
  const r = await handler({
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: query,
    headers: {
      origin: "https://pashaquotes.netlify.app",
      authorization: headers.Authorization,
    },
  });
  return { status: r.statusCode, ...JSON.parse(r.body) };
};
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS", name);
}
let saved;
const key = crypto.randomUUID();
const initial = base();
await check(
  "First save has a database-owned reference and full field roundtrip",
  async () => {
    const r = await call({ document: initial, creationKey: key });
    assert.equal(r.status, 200, JSON.stringify(r));
    saved = r.quotation;
    assert.match(saved.quotationNumber, /^QA-2026-\d{3,}$/);
    assert.deepEqual(saved.customerData, initial.customerData);
    assert.equal(saved.conditions, initial.conditions);
    assert.equal(saved.grossTotal, 64746);
    assert.equal(saved.netTotal, 58271.4);
    assert.equal(saved.items.length, 15);
    const q = await call(
      null,
      {
        vendor: "SCHROEDER",
        number: saved.quotationNumber,
        date: saved.dateOfIssue,
      },
      "GET",
    );
    assert.deepEqual(q.quotation, saved);
  },
);
await check(
  "Twelve simultaneous retries return one record and one number",
  async () => {
    const replies = await Promise.all(
      Array.from({ length: 12 }, () =>
        call({ document: initial, creationKey: key }),
      ),
    );
    assert.ok(
      replies.every((r) => r.status === 200),
      JSON.stringify(replies.filter((r) => r.status !== 200)),
    );
    assert.equal(new Set(replies.map((r) => r.quotation.id)).size, 1);
    assert.equal(
      new Set(replies.map((r) => r.quotation.quotationNumber)).size,
      1,
    );
  },
);
await check("Manual new reference and issue date are rejected", async () => {
  for (const field of ["quotationNumber", "dateOfIssue"]) {
    const r = await call({
      document: {
        ...base(),
        [field]: field === "quotationNumber" ? "2026-999999" : "2099-01-01",
      },
      creationKey: crypto.randomUUID(),
    });
    assert.equal(r.status, 400);
  }
});
await check(
  "A saved reference cannot be overwritten by a new value",
  async () => {
    const r = await call({
      document: { ...base(), quotationNumber: "2026-999" },
      id: saved.id,
      expectedRevision: saved.revision,
    });
    assert.equal(r.status, 400);
    const q = await rpc("pasha_private_quote", {
      p_user_id: process.env.QA_USER_ID,
      p_id: saved.id,
    });
    assert.equal(q.quotationNumber, saved.quotationNumber);
  },
);
await check(
  "Negative and inconsistent financial inputs are rejected",
  async () => {
    for (const change of [
      (d) => (d.discount = -10),
      (d) => (d.discount = 150),
      (d) => (d.items[0].quantity = -1),
      (d) => (d.items[0].quantity = 0),
      (d) => (d.items.find((s) => s.item.name === "Artwork").customPrice = -50),
      (d) => {
        d.grossTotal = 1;
        d.netTotal = -100;
      },
      (d) => (d.vendor = "PASHA"),
    ]) {
      const d = base();
      change(d);
      assert.equal(
        (await call({ document: d, creationKey: crypto.randomUUID() })).status,
        400,
      );
    }
  },
);
await check(
  "Concurrent edits cannot silently overwrite each other",
  async () => {
    const a = { ...base(), conditions: "QA edit A" },
      b = { ...base(), conditions: "QA edit B" };
    const replies = await Promise.all(
      [a, b].map((document) =>
        call({ document, id: saved.id, expectedRevision: saved.revision }),
      ),
    );
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    const q = await rpc("pasha_private_quote", {
      p_user_id: process.env.QA_USER_ID,
      p_id: saved.id,
    });
    assert.equal(q.revision, 2);
    assert.ok(["QA edit A", "QA edit B"].includes(q.conditions));
    assert.equal(q.quotationNumber, saved.quotationNumber);
  },
);
await check(
  "A lost response followed by changed contents returns the assigned record for safe recovery",
  async () => {
    const r = await call({
      document: { ...base(), conditions: "Changed after timeout" },
      creationKey: key,
    });
    assert.equal(r.status, 409);
    assert.equal(r.quotation.id, saved.id);
    assert.equal(r.quotation.quotationNumber, saved.quotationNumber);
  },
);
await check(
  "Eighteen concurrent new drafts get distinct consecutive references",
  async () => {
    const replies = [];
    for (let batch = 0; batch < 3; batch++)
      replies.push(
        ...(await Promise.all(
          Array.from({ length: 6 }, () =>
            call({ document: base(), creationKey: crypto.randomUUID() }),
          ),
        )),
      );
    assert.ok(
      replies.every((r) => r.status === 200),
      JSON.stringify(replies.filter((r) => r.status !== 200)),
    );
    const nums = replies
      .map((r) => Number(r.quotation.quotationNumber.split("-").at(-1)))
      .sort((a, b) => a - b);
    assert.equal(new Set(nums).size, 18);
    assert.ok(nums.every((n, i) => i === 0 || n === nums[i - 1] + 1));
  },
);
await check(
  "Corrected Pasha kit saves twenty components, quantities and artwork",
  async () => {
    const doc = {
      ...base(),
      vendor: "PASHA",
      items: loadKit("PASHA", "kit-pasha-525l"),
      discount: 0,
    };
    const r = await call({ document: doc, creationKey: crypto.randomUUID() });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.quotation.items.length, 20);
    assert.equal(r.quotation.grossTotal, 168320);
    assert.equal(
      r.quotation.items.find((s) => s.item.name === "T99 Fuel Tank").quantity,
      5,
    );
  },
);
await check(
  "Wrong dates, missing lookup parameters and unsupported methods fail cleanly",
  async () => {
    assert.equal((await call(null, {}, "GET")).status, 400);
    assert.equal(
      (
        await call(
          null,
          {
            vendor: "SCHROEDER",
            number: saved.quotationNumber,
            date: "2026-02-31",
          },
          "GET",
        )
      ).status,
      400,
    );
    assert.equal((await call(null, {}, "DELETE")).status, 405);
  },
);
await check(
  "Unauthenticated and forged sessions cannot read, edit or view version history",
  async () => {
    for (const actor of ["none", "forged"]) {
      assert.equal(
        (await call(null, { id: saved.id }, "GET", actor)).status,
        401,
      );
      assert.equal(
        (await call(null, { id: saved.id, history: "1" }, "GET", actor)).status,
        401,
      );
      assert.equal(
        (
          await call(
            { document: base(), id: saved.id, expectedRevision: 1 },
            null,
            "POST",
            actor,
          )
        ).status,
        401,
      );
    }
  },
);
await check(
  "Another representative cannot retrieve or update a known quotation or its history",
  async () => {
    assert.equal(
      (await call(null, { id: saved.id }, "GET", "other")).status,
      404,
    );
    assert.equal(
      (
        await call(
          null,
          {
            vendor: saved.vendor,
            number: saved.quotationNumber,
            date: saved.dateOfIssue,
          },
          "GET",
          "other",
        )
      ).status,
      404,
    );
    assert.equal(
      (await call(null, { id: saved.id, history: "1" }, "GET", "other")).status,
      404,
    );
    assert.equal(
      (
        await call(
          { document: base(), id: saved.id, expectedRevision: 2 },
          null,
          "POST",
          "other",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          { document: initial, creationKey: key },
          null,
          "POST",
          "other",
        )
      ).status,
      404,
    );
    const own = await call(
      { document: base(), creationKey: crypto.randomUUID() },
      null,
      "POST",
      "other",
    );
    assert.equal(own.status, 200);
    assert.equal(
      (await call(null, { id: own.quotation.id }, "GET")).status,
      404,
    );
  },
);
await check(
  "Saved history preserves original contents and paginates without modifying the reference",
  async () => {
    let r = await call({ document: base(), creationKey: crypto.randomUUID() });
    assert.equal(r.status, 200);
    let q = r.quotation;
    const ref = q.quotationNumber;
    for (let i = 0; i < 22; i++) {
      r = await call({
        document: { ...base(), conditions: "QA history edit " + i },
        id: q.id,
        expectedRevision: q.revision,
      });
      assert.equal(r.status, 200);
      q = r.quotation;
      assert.equal(q.quotationNumber, ref);
    }
    const first = await call(null, { id: q.id, history: "1" }, "GET");
    assert.equal(first.status, 200);
    assert.equal(first.versions.length, 20);
    assert.equal(first.hasMore, true);
    assert.equal(first.versions[0].revision, 23);
    const last = await call(
      null,
      {
        id: q.id,
        history: "1",
        before: String(first.versions.at(-1).revision),
      },
      "GET",
    );
    assert.equal(last.status, 200);
    assert.equal(last.versions.length, 3);
    assert.equal(last.hasMore, false);
    assert.equal(last.versions.at(-1).document.conditions, base().conditions);
    assert.equal(
      (await call(null, { id: q.id }, "GET")).quotation.revision,
      23,
    );
  },
);
const output = {
  passed: results.length,
  checks: results,
  scope: "Isolated quote_qa schema; official counters not used",
  time: new Date().toISOString(),
};
fs.mkdirSync(new URL("../evidence/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../evidence/qa-live-results.json", import.meta.url),
  JSON.stringify(output, null, 2),
);
