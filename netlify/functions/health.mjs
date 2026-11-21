import { rpc } from "./quotes.mjs";
export async function handler() {
  try {
    const state = await rpc("pasha_quote_health");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ...state, configured: true }),
    };
  } catch {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: false, error: "Saving is temporarily unavailable." }),
    };
  }
}
