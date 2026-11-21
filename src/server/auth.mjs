export function publicAuthConfig() {
  return {
    url: process.env.SUPABASE_URL,
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    passwordRecoveryConfigured: process.env.AUTH_EMAIL_READY === "true",
  };
}
export async function authenticatedUser(event) {
  const authorization =
    event.headers?.authorization || event.headers?.Authorization || "";
  if (!/^Bearer [A-Za-z0-9_.-]{30,8000}$/.test(authorization))
    throw Object.assign(new Error("Sign in to access your quotations."), {
      status: 401,
    });
  const { url, anonKey } = publicAuthConfig();
  if (!url || !anonKey)
    throw Object.assign(new Error("Sign-in service is not configured."), {
      status: 503,
    });
  let response;
  try {
    response = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Object.assign(
      new Error("Sign-in service is temporarily unavailable."),
      { status: 503 },
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status >= 500
          ? "Sign-in service is temporarily unavailable."
          : "Your session has expired. Sign in again.",
      ),
      { status: response.status >= 500 ? 503 : 401 },
    );
  const user = await response.json();
  if (!user?.id || !user.email_confirmed_at || user.is_anonymous)
    throw Object.assign(
      new Error("A confirmed representative account is required."),
      { status: 403 },
    );
  return { id: user.id, email: user.email };
}
