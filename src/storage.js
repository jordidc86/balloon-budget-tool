export function readStore(key, fallback = null, storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(key));
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}
export function userStorage(userId, storage) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      userId || "",
    )
  )
    throw Error("A verified user is required for local drafts.");
  const prefix = "pashaquotes:user:" + userId + ":";
  return {
    getItem: (key) =>
      (storage ?? globalThis.localStorage).getItem(prefix + key),
    setItem: (key, value) =>
      (storage ?? globalThis.localStorage).setItem(prefix + key, value),
  };
}
export function writeStore(key, value, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function backupQuote(quote, storage) {
  const raw = readStore("pashaquotes:quotations", [], storage);
  const list = Array.isArray(raw)
    ? raw.filter((q) => q && typeof q === "object")
    : [];
  return writeStore(
    "pashaquotes:quotations",
    [
      quote,
      ...list.filter(
        (q) =>
          !(
            q.vendor === quote.vendor &&
            q.quotationNumber === quote.quotationNumber &&
            q.dateOfIssue === quote.dateOfIssue
          ),
      ),
    ].slice(0, 100),
    storage,
  );
}
export function findBackup(vendor, number, date, storage) {
  const list = readStore("pashaquotes:quotations", [], storage);
  return Array.isArray(list)
    ? list.find(
        (q) =>
          q?.vendor === vendor &&
          q.quotationNumber === number &&
          q.dateOfIssue === date,
      )
    : null;
}

export function restoreDraft(key, vendor, makeFresh, storage) {
  const blank = makeFresh();
  const value = readStore(key, null, storage);
  if (
    !value ||
    value.vendor !== vendor ||
    !Array.isArray(value.items) ||
    !value.items.every(
      (s) =>
        s &&
        s.item &&
        typeof s.item.id === "string" &&
        typeof s.item.name === "string" &&
        typeof s.item.category === "string",
    )
  )
    return blank;
  const customerData = { ...blank.customerData };
  for (const field of Object.keys(customerData))
    if (typeof value.customerData?.[field] === "string")
      customerData[field] = value.customerData[field];
  const saved =
    value.saved &&
    typeof value.saved.id === "string" &&
    typeof value.saved.quotationNumber === "string" &&
    Number.isInteger(value.saved.revision) &&
    Array.isArray(value.saved.items)
      ? value.saved
      : null;
  return {
    ...blank,
    ...value,
    creationKey: /^[a-f0-9-]{36}$/i.test(value.creationKey || "")
      ? value.creationKey
      : blank.creationKey,
    customerData,
    conditions:
      typeof value.conditions === "string"
        ? value.conditions
        : blank.conditions,
    saved,
  };
}
