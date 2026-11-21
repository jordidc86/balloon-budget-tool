import catalogs from "../data/catalogs.json" with { type: "json" };
import aliases from "../data/aliases.json" with { type: "json" };
export { catalogs };
export const SINGLE = new Set(["ENVELOPE", "BASKET", "BURNER", "BURNER FRAME"]);
export const DEFAULT_TERMS =
  "• All prices are in EUR, VAT not included\n• Payment conditions: 50% deposit and 50% down payment\n• Delivery time: 12 weeks from order confirmation\n• Shipping: Ex-Works (customer arranges shipping)\n• Taxes not included";
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
export const money = (value) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
export const canonicalId = (id) => aliases[id] || id;
export function allItems(vendor) {
  return catalogs[vendor]?.categories.flatMap((c) => c.items) || [];
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function nextMonth(value) {
  if (!validDate(value)) throw new ValidationError("Invalid issue date.");
  const [y, m, d] = value.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
export function allowedItems(vendor, category, selected) {
  const source = catalogs[vendor]?.categories.find((c) => c.name === category)?.items || [];
  const envelope = selected.find((s) => s.item.category === "ENVELOPE");
  const basket = selected.find((s) => s.item.category === "BASKET");
  const burner = selected.find((s) => s.item.category === "BURNER");
  if (envelope && ["BASKET", "BURNER"].includes(category)) {
    const rule = catalogs[vendor].compatibility[canonicalId(envelope.item.id)];
    return source.filter((i) =>
      rule?.[category === "BASKET" ? "baskets" : "burners"]?.includes(i.id),
    );
  }
  if (category === "BURNER FRAME") {
    if (vendor === "PASHA" && basket) {
      const type = allItems(vendor).find((i) => i.id === canonicalId(basket.item.id))?.frameType;
      return type ? source.filter((i) => i.frameType === type) : source;
    }
    if (vendor === "SCHROEDER" && burner) {
      const name = burner.item.name.toUpperCase();
      const count = ["DOUBLE", "TRIPLE", "QUADRUPLE"].find((n) => name.includes(n));
      return count ? source.filter((i) => i.name.toUpperCase().includes(count)) : source;
    }
  }
  return source;
}
export function validateCompatibility(vendor, selected) {
  for (const category of ["BASKET", "BURNER", "BURNER FRAME"]) {
    const selectedItem = selected.find((s) => s.item.category === category);
    if (!selectedItem) continue;
    if (
      !allowedItems(vendor, category, selected).some(
        (i) => i.id === canonicalId(selectedItem.item.id),
      )
    )
      throw new ValidationError(
        `${selectedItem.item.name} is not compatible with the selected configuration. Please review it.`,
      );
  }
}
export function selectItem(vendor, selected, item, quantity = 1, extra = {}) {
  let next = selected.filter(
    (s) =>
      s.item.id !== item.id && (!SINGLE.has(item.category) || s.item.category !== item.category),
  );
  next.push({ item, quantity, ...extra });
  const removed = [];
  for (const cat of ["BASKET", "BURNER", "BURNER FRAME"]) {
    const current = next.find((s) => s.item.category === cat);
    if (
      current &&
      !allowedItems(vendor, cat, next).some((i) => i.id === canonicalId(current.item.id))
    ) {
      next = next.filter((s) => s !== current);
      removed.push(current.item.name);
    }
  }
  return { items: next, removed };
}
export function loadKit(vendor, kitId) {
  const kit = catalogs[vendor]?.kits.find((k) => k.id === kitId);
  if (!kit) throw new ValidationError("Kit not found.");
  const selected = kit.items.map((s) => {
    const item = allItems(vendor).find((i) => i.id === s.itemId);
    if (!item) throw new ValidationError(`Kit contains an unavailable item: ${s.itemId}`);
    return {
      item,
      quantity: s.quantity || 1,
      ...(s.customPrice !== undefined ? { customPrice: s.customPrice } : {}),
      ...(s.customDescription ? { customDescription: s.customDescription } : {}),
    };
  });
  validateCompatibility(vendor, selected);
  return selected;
}
export function totals(items, discount = 0) {
  const grossCents = items.reduce(
    (sum, s) => sum + Math.round((s.customPrice ?? s.item.price) * 100 * s.quantity),
    0,
  );
  return {
    grossTotal: grossCents / 100,
    netTotal: Math.round((grossCents * (100 - discount)) / 100) / 100,
  };
}
const bounded = (value, label, max) => {
  const n = Number(value);
  if (
    value === "" ||
    value === null ||
    typeof value === "boolean" ||
    !Number.isFinite(n) ||
    n < 0 ||
    n > max
  )
    throw new ValidationError(`${label} must be between 0 and ${max}.`);
  return n;
};
export function normalizeDocument(input, existing = null) {
  const vendor = input?.vendor;
  if (!catalogs[vendor]) throw new ValidationError("Vendor must be PASHA or SCHROEDER.");
  if (existing && existing.vendor !== vendor)
    throw new ValidationError("A saved quotation cannot change manufacturer.");
  const discount = bounded(input.discount ?? 0, "Discount", 100);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 300)
    throw new ValidationError("Select between 1 and 300 items.");
  const ids = new Set();
  const categories = new Set();
  const items = input.items.map((s) => {
    if (!s || typeof s !== "object" || Array.isArray(s))
      throw new ValidationError("Each selected item must be a valid product.");
    const requested = s.itemId || s.item?.id;
    const id = canonicalId(requested);
    if (ids.has(id)) throw new ValidationError("The same product cannot appear twice.");
    ids.add(id);
    const catalogItem = allItems(vendor).find((i) => i.id === id);
    const saved = existing?.items?.find(
      (old) => old.item.id === requested || canonicalId(old.item.id) === id,
    );
    if (!catalogItem && !saved)
      throw new ValidationError("An item does not belong to the selected manufacturer.");
    const item = saved
      ? {
          ...saved.item,
          ...(catalogItem
            ? {
                category: catalogItem.category,
                allowCustomPrice: catalogItem.allowCustomPrice,
                priceOnRequest: catalogItem.priceOnRequest,
              }
            : {}),
          id: requested,
        }
      : { ...catalogItem };
    if (SINGLE.has(item.category)) {
      if (categories.has(item.category))
        throw new ValidationError(`Only one ${item.category} may be selected.`);
      categories.add(item.category);
    }
    const quantity = bounded(s.quantity, "Quantity", 10000);
    if (quantity <= 0) throw new ValidationError("Quantity must be greater than zero.");
    const fractional = /fabric/i.test(item.name) && /SPARE|ACCESSORIES/.test(item.category);
    if (!fractional && !Number.isInteger(quantity))
      throw new ValidationError("Quantity must be a whole number for this product.");
    let customPrice;
    if (s.customPrice !== undefined && s.customPrice !== null) {
      if (!item.allowCustomPrice)
        throw new ValidationError("A fixed catalog price cannot be changed.");
      customPrice = bounded(s.customPrice, "Custom price", 10000000);
      if (Math.abs(customPrice * 100 - Math.round(customPrice * 100)) > 0.00001)
        throw new ValidationError("Prices support two decimal places.");
    }
    if (item.priceOnRequest && !(customPrice > 0))
      throw new ValidationError(`Enter the agreed price for ${item.name}; it is not a free item.`);
    const customDescription = String(s.customDescription || "").trim();
    if (customDescription.length > 3000) throw new ValidationError("Item notes are too long.");
    return {
      item,
      quantity,
      ...(customPrice !== undefined ? { customPrice } : {}),
      ...(customDescription ? { customDescription } : {}),
    };
  });
  validateCompatibility(vendor, items);
  const customerData = {};
  for (const key of ["name", "country", "contactPerson", "phone", "email"]) {
    const value = input.customerData?.[key] ?? "";
    if (typeof value !== "string" || value.length > 1000)
      throw new ValidationError("Client details are invalid.");
    customerData[key] = value.trim();
  }
  if (!customerData.name)
    throw new ValidationError("Enter the client name before saving or printing.");
  if (customerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email))
    throw new ValidationError("Enter a valid email address.");
  if (typeof input.conditions !== "string" || input.conditions.length > 15000)
    throw new ValidationError("Payment terms are invalid.");
  const calculated = totals(items, discount);
  for (const field of ["grossTotal", "netTotal"])
    if (input[field] !== undefined && (!Number.isFinite(Number(input[field])) || Math.abs(Number(input[field]) - calculated[field]) > 0.005))
      throw new ValidationError("The submitted totals do not match the selected items.");
  return { vendor, customerData, conditions: input.conditions, discount, items, ...calculated };
}
