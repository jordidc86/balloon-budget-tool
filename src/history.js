import { money } from "./domain.js";
export function describeChanges(previous, current) {
  const changes = [];
  for (const [key, label] of Object.entries({
    name: "Client name",
    country: "Country",
    contactPerson: "Representative",
    phone: "Phone",
    email: "Email",
  }))
    if (
      (previous.customerData?.[key] || "") !==
      (current.customerData?.[key] || "")
    )
      changes.push(label + " changed");
  if ((previous.conditions || "") !== (current.conditions || ""))
    changes.push("Payment terms changed");
  if (Number(previous.discount || 0) !== Number(current.discount || 0))
    changes.push(
      `Discount: ${previous.discount || 0}% → ${current.discount || 0}%`,
    );
  const before = new Map((previous.items || []).map((s) => [s.item.id, s]));
  const after = new Map((current.items || []).map((s) => [s.item.id, s]));
  for (const [id, old] of before) {
    const next = after.get(id);
    if (!next) {
      changes.push("Removed: " + old.item.name);
      continue;
    }
    if (Number(old.quantity) !== Number(next.quantity))
      changes.push(
        `${next.item.name}: quantity ${old.quantity} → ${next.quantity}`,
      );
    if (
      Number(old.customPrice ?? old.item.price) !==
      Number(next.customPrice ?? next.item.price)
    )
      changes.push(
        `${next.item.name}: ${money(old.customPrice ?? old.item.price)} → ${money(next.customPrice ?? next.item.price)}`,
      );
    if ((old.customDescription || "") !== (next.customDescription || ""))
      changes.push("Notes changed: " + next.item.name);
  }
  for (const [id, next] of after)
    if (!before.has(id)) changes.push("Added: " + next.item.name);
  if (Number(previous.netTotal) !== Number(current.netTotal))
    changes.push(
      `Net total: ${money(previous.netTotal)} → ${money(current.netTotal)}`,
    );
  return changes;
}
