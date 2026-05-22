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
        <h1>{mode === "signup" ? "Create an account" : "Sign In"}</h1>
        <p>
          {mode === "signup"
            ? "Enter your email below to create your account"
            : "Welcome back to One Trade Rule"}
        </p>

        <div className="auth-social">
          <button
            type="button"
            className="auth-social-btn"
            onClick={() => alert("GitHub login coming soon")}
          >
            <span className="icon">⊕</span> GitHub
          </button>
          <button
            type="button"
            className="auth-social-btn"
            onClick={() => alert("Google login coming soon")}
          >
            <span className="icon">⊕</span> Google
          </button>
        </div>

        <div className="auth-divider">OR CONTINUE WITH</div>

        {mode === "signup" ? (
          <div className="form-group">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your username"
              autoComplete="username"
            />
          </div>
        ) : null}

        <div className="form-group">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="m@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=""
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
        </div>

        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign In"}
        </button>

        <button
          type="button"
          className="auth-toggle"
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
