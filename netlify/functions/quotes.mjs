import { normalizeDocument, validDate, ValidationError } from "../../src/domain.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (statusCode, data) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
  body: JSON.stringify(data),
});
const testMode = () => process.env.QUOTATION_MODE === "qa";
export async function rpc(name, args = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key)
    throw Object.assign(new Error("The saving service is not configured."), { status: 503 });
  const response = await fetch(base.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, p_test: testMode() }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn("Quotation RPC failure", {
      operation: name,
      status: response.status,
      code: data?.code,
    });
    const status = ["PT409", "40001"].includes(data?.code)
      ? 409
      : data?.code === "P0002"
        ? 404
        : data?.code?.startsWith("22")
          ? 400
          : 503;
    throw Object.assign(
      new Error(
        status === 503
          ? "The database is temporarily unavailable. Your draft is retained."
          : data?.message || "Could not save the quotation.",
      ),
      { status },
    );
  }
  return data;
}
export async function handler(event) {
  try {
    const origin = event.headers?.origin;
    if (
      origin &&
      !/^https:\/\/(?:[a-z0-9-]+--)?pashaquotes\.netlify\.app$/.test(origin) &&
      !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
    )
      return reply(403, { success: false, error: "Origin not permitted." });
    if (event.httpMethod === "GET") {
      const p = event.queryStringParameters || {};
      if (p.id) {
        if (!UUID.test(p.id)) throw new ValidationError("Invalid quotation identifier.");
        const q = await rpc("pasha_read_quote_id", { p_id: p.id });
        return q
          ? reply(200, { success: true, quotation: q, testMode: testMode() })
          : reply(404, { success: false, error: "Quotation not found." });
      }
      if (
        !["PASHA", "SCHROEDER"].includes(p.vendor) ||
        !p.number ||
        p.number.length > 100 ||
        !validDate(p.date)
      )
        throw new ValidationError("Manufacturer, reference and a valid issue date are required.");
      const q = await rpc("pasha_read_quote", {
        p_vendor: p.vendor,
        p_number: p.number.trim(),
        p_date: p.date,
      });
      return q
        ? reply(200, { success: true, quotation: q, testMode: testMode() })
        : reply(404, { success: false, error: "Quotation not found." });
    }
    if (event.httpMethod !== "POST")
      return reply(405, { success: false, error: "Method not permitted." });
    if ((event.body?.length || 0) > 1000000)
      return reply(413, { success: false, error: "Quotation is too large." });
    let data;
    try {
      data = JSON.parse(event.body || "");
    } catch {
      throw new ValidationError("Invalid JSON request.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !data.document || typeof data.document !== "object" || Array.isArray(data.document))
      throw new ValidationError("Reload the current application before saving.");
    if (
      "quotationNumber" in data ||
      "quotationNumber" in data.document ||
      "dateOfIssue" in data ||
      "dateOfIssue" in data.document
    )
      throw new ValidationError(
        "The reference and issue date are assigned by the server and cannot be changed.",
      );
    let existing = null;
    if (data.id) {
      if (
        !UUID.test(data.id) ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1
      )
        throw new ValidationError("The saved quotation identifier and revision are required.");
      existing = await rpc("pasha_read_quote_id", { p_id: data.id });
      if (!existing) return reply(404, { success: false, error: "Quotation not found." });
    } else if (!UUID.test(data.creationKey || ""))
      throw new ValidationError("A persistent draft key is required.");
    const document = normalizeDocument(data.document, existing);
    let quotation;
    try {
      quotation = await rpc("pasha_save_quote", {
        p_document: document,
        p_creation_key: data.id ? null : data.creationKey,
        p_id: data.id || null,
        p_expected_revision: data.expectedRevision || null,
      });
    } catch (error) {
      if (error.status === 409) {
        const current = data.id
          ? await rpc("pasha_read_quote_id", { p_id: data.id })
          : await rpc("pasha_read_creation_key", { p_creation_key: data.creationKey });
        return reply(409, { success: false, error: error.message, quotation: current });
      }
      throw error;
    }
    return reply(200, {
      success: true,
      quotation,
      quotationNumber: quotation.quotationNumber,
      testMode: testMode(),
    });
  } catch (error) {
    const status = error.status || (error.name === "TimeoutError" ? 503 : 500);
    return reply(status, {
      success: false,
      error:
        status === 500
          ? "The quotation could not be processed. Your draft is retained."
          : error.message,
    });
  }
}
