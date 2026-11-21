import { rpc } from "./quotes.mjs";

// A real, read-only database query. Never allocate a reference or write a quote.
export async function handler() {
  const state = await rpc("pasha_quote_health");
  if (state?.ok !== true || state.testMode !== false || state.schemaVersion !== 2)
    throw new Error("Production database availability check failed.");
  console.info("Production database availability checked", { ok: true, schemaVersion: 2 });
  return { statusCode: 200 };
}
