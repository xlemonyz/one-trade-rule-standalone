import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function AuthGate() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim() || email.split("@")[0] || "trader" },
          },
        });
        if (signUpError) throw signUpError;
        setMessage("Account created. Check email verification if enabled.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-root">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>One Trade Rule</h1>
        <p>Standalone discipline engine for MT5 challenge tracking.</p>
        {mode === "signup" ? (
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />
        ) : null}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Have an account? Sign In" : "Need account? Sign Up"}
        </button>
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
      </form>
    </div>
  );
}
