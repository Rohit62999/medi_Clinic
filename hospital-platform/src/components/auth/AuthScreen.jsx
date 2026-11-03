import { useState } from "react";
import { FileText, ListOrdered, Stethoscope } from "lucide-react";
import { supabase } from "../../supabase";
import { BrandMark, Notice } from "../common";

export function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [signupRole, setSignupRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        if (fullName.trim().length < 2) throw new Error("Enter your full name.");
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");

        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), requested_role: signupRole } },
        });

        if (authError) throw authError;

        const doctorNote =
          signupRole === "doctor"
            ? " Doctor access starts after an administrator verifies your account. Until then you have patient access."
            : "";

        if (data.session) {
          setMessage(`Account created.${doctorNote}`);
        } else {
          setMessage(`Account created. Check your email to verify your address, then sign in.${doctorNote}`);
          setMode("login");
        }
      } else if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (authError) throw authError;
        setMessage("If an account exists for this email, you'll receive reset instructions shortly.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  const submitLabel = mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">CarePoint</span>
        </div>
        <div className="auth-intro-body">
          <h2>Book a specialist, follow your queue token, and keep your reports in one place.</h2>
          <ul className="auth-points">
            <li>
              <Stethoscope size={18} aria-hidden="true" /> Filter doctors by specialty and book an open slot
            </li>
            <li>
              <ListOrdered size={18} aria-hidden="true" /> See your token and waiting time on the day of your visit
            </li>
            <li>
              <FileText size={18} aria-hidden="true" /> Reports are visible only to you and your care team
            </li>
          </ul>
        </div>
        <p className="auth-intro-foot">CarePoint Hospital &amp; Health</p>
      </section>

      <section className="auth-form-area">
        <div className="auth-card">
          <div className="brand auth-mobile-brand">
            <BrandMark />
            <span className="brand-name">CarePoint</span>
          </div>
          <h1>{title}</h1>
          <p className="muted">
            {mode === "login"
              ? "Use the email and password for your CarePoint account."
              : mode === "signup"
                ? "Patients can book appointments straight away."
                : "We'll email you a link to choose a new password."}
          </p>

          <Notice tone="error">{error}</Notice>
          <Notice tone="success">{message}</Notice>

          <form onSubmit={handleSubmit} className="stack">
            {mode === "signup" && (
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>
            )}
            {mode === "signup" && (
              <label className="field">
                <span>I am a</span>
                <select value={signupRole} onChange={(e) => setSignupRole(e.target.value)}>
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor (needs admin approval)</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {mode !== "reset" && (
              <label className="field">
                <span className="field-label-row">
                  Password
                  {mode === "login" && (
                    <button type="button" className="link-button" onClick={() => changeMode("reset")}>
                      Forgot password?
                    </button>
                  )}
                </span>
                <input
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                />
              </label>
            )}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? "Please wait…" : submitLabel}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "New to CarePoint?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

