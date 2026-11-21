import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogs,
  allItems,
  loadKit,
  normalizeDocument,
  totals,
  nextMonth,
  validDate,
  allowedItems,
  selectItem,
} from "../src/domain.js";
import { backupQuote, readStore, writeStore, restoreDraft } from "../src/storage.js";
import { printHTML } from "../src/print.js";
const base = () => ({
  vendor: "SCHROEDER",
  customerData: {
    name: "Technical QA",
    country: "Test",
    contactPerson: "QA",
    email: "qa@example.invalid",
    phone: "000",
  },
  discount: 0,
  conditions: "QA only",
  items: loadKit("SCHROEDER", "kit-schroeder-34"),
});
test("All configured kits resolve every item and pass compatibility", () => {
  for (const [vendor, c] of Object.entries(catalogs))
    for (const kit of c.kits)
      assert.doesNotThrow(() =>
        normalizeDocument({ ...base(), vendor, items: loadKit(vendor, kit.id) }),
      );
});
test("Schroeder IV basket uses the confirmed price and one identity", () => {
  const d = normalizeDocument(base());
  assert.equal(d.items.find((s) => s.item.category === "BASKET").item.price, 8350);
  assert.equal(d.grossTotal, 64746);
  assert.equal(
    allItems("SCHROEDER").filter((i) => i.name.replace(/\s+/g, " ") === "IV Open Basket").length,
    1,
  );
});
test("PH525L contains all twenty intended components and a selectable DTT frame", () => {
  const items = loadKit("PASHA", "kit-pasha-525l");
  assert.equal(items.length, 20);
  assert.equal(totals(items).grossTotal, 168320);
  assert.ok(items.some((s) => s.item.name === "Dropline / 40m"));
  assert.ok(items.some((s) => s.item.name === 'Quick Release "W" Type'));
  assert.equal(allowedItems("PASHA", "BURNER FRAME", items)[0].frameType, "DTT");
  assert.equal(items.filter((s) => s.item.category === "BASKET").length, 1);
});
test("Changing a single component cannot leave a hidden second basket", () => {
  const b = base();
  const basket = allItems("SCHROEDER").find((i) => i.name === "V Open Basket");
  const changed = selectItem("SCHROEDER", b.items, basket).items;
  assert.equal(changed.filter((s) => s.item.category === "BASKET").length, 1);
});
test("Changing envelope removes incompatible dependent components", () => {
  const b = base();
  const envelope = allItems("SCHROEDER").find((i) => i.name === "125/28 Envelope");
  const changed = selectItem("SCHROEDER", b.items, envelope);
  assert.ok(changed.removed.length >= 2);
  assert.ok(!changed.items.some((s) => s.item.category === "BASKET"));
});
test("Negative prices, quantities, excessive discounts and fractional envelopes are rejected", () => {
  for (const mutate of [
    (d) => (d.items[0].quantity = -1),
    (d) => (d.items[0].quantity = 0),
    (d) => (d.items[0].quantity = 1.5),
    (d) => (d.discount = -1),
    (d) => (d.discount = 101),
    (d) => (d.items.find((s) => s.item.name === "Artwork").customPrice = -1),
  ]) {
    const d = base();
    mutate(d);
    assert.throws(() => normalizeDocument(d));
  }
});
test("Fixed price changes and manufacturer mismatch cannot be saved", () => {
  const d = base();
  d.items[0].customPrice = 1;
  assert.throws(() => normalizeDocument(d));
  const mixed = base();
  mixed.vendor = "PASHA";
  assert.throws(() => normalizeDocument(mixed));
});
test("Server recalculates and rejects contradictory totals", () => {
  assert.throws(() => normalizeDocument({ ...base(), grossTotal: 1, netTotal: -100 }));
  const d = normalizeDocument({ ...base(), discount: 10 });
  assert.equal(d.netTotal, 58271.4);
});
test("Existing issued fixed prices survive later catalog updates", () => {
  const original = base();
  original.items = structuredClone(original.items);
  original.items.find((s) => s.item.category === "BASKET").item.price = 8150;
  const d = normalizeDocument(original, original);
  assert.equal(d.grossTotal, 64546);
});
test("All client fields, notes, terms, quantities and custom prices survive normalization", () => {
  const input = base();
  input.items.find((s) => s.item.name === "Artwork").customDescription = "Design & logo: <sample>";
  const d = normalizeDocument(input);
  assert.deepEqual(d.customerData, input.customerData);
  assert.equal(d.conditions, input.conditions);
  assert.equal(
    d.items.find((s) => s.item.name === "Artwork").customDescription,
    "Design & logo: <sample>",
  );
});
test("Empty client and invalid email are rejected", () => {
  assert.throws(() => normalizeDocument({ ...base(), customerData: { name: "" } }));
  assert.throws(() =>
    normalizeDocument({ ...base(), customerData: { name: "QA", email: "broken" } }),
  );
});
test("Dates clamp to the end of month and reject impossible dates", () => {
  assert.equal(nextMonth("2026-01-31"), "2026-02-28");
  assert.equal(nextMonth("2028-01-31"), "2028-02-29");
  assert.equal(nextMonth("2026-12-31"), "2027-01-31");
  assert.equal(validDate("2026-02-31"), false);
});
test("Unknown-price products cannot be issued as free", () => {
  const item = allItems("PASHA").find((i) => i.priceOnRequest);
  assert.throws(() =>
    normalizeDocument({ ...base(), vendor: "PASHA", items: [{ item, quantity: 1 }] }),
  );
});
test("Storage errors and malformed backups never throw or overwrite another vendor", () => {
  const state = {
    value: "{}",
    getItem() {
      return this.value;
    },
    setItem(k, v) {
      this.value = v;
    },
  };
  assert.equal(
    backupQuote({ vendor: "PASHA", quotationNumber: "same", dateOfIssue: "2026-11-21" }, state),
    true,
  );
  backupQuote({ vendor: "SCHROEDER", quotationNumber: "same", dateOfIssue: "2026-11-21" }, state);
  assert.equal(JSON.parse(state.value).length, 2);
  assert.equal(
    writeStore(
      "x",
      {},
      {
        setItem() {
          throw Error("Quota");
        },
      },
    ),
    false,
  );
  assert.equal(
    readStore("x", 42, {
      getItem() {
        throw Error("Blocked");
      },
    }),
    42,
  );
});
test("Access to blocked localStorage itself is caught", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw Error("SecurityError");
    },
  });
  assert.equal(writeStore("x", {}), false);
  assert.equal(readStore("x", 42), 42);
  delete globalThis.localStorage;
});
test("Printing escapes supplied content and uses the Turkish issuer", () => {
  const d = normalizeDocument(base());
  const html = printHTML(
    {
      ...d,
      quotationNumber: "2026-036",
      dateOfIssue: "2026-01-31",
      customerData: { name: "<script>bad</script>" },
    },
    "https://pashaquotes.netlify.app",
  );
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(html.includes("2026-02-28"));
  const pasha = printHTML(
    { ...d, vendor: "PASHA", quotationNumber: "2026-036", dateOfIssue: "2026-11-21" },
    "",
  );
  assert.ok(pasha.includes("Pasha Balloons Üretimi Anonim Şirketi"));
  assert.ok(!pasha.includes("Pasha Valley"));
  assert.ok(pasha.includes("thead{display:table-header-group}"));
});

test('Malformed saved browser drafts recover without crashing',()=>{const fresh=()=>({vendor:'SCHROEDER',creationKey:'00000000-0000-4000-8000-000000000000',items:[],customerData:{name:''},conditions:'Default',saved:null});for(const value of [{vendor:'SCHROEDER',items:[null]}, {vendor:'SCHROEDER',items:[{}]}, []])assert.deepEqual(restoreDraft('x','SCHROEDER',fresh,{getItem:()=>JSON.stringify(value)}),fresh());});
test('Malformed products and nonnumeric submitted totals are rejected',()=>{
  for(const change of [d=>d.items=[null],d=>d.grossTotal='invalid',d=>d.netTotal='NaN']){
    const d=base();change(d);assert.throws(()=>normalizeDocument(d),/valid product|totals/);
  }
});
