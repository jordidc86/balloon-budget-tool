import { createClient } from "@supabase/supabase-js";
let clientPromise;
export function getAuthClient() {
  clientPromise ??= fetch("/api/access", { cache: "no-store" })
    .then(async (response) => {
      const config = await response.json();
      if (!response.ok || !config.success)
        throw Error(config.error || "Sign-in service unavailable.");
      return {
        client: createClient(config.url, config.anonKey, {
          auth: {
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
          },
        }),
        config,
      };
    })
    .catch((error) => {
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}
export async function accessToken() {
  const { client } = await getAuthClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token)
    throw Object.assign(Error("Sign in to access your quotations."), {
      status: 401,
    });
  return data.session.access_token;
}
