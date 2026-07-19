import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";

export function PathokConnectPage({ session }) {
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeChallenge = searchParams.get("code_challenge") || "";
  const validRequest = useMemo(() => /^[A-Za-z0-9_-]{43}$/.test(codeChallenge), [codeChallenge]);

  async function continueToPathok() {
    if (!validRequest || !session?.access_token || !session?.refresh_token) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke("pathok-auth", {
        body: {
          action: "create",
          codeChallenge,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        },
      });
      if (functionError) throw functionError;
      if (!data?.code) throw new Error(data?.error || "Could not create Pathok login.");
      window.location.assign(`pathok://auth/callback?code=${encodeURIComponent(data.code)}`);
    } catch (nextError) {
      setError(nextError.message || "Could not connect Pathok.");
      setBusy(false);
    }
  }

  return (
    <div className="pathok-connect-root">
      <div className="pathok-connect-card">
        <div className="pathok-connect-mark">প</div>
        <p className="pathok-connect-kicker">ONE TRADE RULE ACCOUNT</p>
        <h1>Continue to পাঠক</h1>
        <p>Pathok will use your signed-in account. Your trading data stays separate from your reading library.</p>
        <div className="pathok-connect-user">{session?.user?.email || "Signed-in account"}</div>
        {!validRequest ? <div className="notice error">This Pathok login request is invalid.</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        <button type="button" className="auth-submit" disabled={!validRequest || busy} onClick={continueToPathok}>
          {busy ? "Connecting..." : "Continue to Pathok"}
        </button>
        <p className="pathok-connect-note">You can return without continuing. No password is shared with Pathok.</p>
      </div>
    </div>
  );
}
