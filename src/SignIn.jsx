import React, { useEffect, useState } from "react";
import { getAuthClient } from "./auth-client.js";
export default function SignIn({ children }) {
  const [auth, setAuth] = useState(null),
    [session, setSession] = useState(undefined),
    [verified, setVerified] = useState(null),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [recovery, setRecovery] = useState(false),
    [newPassword, setNewPassword] = useState("");
  useEffect(() => {
    let active = true,
      subscription;
    getAuthClient()
      .then(async (value) => {
        if (!active) return;
        setAuth(value);
        subscription = value.client.auth.onAuthStateChange((event, next) => {
          if (active) {
            setSession(next);
            setVerified(null);
            setRecovery((previous) =>
              event === "PASSWORD_RECOVERY"
                ? true
                : event === "SIGNED_OUT"
                  ? false
                  : previous,
            );
          }
        }).data.subscription;
        const link = new URLSearchParams(location.hash.slice(1));
        if (link.get("token_hash") && link.get("type") === "recovery") {
          const token_hash = link.get("token_hash");
          history.replaceState(null, "", location.pathname + location.search);
          const { data, error } = await value.client.auth.verifyOtp({
            token_hash,
            type: "recovery",
          });
          if (error) throw error;
          if (active) {
            setRecovery(true);
            setSession(data.session);
          }
          return;
        }
        const { data } = await value.client.auth.getSession();
        if (active) setSession(data.session);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setSession(null);
        }
      });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setVerified(null);
    if (!session) return;
    fetch("/api/access?session=1", {
      headers: { Authorization: "Bearer " + session.access_token },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || !body.success)
          throw Error(body.error || "Could not verify access.");
        if (active) {
          setVerified(body.user);
          setError("");
        }
      })
      .catch(
        (e) =>
          active &&
          setError(
            e.name === "TimeoutError"
              ? "Could not verify access. Reload to retry."
              : e.message,
          ),
      );
    return () => {
      active = false;
    };
  }, [session]);
  async function signOut() {
    setVerified(null);
    const { error } = await auth.client.auth.signOut();
    if (error) setError(error.message);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !auth) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await auth.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await auth.client.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: location.origin },
      );
      if (error) throw error;
      setError(
        "If your account is enabled, check your email for recovery instructions.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await auth.client.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setNewPassword("");
      setRecovery(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (recovery && session)
    return (
      <main className="sign-in">
        <section className="panel detail-panel">
          <h1>Set your new password</h1>
          <form onSubmit={updatePassword}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <button className="action" disabled={busy}>
              Save password
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </section>
      </main>
    );
  if (verified && verified.id === session?.user?.id)
    return children({ user: verified, signOut });
  return (
    <main className="sign-in">
      <section className="panel detail-panel">
        <h1>PashaQuotes</h1>
        <p>
          Sign in to access your quotations. Each representative can access only
          their own documents.
        </p>
        {session === undefined ? (
          <p>Loading sign-in...</p>
        ) : session ? (
          <>
            <p>Checking access for {session.user.email}.</p>
            <button className="action secondary" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="action" disabled={busy || !auth}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            {auth?.config.passwordRecoveryConfigured && (
              <button
                type="button"
                className="action secondary"
                disabled={busy}
                onClick={reset}
              >
                Forgot password?
              </button>
            )}
            <p className="help">
              Contact the administrator to enable your representative account.
            </p>
          </form>
        )}
        {error && (
          <p className="message warning" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
