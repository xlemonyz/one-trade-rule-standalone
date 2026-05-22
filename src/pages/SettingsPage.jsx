import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function SettingsPage({ user }) {
  const [username, setUsername] = useState(user?.user_metadata?.username || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSaveUsername(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { username: username.trim() || user?.email?.split("@")[0] || "trader" },
      });
      if (updateError) throw updateError;
      setNotice("Username updated.");
    } catch (err) {
      setError(err.message || "Could not update username.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (password.length < 6) throw new Error("Use at least 6 characters.");
      if (password !== confirmPassword) throw new Error("Password confirmation did not match.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setNotice("Password updated.");
    } catch (err) {
      setError(err.message || "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: 16 }}>
      <section className="page-card row">
        <h1 className="section-title">Settings</h1>
        <p className="section-subtitle">Account settings for standalone One Trade Rule.</p>
        <div className="stat">
          <div className="label">Signed in as</div>
          <div>{user?.email || "--"}</div>
        </div>
      </section>
      <section className="page-card row">
        <h2 className="section-title">Username</h2>
        <form className="row" onSubmit={handleSaveUsername}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <button type="submit" disabled={busy}>
            Save Username
          </button>
        </form>
      </section>
      <section className="page-card row">
        <h2 className="section-title">Password &amp; Security</h2>
        <form className="row" onSubmit={handleChangePassword}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
          <button type="submit" disabled={busy}>
            Change Password
          </button>
        </form>
      </section>
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
    </div>
  );
}

