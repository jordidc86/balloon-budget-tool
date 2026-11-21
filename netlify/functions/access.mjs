import { authenticatedUser, publicAuthConfig } from "../../src/server/auth.mjs";
import { rpc } from "./quotes.mjs";
export async function handler(event) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    if (event.httpMethod !== "GET")
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Method not permitted.",
        }),
      };
    if (event.queryStringParameters?.session) {
      const user = await authenticatedUser(event);
      if (!(await rpc("pasha_member_access", { p_user_id: user.id })))
        throw Object.assign(
          new Error(
            "Representative access is not enabled. Contact the administrator.",
          ),
          { status: 403 },
        );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, user }),
      };
    }
    const config = publicAuthConfig();
    if (!config.url || !config.anonKey)
      throw Object.assign(new Error("Sign-in service is not configured."), {
        status: 503,
      });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ...config }),
    };
  } catch (error) {
    return {
      statusCode: error.status || 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.status ? error.message : "Could not verify access.",
      }),
    };
  }
}
