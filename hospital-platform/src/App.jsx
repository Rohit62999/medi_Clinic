import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Home,
  ListOrdered,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Upload,
  User,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import "./App.css";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const NAV_ITEMS = [
  { id: "home", label: "Overview", icon: Home },
  { id: "directory", label: "Doctors", icon: Stethoscope },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "records", label: "Records", icon: FileText },
  { id: "queue", label: "Queue", icon: ListOrdered },
];
const PAGE_IDS = NAV_ITEMS.map((item) => item.id);

const APPOINTMENT_STATUS = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};
const QUEUE_STATUS = {
  waiting: "Waiting",
  next: "Called",
  in_consultation: "With doctor",
  completed: "Done",
  skipped: "Skipped",
};
const MEDICAL_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const QUEUE_REFRESH_MS = 20000;

const toMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayLocal = () => toDateKey(new Date());
const formatTime = (time) => {
  if (!time) return "";
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, "0");
  return `${((hours + 11) % 12) + 1}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
};
const formatDate = (date, options = { weekday: "short", day: "numeric", month: "short" }) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options) : "";
const formatFileSize = (bytes) => {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const initialOf = (name) =>
  (String(name || "").replace(/^dr\.?\s+/i, "").trim().charAt(0) || "?").toUpperCase();
const sameId = (a, b) => String(a) === String(b);
const errorMessage = (error, fallback) => {
  const message = String(error?.message || "");
  if (!message) return fallback;
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account doesn't have permission to do that.";
  }
  return message;
};
const scheduleFor = (hours, doctorId, dayOfWeek) =>
  hours.find(
    (row) => sameId(row.doctor_id, doctorId) && Number(row.day_of_week) === dayOfWeek && row.is_active !== false
  );
const workingDays = (hours, doctorId) =>
  WEEKDAYS.filter((day) => scheduleFor(hours, doctorId, day.value));
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const readPageFromHash = () => {
  const id = window.location.hash.replace("#", "");
  return PAGE_IDS.includes(id) ? id : "home";
};

/* ------------------------------------------------------------------ */
/* Small shared components                                             */
/* ------------------------------------------------------------------ */

function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path d="M11.5 7h5v4.5H21v5h-4.5V21h-5v-4.5H7v-5h4.5z" fill="#fff" />
    </svg>
  );
}

function Notice({ tone = "info", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="notice-close" aria-label="Dismiss message" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function PageHeader({ title, description, children }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

function RefreshButton({ onClick, busy, label = "Refresh" }) {
  return (
    <button type="button" className="btn btn-quiet btn-icon-text" onClick={onClick} disabled={busy}>
      <RefreshCw size={16} className={busy ? "spin" : undefined} aria-hidden="true" />
      <span>{busy ? "Refreshing" : label}</span>
    </button>
  );
}

function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

function StatusBadge({ status, labels }) {
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}

/* ------------------------------------------------------------------ */
/* App: session + profile                                              */
/* ------------------------------------------------------------------ */

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("Session error:", error.message);
      setSession(data?.session ?? null);
      setCheckingSession(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setCheckingSession(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      if (!userId) {
        setProfile(null);
        setProfileError("");
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      setProfileError("");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Profile error:", error.message);
        setProfileError("Your profile couldn't be loaded. Run the CarePoint SQL setup, then try again.");
      } else if (!data) {
        setProfileError("Your account has no profile yet. Run the CarePoint SQL setup to create missing profiles.");
      } else {
        setProfile(data);
      }
      setProfileLoading(false);
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (checkingSession || (session && profileLoading)) {
    return (
      <main className="loading-screen">
        <BrandMark size={40} />
        <p>Loading CarePoint…</p>
      </main>
    );
  }

  if (!session) return <AuthScreen />;

  if (profileError || !profile) {
    return (
      <main className="loading-screen">
        <section className="panel error-panel">
          <BrandMark size={36} />
          <h1>Profile setup needed</h1>
          <p>{profileError || "Your profile isn't available."}</p>
          <div className="button-row">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
              Log out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <Dashboard session={session} profile={profile} />;
}

/* ------------------------------------------------------------------ */
/* Sign in / sign up / reset                                           */
/* ------------------------------------------------------------------ */

function AuthScreen() {
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
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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

/* ------------------------------------------------------------------ */
/* Dashboard shell                                                     */
/* ------------------------------------------------------------------ */

function Dashboard({ session, profile }) {
  const role = profile.role;
  const isAdmin = role === "admin";
  const isDoctor = role === "doctor";
  const isPatient = !isAdmin && !isDoctor;
  const displayName = profile.full_name || session.user.user_metadata?.full_name || session.user.email;
  const userId = session.user.id;

  const [page, setPage] = useState(readPageFromHash);
  const [booking, setBooking] = useState(null);
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const [directory, setDirectory] = useState({ specialties: [], doctors: [], hours: [] });
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");

  // For doctor accounts: the doctors row an admin linked to this login.
  const [myDoctor, setMyDoctor] = useState(null);
  const [myDoctorLoaded, setMyDoctorLoaded] = useState(!isDoctor);

  // Hash-based pages: Back/Forward work and a refresh stays on the same page.
  useEffect(() => {
    const onHashChange = () => setPage(readPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const navigate = useCallback((nextPage) => {
    if (nextPage === "appointments") setBooking(null);
    if (window.location.hash !== `#${nextPage}`) window.location.hash = nextPage;
    else window.scrollTo(0, 0);
  }, []);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const [specialtyResult, doctorResult, hoursResult] = await Promise.all([
        supabase.from("specialties").select("id, name, description, is_active").order("name"),
        supabase
          .from("doctors")
          .select("id, full_name, qualifications, experience_years, bio, image_url, is_active, specialty_id, user_id, specialties(id, name)")
          .order("full_name"),
        supabase
          .from("doctor_schedules")
          .select("id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active"),
      ]);
      if (specialtyResult.error) throw specialtyResult.error;
      if (doctorResult.error) throw doctorResult.error;
      if (hoursResult.error) throw hoursResult.error;
      setDirectory({
        specialties: specialtyResult.data || [],
        doctors: doctorResult.data || [],
        hours: hoursResult.data || [],
      });
    } catch (error) {
      setDirectoryError(errorMessage(error, "The doctor directory couldn't be loaded."));
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (!isDoctor) return;
    let cancelled = false;
    supabase
      .from("doctors")
      .select("id, full_name, specialties(name)")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setMyDoctor(data || null);
        setMyDoctorLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isDoctor, userId]);

  function openBooking({ specialtyId = null, doctorId = null } = {}) {
    setBooking({ specialtyId, doctorId, key: Date.now() });
    if (window.location.hash !== "#appointments") window.location.hash = "appointments";
  }

  async function handleSignOut() {
    if (!window.confirm("Log out of CarePoint?")) return;
    setSigningOut(true);
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      setSigningOut(false);
    }
  }

  const shared = { session, userId, role, isAdmin, isDoctor, isPatient, myDoctor, myDoctorLoaded, navigate };

  return (
    <div className="app-shell">
      <Header
        page={page}
        navigate={navigate}
        displayName={displayName}
        email={session.user.email}
        role={role}
        onShowProfile={() => setShowProfile(true)}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />

      <main className="page" id="main">
        <Notice tone="error" onClose={() => setSignOutError("")}>
          {signOutError}
        </Notice>

        {page === "home" && (
          <HomePage {...shared} displayName={displayName} onBook={() => openBooking()} />
        )}
        {page === "directory" && (
          <DirectoryPage
            {...shared}
            directory={directory}
            loading={directoryLoading}
            error={directoryError}
            reload={loadDirectory}
            specialtyFilter={specialtyFilter}
            setSpecialtyFilter={setSpecialtyFilter}
            onBook={openBooking}
          />
        )}
        {page === "appointments" && (
          <AppointmentsPage
            {...shared}
            directory={directory}
            directoryLoading={directoryLoading}
            booking={booking}
            setBooking={setBooking}
            onBook={openBooking}
          />
        )}
        {page === "records" && <RecordsPage {...shared} />}
        {page === "queue" && <QueuePage {...shared} />}
      </main>

      <footer className="site-footer">CarePoint Hospital &amp; Health. Built by Rohit.</footer>

      {showProfile && (
        <ProfileModal
          profile={profile}
          session={session}
          displayName={displayName}
          onClose={() => setShowProfile(false)}
          onSignOut={handleSignOut}
          signingOut={signingOut}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header, desktop profile menu, mobile drawer                         */
/* ------------------------------------------------------------------ */

function Header({ page, navigate, displayName, email, role, onShowProfile, onSignOut, signingOut }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  // Close the profile menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // If the window grows to desktop width, the drawer is no longer needed.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = (event) => {
      if (event.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#home" onClick={() => navigate("home")} aria-label="CarePoint overview">
          <BrandMark />
          <span className="brand-name">CarePoint</span>
        </a>

        <nav className="topnav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="topnav-link"
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => item.id === "appointments" && navigate("appointments")}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="profile-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="avatar" aria-hidden="true">
                {initialOf(displayName)}
              </span>
              <span className="profile-trigger-text">
                <strong>{displayName}</strong>
                <span>{role}</span>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-head">
                  <strong>{displayName}</strong>
                  <span>{email}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowProfile();
                  }}
                >
                  <User size={16} aria-hidden="true" /> My profile
                </button>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-quiet btn-icon-text" onClick={onSignOut} disabled={signingOut}>
            <LogOut size={16} aria-hidden="true" />
            <span>{signingOut ? "Logging out" : "Log out"}</span>
          </button>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>

      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        page={page}
        navigate={navigate}
        displayName={displayName}
        email={email}
        role={role}
        onShowProfile={onShowProfile}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
    </header>
  );
}

function MobileDrawer({ open, onClose, page, navigate, displayName, email, role, onShowProfile, onSignOut, signingOut }) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && drawerRef.current) {
        // Keep keyboard focus inside the open drawer.
        const focusable = drawerRef.current.querySelectorAll("button, a[href]");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  function go(id) {
    navigate(id);
    onClose();
  }

  return (
    <div className={`drawer-layer${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        id="mobile-drawer"
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="drawer-head">
          <span className="avatar avatar-lg" aria-hidden="true">
            {initialOf(displayName)}
          </span>
          <div className="drawer-identity">
            <strong>{displayName}</strong>
            <span>{email}</span>
            <span className="role-tag">{role}</span>
          </div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close menu" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="drawer-link"
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <Icon size={20} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="drawer-footer">
          <button
            type="button"
            className="drawer-link"
            onClick={() => {
              onClose();
              onShowProfile();
            }}
          >
            <User size={20} aria-hidden="true" />
            My profile
          </button>
          <button type="button" className="drawer-link drawer-logout" onClick={onSignOut} disabled={signingOut}>
            <LogOut size={20} aria-hidden="true" />
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function ProfileModal({ profile, session, displayName, onClose, onSignOut, signingOut }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-head">
          <span className="avatar avatar-lg" aria-hidden="true">
            {initialOf(displayName)}
          </span>
          <h2 id="profile-title">{displayName}</h2>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Full name</dt>
            <dd>{profile.full_name || "Not provided"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{session.user.email || "Not available"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd className="capitalize">{profile.role}</dd>
          </div>
          <div>
            <dt>Email verified</dt>
            <dd>{session.user.email_confirmed_at ? "Yes" : "Not yet"}</dd>
          </div>
          <div>
            <dt>Account ID</dt>
            <dd className="mono-small">{session.user.id}</dd>
          </div>
        </dl>
        <div className="button-row button-row-end">
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" type="button" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function HomePage({ userId, isAdmin, isDoctor, isPatient, myDoctor, myDoctorLoaded, displayName, navigate, onBook }) {
  const [nextAppointment, setNextAppointment] = useState(null);
  const [adminCounts, setAdminCounts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = todayLocal();
      if (isAdmin) {
        const [pending, todayConfirmed] = await Promise.all([
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("status", "confirmed")
            .eq("appointment_date", today),
        ]);
        if (!cancelled) setAdminCounts({ pending: pending.count ?? 0, today: todayConfirmed.count ?? 0 });
      } else if (!isDoctor || myDoctorLoaded) {
        if (isDoctor && !myDoctor) {
          if (!cancelled) setNextAppointment(null);
        } else {
          let query = supabase
            .from("appointments")
            .select("id, appointment_date, start_time, end_time, status, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name)")
            .gte("appointment_date", today)
            .in("status", ["pending", "confirmed"])
            .order("appointment_date")
            .order("start_time")
            .limit(5);
          query = isDoctor ? query.eq("doctor_id", myDoctor.id) : query.eq("patient_id", userId);
          const { data } = await query;
          const now = new Date();
          const minutesNow = now.getHours() * 60 + now.getMinutes();
          const upcoming = (data || []).find(
            (a) => a.appointment_date > today || toMinutes(a.end_time) > minutesNow
          );
          if (!cancelled) setNextAppointment(upcoming || null);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isDoctor, myDoctor, myDoctorLoaded, userId]);

  const firstName = String(displayName).split(/[\s@]/)[0];
  const shortcuts = [
    {
      id: "directory",
      icon: Stethoscope,
      title: isAdmin ? "Doctors & specialties" : "Find a doctor",
      text: isAdmin ? "Add doctors, set working hours, manage specialties." : "Filter by specialty and book an open slot.",
    },
    {
      id: "appointments",
      icon: CalendarDays,
      title: "Appointments",
      text: isAdmin
        ? "Confirm requests and check patients in."
        : isDoctor
          ? "Your assigned appointments."
          : "Your bookings and their status.",
    },
    {
      id: "records",
      icon: FileText,
      title: "Medical records",
      text: isPatient ? "Reports your care team has shared with you." : "Upload and review patient documents.",
    },
    {
      id: "queue",
      icon: ListOrdered,
      title: "Patient queue",
      text: isPatient ? "Your token and waiting time on visit days." : "Today's tokens, call next, start and finish visits.",
    },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          isAdmin
            ? "Here's what needs attention at the hospital today."
            : isDoctor
              ? "Your clinic at a glance."
              : "Book care, follow your visit, and find your reports."
        }
      >
        {isPatient && (
          <button type="button" className="btn btn-primary" onClick={onBook}>
            <Plus size={18} aria-hidden="true" /> Book appointment
          </button>
        )}
      </PageHeader>

      {isDoctor && myDoctorLoaded && !myDoctor && (
        <Notice tone="info">
          Your doctor account is waiting for an administrator to verify it and link it to your directory listing.
        </Notice>
      )}

      <section className="panel summary-panel" aria-live="polite">
        {loading ? (
          <p className="muted">Loading your summary…</p>
        ) : isAdmin ? (
          <div className="summary-stats">
            <button type="button" className="summary-stat" onClick={() => navigate("appointments")}>
              <strong className="tabular">{adminCounts?.pending ?? 0}</strong>
              <span>appointment requests waiting for confirmation</span>
            </button>
            <button type="button" className="summary-stat" onClick={() => navigate("queue")}>
              <strong className="tabular">{adminCounts?.today ?? 0}</strong>
              <span>confirmed visits today</span>
            </button>
          </div>
        ) : nextAppointment ? (
          <div className="next-visit">
            <div className="date-block" aria-hidden="true">
              <span>{formatDate(nextAppointment.appointment_date, { month: "short" })}</span>
              <strong>{formatDate(nextAppointment.appointment_date, { day: "numeric" })}</strong>
            </div>
            <div className="next-visit-text">
              <span className="muted">Next appointment</span>
              <strong>
                {isDoctor
                  ? nextAppointment.patient?.full_name || "Patient"
                  : nextAppointment.doctor?.full_name || "Doctor"}
              </strong>
              <span>
                {formatDate(nextAppointment.appointment_date, { weekday: "long", day: "numeric", month: "long" })},{" "}
                {formatTime(nextAppointment.start_time)}
              </span>
            </div>
            <StatusBadge status={nextAppointment.status} labels={APPOINTMENT_STATUS} />
          </div>
        ) : (
          <p className="muted">
            {isDoctor ? "No upcoming appointments are assigned to you." : "You have no upcoming appointments."}
          </p>
        )}
      </section>

      <div className="shortcut-grid">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <a key={item.id} className="shortcut" href={`#${item.id}`} onClick={() => navigate(item.id)}>
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </span>
            </a>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Doctors & specialties                                               */
/* ------------------------------------------------------------------ */

const EMPTY_DOCTOR_FORM = { full_name: "", specialty_id: "", qualifications: "", experience_years: "0", bio: "" };

function DirectoryPage({
  isAdmin,
  isPatient,
  directory,
  loading,
  error,
  reload,
  specialtyFilter,
  setSpecialtyFilter,
  onBook,
}) {
  const { specialties, doctors, hours } = directory;
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [panel, setPanel] = useState(null); // "doctor" | "specialty" | null
  const [doctorForm, setDoctorForm] = useState(EMPTY_DOCTOR_FORM);
  const [specialtyForm, setSpecialtyForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [scheduleDoctor, setScheduleDoctor] = useState(null);

  const listedDoctors = isAdmin ? doctors : doctors.filter((d) => d.is_active);
  const listedSpecialties = isAdmin ? specialties : specialties.filter((s) => s.is_active);

  // If the selected specialty disappears (deactivated), fall back to all.
  useEffect(() => {
    if (specialtyFilter !== "all" && !loading && !listedSpecialties.some((s) => sameId(s.id, specialtyFilter))) {
      setSpecialtyFilter("all");
    }
  }, [listedSpecialties, specialtyFilter, setSpecialtyFilter, loading]);

  const countBySpecialty = useMemo(() => {
    const counts = {};
    listedDoctors.forEach((d) => {
      counts[d.specialty_id] = (counts[d.specialty_id] || 0) + 1;
    });
    return counts;
  }, [listedDoctors]);

  const selectedSpecialty = listedSpecialties.find((s) => sameId(s.id, specialtyFilter));
  const query = search.trim().toLowerCase();
  const visibleDoctors = listedDoctors.filter((doctor) => {
    if (specialtyFilter !== "all" && !sameId(doctor.specialty_id, specialtyFilter)) return false;
    if (!query) return true;
    return [doctor.full_name, doctor.qualifications, doctor.bio, doctor.specialties?.name].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });

  const say = (tone, text) => setNotice({ tone, text });

  async function addDoctor(event) {
    event.preventDefault();
    setSaving(true);
    say("", "");
    const { error: saveError } = await supabase.from("doctors").insert({
      full_name: doctorForm.full_name.trim(),
      specialty_id: doctorForm.specialty_id || null,
      qualifications: doctorForm.qualifications.trim() || null,
      experience_years: Math.max(0, Number(doctorForm.experience_years) || 0),
      bio: doctorForm.bio.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (saveError) return say("error", errorMessage(saveError, "The doctor couldn't be saved."));
    say("success", `${doctorForm.full_name.trim()} was added. Set their working hours so patients can book.`);
    setDoctorForm(EMPTY_DOCTOR_FORM);
    setPanel(null);
    reload();
  }

  async function addSpecialty(event) {
    event.preventDefault();
    setSaving(true);
    say("", "");
    const { error: saveError } = await supabase.from("specialties").insert({
      name: specialtyForm.name.trim(),
      description: specialtyForm.description.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (saveError) return say("error", errorMessage(saveError, "The specialty couldn't be saved."));
    say("success", `${specialtyForm.name.trim()} was added.`);
    setSpecialtyForm({ name: "", description: "" });
    setPanel(null);
    reload();
  }

  async function toggleActive(table, row, label) {
    say("", "");
    const { error: saveError } = await supabase.from(table).update({ is_active: !row.is_active }).eq("id", row.id);
    if (saveError) return say("error", errorMessage(saveError, "The change couldn't be saved."));
    say("success", `${label} is now ${row.is_active ? "hidden from patients" : "visible to patients"}.`);
    reload();
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? "Doctors & specialties" : "Find a doctor"}
        description={
          isAdmin
            ? "Manage the directory patients book from."
            : "Choose a specialty to narrow the list, then book a time that suits you."
        }
      >
        <RefreshButton onClick={reload} busy={loading} />
        {isPatient && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onBook({ specialtyId: specialtyFilter === "all" ? null : specialtyFilter })}
          >
            <Plus size={18} aria-hidden="true" />
            {selectedSpecialty ? `Book ${selectedSpecialty.name}` : "Book appointment"}
          </button>
        )}
        {isAdmin && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPanel(panel === "specialty" ? null : "specialty")}
            >
              Add specialty
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPanel(panel === "doctor" ? null : "doctor")}
            >
              <Plus size={18} aria-hidden="true" /> Add doctor
            </button>
          </>
        )}
      </PageHeader>

      <Notice tone="error">{error}</Notice>
      <Notice tone={notice.tone || "info"} onClose={() => say("", "")}>
        {notice.text}
      </Notice>

      {isAdmin && panel === "doctor" && (
        <form className="panel form-panel" onSubmit={addDoctor}>
          <h2>Add a doctor</h2>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input
                required
                value={doctorForm.full_name}
                onChange={(e) => setDoctorForm({ ...doctorForm, full_name: e.target.value })}
                placeholder="Dr. Aanya Sharma"
              />
            </label>
            <label className="field">
              <span>Specialty</span>
              <select
                value={doctorForm.specialty_id}
                onChange={(e) => setDoctorForm({ ...doctorForm, specialty_id: e.target.value })}
              >
                <option value="">Not assigned</option>
                {specialties
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Qualifications</span>
              <input
                value={doctorForm.qualifications}
                onChange={(e) => setDoctorForm({ ...doctorForm, qualifications: e.target.value })}
                placeholder="MBBS, MD"
              />
            </label>
            <label className="field">
              <span>Years of experience</span>
              <input
                type="number"
                min="0"
                max="70"
                value={doctorForm.experience_years}
                onChange={(e) => setDoctorForm({ ...doctorForm, experience_years: e.target.value })}
              />
            </label>
            <label className="field field-wide">
              <span>Short introduction</span>
              <textarea
                rows="3"
                value={doctorForm.bio}
                onChange={(e) => setDoctorForm({ ...doctorForm, bio: e.target.value })}
                placeholder="Areas of clinical interest"
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving || !doctorForm.full_name.trim()}>
              {saving ? "Saving…" : "Save doctor"}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {isAdmin && panel === "specialty" && (
        <form className="panel form-panel" onSubmit={addSpecialty}>
          <h2>Add a specialty</h2>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input
                required
                value={specialtyForm.name}
                onChange={(e) => setSpecialtyForm({ ...specialtyForm, name: e.target.value })}
                placeholder="Dermatology"
              />
            </label>
            <label className="field">
              <span>What it treats</span>
              <input
                value={specialtyForm.description}
                onChange={(e) => setSpecialtyForm({ ...specialtyForm, description: e.target.value })}
                placeholder="Skin, hair and nail conditions"
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving || !specialtyForm.name.trim()}>
              {saving ? "Saving…" : "Save specialty"}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {isAdmin && scheduleDoctor && (
        <ScheduleEditor
          key={scheduleDoctor.id}
          doctor={scheduleDoctor}
          hours={hours}
          onClose={() => setScheduleDoctor(null)}
          onSaved={(name) => {
            setScheduleDoctor(null);
            say("success", `Working hours saved for ${name}.`);
            reload();
          }}
        />
      )}

      <section className="filter-bar" aria-label="Filter doctors">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or qualification"
            aria-label="Search doctors"
          />
        </label>
        <div className="chip-row" role="group" aria-label="Specialty">
          <button
            type="button"
            className="chip"
            aria-pressed={specialtyFilter === "all"}
            onClick={() => setSpecialtyFilter("all")}
          >
            All <span className="chip-count">{listedDoctors.length}</span>
          </button>
          {listedSpecialties.map((specialty) => (
            <button
              key={specialty.id}
              type="button"
              className={`chip${specialty.is_active ? "" : " chip-inactive"}`}
              aria-pressed={sameId(specialtyFilter, specialty.id)}
              onClick={() => setSpecialtyFilter(String(specialty.id))}
            >
              {specialty.name} <span className="chip-count">{countBySpecialty[specialty.id] || 0}</span>
            </button>
          ))}
        </div>
        {selectedSpecialty?.description && <p className="filter-note">{selectedSpecialty.description}</p>}
      </section>

      {loading && doctors.length === 0 ? (
        <p className="muted loading-line">Loading doctors…</p>
      ) : visibleDoctors.length === 0 ? (
        <EmptyState
          title={listedDoctors.length === 0 ? "No doctors listed yet" : "No doctors match"}
          action={
            listedDoctors.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearch("");
                  setSpecialtyFilter("all");
                }}
              >
                Show all doctors
              </button>
            )
          }
        >
          {listedDoctors.length === 0
            ? isAdmin
              ? "Use Add doctor to create the first listing."
              : "Doctors will appear here once the hospital adds them."
            : "Try another specialty or clear the search."}
        </EmptyState>
      ) : (
        <>
          <p className="result-count">
            {visibleDoctors.length} {visibleDoctors.length === 1 ? "doctor" : "doctors"}
            {selectedSpecialty ? ` in ${selectedSpecialty.name}` : ""}
          </p>
          <div className="doctor-grid">
            {visibleDoctors.map((doctor) => {
              const days = workingDays(hours, doctor.id);
              return (
                <article className={`doctor-card${doctor.is_active ? "" : " is-inactive"}`} key={doctor.id}>
                  <div className="doctor-card-head">
                    {doctor.image_url ? (
                      <img
                        className="doctor-photo"
                        src={doctor.image_url}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="doctor-initial" aria-hidden="true">
                        {initialOf(doctor.full_name)}
                      </span>
                    )}
                    <div>
                      <h3>{doctor.full_name}</h3>
                      <p className="doctor-specialty">{doctor.specialties?.name || "General"}</p>
                    </div>
                    {isAdmin && !doctor.is_active && <span className="badge badge-cancelled">Hidden</span>}
                  </div>
                  {(doctor.qualifications || doctor.experience_years > 0) && (
                    <p className="doctor-meta">
                      {[
                        doctor.qualifications,
                        doctor.experience_years > 0 &&
                          `${doctor.experience_years} ${doctor.experience_years === 1 ? "year" : "years"} experience`,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {doctor.bio && <p className="doctor-bio">{doctor.bio}</p>}
                  <div className="day-row" aria-label="Days available">
                    {days.length ? (
                      WEEKDAYS.map((day) => (
                        <span
                          key={day.value}
                          className={`day-dot${days.includes(day) ? " on" : ""}`}
                          title={day.label}
                        >
                          {day.short.charAt(0)}
                          <span className="visually-hidden">
                            {day.label} {days.includes(day) ? "available" : "unavailable"}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="muted small">Hours not published yet</span>
                    )}
                  </div>
                  <div className="doctor-card-actions">
                    {isPatient && doctor.is_active && (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        disabled={!days.length}
                        onClick={() => onBook({ specialtyId: doctor.specialty_id, doctorId: doctor.id })}
                      >
                        Book appointment
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => setScheduleDoctor(doctor)}>
                          Working hours
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={() => toggleActive("doctors", doctor, doctor.full_name)}
                        >
                          {doctor.is_active ? "Hide" : "Show"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {isAdmin && specialties.length > 0 && (
        <section className="panel list-panel">
          <h2>Specialties</h2>
          <ul className="row-list">
            {specialties.map((specialty) => (
              <li key={specialty.id} className="row">
                <div className="row-main">
                  <strong>{specialty.name}</strong>
                  <span className="muted">{specialty.description || "No description"}</span>
                </div>
                {!specialty.is_active && <span className="badge badge-cancelled">Hidden</span>}
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => toggleActive("specialties", specialty, specialty.name)}
                >
                  {specialty.is_active ? "Hide" : "Show"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ScheduleEditor({ doctor, hours, onClose, onSaved }) {
  const [rows, setRows] = useState(() =>
    WEEKDAYS.map((day) => {
      const existing = scheduleFor(hours, doctor.id, day.value);
      return {
        day_of_week: day.value,
        enabled: Boolean(existing),
        opening_time: existing?.start_time?.slice(0, 5) || "09:00",
        closing_time: existing?.end_time?.slice(0, 5) || "17:00",
        duration: String(existing?.slot_duration_minutes || 30),
      };
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (day, patch) =>
    setRows((current) => current.map((row) => (row.day_of_week === day ? { ...row, ...patch } : row)));

  async function save(event) {
    event.preventDefault();
    setError("");
    for (const row of rows.filter((r) => r.enabled)) {
      const duration = Number(row.duration);
      if (toMinutes(row.opening_time) >= toMinutes(row.closing_time)) {
        return setError(`${WEEKDAYS[row.day_of_week].label}: closing time must be after opening time.`);
      }
      if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
        return setError("Appointment length must be between 5 and 240 minutes.");
      }
      if (toMinutes(row.closing_time) - toMinutes(row.opening_time) < duration) {
        return setError(`${WEEKDAYS[row.day_of_week].label}: the day is shorter than one appointment.`);
      }
    }
    setSaving(true);
    try {
      for (const row of rows) {
        // Any row for this weekday (active or not) is reused, so re-enabling
        // a day never creates a duplicate.
        const existing = hours.find(
          (item) => sameId(item.doctor_id, doctor.id) && Number(item.day_of_week) === row.day_of_week
        );
        const values = {
          start_time: row.opening_time,
          end_time: row.closing_time,
          slot_duration_minutes: Number(row.duration),
          is_active: true,
        };
        if (existing) {
          const { error: saveError } = await supabase
            .from("doctor_schedules")
            .update(row.enabled ? values : { is_active: false })
            .eq("id", existing.id);
          if (saveError) throw saveError;
        } else if (row.enabled) {
          const { error: saveError } = await supabase
            .from("doctor_schedules")
            .insert({ doctor_id: doctor.id, day_of_week: row.day_of_week, ...values });
          if (saveError) throw saveError;
        }
      }
      onSaved(doctor.full_name);
    } catch (saveError) {
      setError(errorMessage(saveError, "Working hours couldn't be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={save}>
      <h2>Working hours for {doctor.full_name}</h2>
      <p className="muted">Turn on each day the doctor sees patients. Slots are created from these hours.</p>
      <Notice tone="error">{error}</Notice>
      <div className="schedule-table" role="group" aria-label="Weekly hours">
        {rows.map((row) => (
          <div className={`schedule-row${row.enabled ? "" : " is-off"}`} key={row.day_of_week}>
            <label className="check">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => update(row.day_of_week, { enabled: e.target.checked })}
              />
              {WEEKDAYS[row.day_of_week].label}
            </label>
            <label className="field field-compact">
              <span>Opens</span>
              <input
                type="time"
                disabled={!row.enabled}
                required={row.enabled}
                value={row.opening_time}
                onChange={(e) => update(row.day_of_week, { opening_time: e.target.value })}
              />
            </label>
            <label className="field field-compact">
              <span>Closes</span>
              <input
                type="time"
                disabled={!row.enabled}
                required={row.enabled}
                value={row.closing_time}
                onChange={(e) => update(row.day_of_week, { closing_time: e.target.value })}
              />
            </label>
            <label className="field field-compact">
              <span>Minutes per visit</span>
              <input
                type="number"
                min="5"
                max="240"
                step="5"
                disabled={!row.enabled}
                required={row.enabled}
                value={row.duration}
                onChange={(e) => update(row.day_of_week, { duration: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save hours"}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

function AppointmentsPage({
  userId,
  isAdmin,
  isDoctor,
  isPatient,
  myDoctor,
  myDoctorLoaded,
  navigate,
  directory,
  directoryLoading,
  booking,
  setBooking,
  onBook,
}) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [view, setView] = useState("upcoming");
  const [busyId, setBusyId] = useState(null);
  const [checkedIn, setCheckedIn] = useState({});

  const load = useCallback(async () => {
    if (isDoctor && !myDoctorLoaded) return;
    setLoading(true);
    if (isDoctor && !myDoctor) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    let query = supabase
      .from("appointments")
      .select(
        "id, patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, created_at, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name)"
      )
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (isDoctor) query = query.eq("doctor_id", myDoctor.id);
    else if (!isAdmin) query = query.eq("patient_id", userId);
    const [{ data, error }, queueResult] = await Promise.all([
      query,
      isPatient
        ? Promise.resolve({ data: [] })
        : supabase.from("patient_queue").select("appointment_id, token_number").eq("queue_date", todayLocal()),
    ]);
    if (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Appointments couldn't be loaded.") });
      setAppointments([]);
    } else {
      setAppointments(data || []);
    }
    const tokens = {};
    (queueResult.data || []).forEach((entry) => {
      tokens[entry.appointment_id] = entry.token_number;
    });
    setCheckedIn(tokens);
    setLoading(false);
  }, [isAdmin, isDoctor, isPatient, myDoctor, myDoctorLoaded, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = todayLocal();
  const isUpcoming = (a) => a.appointment_date >= today && ["pending", "confirmed"].includes(a.status);
  const upcoming = appointments.filter(isUpcoming);
  const past = appointments.filter((a) => !isUpcoming(a)).reverse();
  const shown = view === "upcoming" ? upcoming : past;

  async function setStatus(appointment, status) {
    setBusyId(appointment.id);
    setNotice({ tone: "", text: "" });
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appointment.id);
    setBusyId(null);
    if (error) return setNotice({ tone: "error", text: errorMessage(error, "The appointment couldn't be updated.") });
    setNotice({ tone: "success", text: `Appointment ${APPOINTMENT_STATUS[status].toLowerCase()}.` });
    load();
  }

  async function cancelOwn(appointment) {
    if (!window.confirm(`Cancel your appointment with ${appointment.doctor?.full_name || "the doctor"}?`)) return;
    setBusyId(appointment.id);
    setNotice({ tone: "", text: "" });
    const { error } = await supabase.rpc("cancel_my_appointment", { p_appointment_id: appointment.id });
    setBusyId(null);
    if (error) return setNotice({ tone: "error", text: errorMessage(error, "The appointment couldn't be cancelled.") });
    setNotice({ tone: "success", text: "Appointment cancelled. The time is free for other patients again." });
    load();
  }

  async function checkIn(appointment) {
    setBusyId(appointment.id);
    setNotice({ tone: "", text: "" });
    const { data, error } = await supabase.rpc("check_in_patient", { p_appointment_id: appointment.id });
    setBusyId(null);
    if (error) return setNotice({ tone: "error", text: errorMessage(error, "The patient couldn't be checked in.") });
    setNotice({
      tone: "success",
      text: `${appointment.patient?.full_name || "Patient"} checked in with token ${data?.token_number}.`,
    });
    load();
  }

  return (
    <>
      <PageHeader
        title={booking ? "Book an appointment" : isAdmin ? "Appointments" : "My appointments"}
        description={
          booking
            ? "Pick a specialty and doctor, then choose an open time."
            : isAdmin
              ? "Confirm requests, check patients in on the day, and keep statuses up to date."
              : isDoctor
                ? "Appointments booked with you."
                : "Your requests and their status. New requests stay pending until the hospital confirms them."
        }
      >
        {!booking && <RefreshButton onClick={load} busy={loading} />}
        {isPatient && !booking && (
          <button type="button" className="btn btn-primary" onClick={() => onBook()}>
            <Plus size={18} aria-hidden="true" /> Book appointment
          </button>
        )}
      </PageHeader>

      <Notice tone={notice.tone || "info"} onClose={() => setNotice({ tone: "", text: "" })}>
        {notice.text}
      </Notice>

      {isDoctor && myDoctorLoaded && !myDoctor && (
        <Notice tone="info">
          Your doctor account is waiting for an administrator to verify it and link it to your directory listing.
        </Notice>
      )}

      {booking && isPatient && (
        <BookingForm
          key={booking.key}
          userId={userId}
          directory={directory}
          directoryLoading={directoryLoading}
          initial={booking}
          onCancel={() => {
            setBooking(null);
            navigate("directory");
          }}
          onBooked={(text) => {
            setBooking(null);
            setView("upcoming");
            setNotice({ tone: "success", text });
            load();
          }}
        />
      )}

      {!booking && (
        <>
          <div className="segmented" role="group" aria-label="Appointment list">
            <button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}>
              Upcoming <span className="chip-count">{upcoming.length}</span>
            </button>
            <button type="button" aria-pressed={view === "past"} onClick={() => setView("past")}>
              Past and cancelled <span className="chip-count">{past.length}</span>
            </button>
          </div>

          {loading && appointments.length === 0 ? (
            <p className="muted loading-line">Loading appointments…</p>
          ) : shown.length === 0 ? (
            <EmptyState
              title={view === "upcoming" ? "No upcoming appointments" : "Nothing here yet"}
              action={
                isPatient &&
                view === "upcoming" && (
                  <button type="button" className="btn btn-primary" onClick={() => onBook()}>
                    Book appointment
                  </button>
                )
              }
            >
              {view === "upcoming"
                ? isPatient
                  ? "Book a visit and it will appear here."
                  : "New requests will appear here."
                : "Completed and cancelled appointments will appear here."}
            </EmptyState>
          ) : (
            <ul className="panel row-list appointment-list">
              {shown.map((appointment) => {
                const isToday = appointment.appointment_date === today;
                const token = checkedIn[appointment.id];
                const busy = busyId === appointment.id;
                const canStaffAct = isAdmin || isDoctor;
                return (
                  <li className="row appointment-row" key={appointment.id}>
                    <div className="date-block" aria-hidden="true">
                      <span>{formatDate(appointment.appointment_date, { month: "short" })}</span>
                      <strong>{formatDate(appointment.appointment_date, { day: "numeric" })}</strong>
                    </div>
                    <div className="row-main">
                      <strong>
                        {canStaffAct ? appointment.patient?.full_name || "Patient" : appointment.doctor?.full_name || "Doctor"}
                      </strong>
                      <span className="muted">
                        {formatDate(appointment.appointment_date, { weekday: "short" })},{" "}
                        <span className="tabular">
                          {formatTime(appointment.start_time)} to {formatTime(appointment.end_time)}
                        </span>
                        {isAdmin && appointment.doctor?.full_name ? `, with ${appointment.doctor.full_name}` : ""}
                        {!canStaffAct && appointment.doctor?.specialties?.name
                          ? `, ${appointment.doctor.specialties.name}`
                          : ""}
                      </span>
                      {appointment.reason && <span className="row-note">{appointment.reason}</span>}
                    </div>
                    <div className="row-side">
                      {token ? (
                        <span className="badge badge-token">Token {token}</span>
                      ) : (
                        <StatusBadge status={appointment.status} labels={APPOINTMENT_STATUS} />
                      )}
                      <div className="row-actions">
                        {isAdmin && appointment.status === "pending" && (
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={busy}
                            onClick={() => setStatus(appointment, "confirmed")}
                          >
                            Confirm
                          </button>
                        )}
                        {canStaffAct && appointment.status === "confirmed" && isToday && !token && (
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={busy}
                            onClick={() => checkIn(appointment)}
                          >
                            Check in
                          </button>
                        )}
                        {canStaffAct && appointment.status === "confirmed" && !token && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={busy}
                            onClick={() => setStatus(appointment, "completed")}
                          >
                            Mark completed
                          </button>
                        )}
                        {canStaffAct && ["pending", "confirmed"].includes(appointment.status) && !token && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={busy}
                            onClick={() => setStatus(appointment, "cancelled")}
                          >
                            Cancel
                          </button>
                        )}
                        {isPatient && isUpcoming(appointment) && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={busy}
                            onClick={() => cancelOwn(appointment)}
                          >
                            Cancel
                          </button>
                        )}
                        {token && (
                          <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate("queue")}>
                            Open queue
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function BookingForm({ userId, directory, directoryLoading, initial, onCancel, onBooked }) {
  const { specialties, doctors, hours } = directory;
  const bookableDoctors = doctors.filter((d) => d.is_active && workingDays(hours, d.id).length > 0);
  const activeSpecialties = specialties.filter(
    (s) => s.is_active && bookableDoctors.some((d) => sameId(d.specialty_id, s.id))
  );

  const [specialtyId, setSpecialtyId] = useState(initial.specialtyId ? String(initial.specialtyId) : "");
  const choices = bookableDoctors.filter((d) => !specialtyId || sameId(d.specialty_id, specialtyId));
  const [doctorId, setDoctorId] = useState(() => {
    if (initial.doctorId) return String(initial.doctorId);
    return choices.length === 1 ? String(choices[0].id) : "";
  });
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const doctor = bookableDoctors.find((d) => sameId(d.id, doctorId));
  const days = doctor ? workingDays(hours, doctor.id) : [];

  // Next dates this doctor works, as quick picks (saves fiddling with a calendar on phones).
  const quickDates = useMemo(() => {
    if (!doctor) return [];
    const result = [];
    const cursor = new Date();
    const nowMinutes = cursor.getHours() * 60 + cursor.getMinutes();
    for (let i = 0; i < 21 && result.length < 6; i += 1) {
      const schedule = scheduleFor(hours, doctor.id, cursor.getDay());
      // Skip today once the last slot's start time has passed.
      const lastStart = schedule ? toMinutes(schedule.end_time) - Number(schedule.slot_duration_minutes) : -1;
      if (schedule && (i > 0 || lastStart > nowMinutes)) result.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [doctor, hours]);

  const loadSlots = useCallback(
    async (forDoctor, forDate) => {
      const requestId = ++requestRef.current;
      setSlots([]);
      setSlot(null);
      setError("");
      if (!forDoctor || !forDate) return;
      const schedule = scheduleFor(hours, forDoctor.id, new Date(`${forDate}T12:00:00`).getDay());
      if (!schedule) return;
      setLoadingSlots(true);
      const { data, error: slotError } = await supabase.rpc("get_doctor_booked_slots", {
        p_doctor_id: forDoctor.id,
        p_appointment_date: forDate,
      });
      if (requestId !== requestRef.current) return; // a newer request replaced this one
      setLoadingSlots(false);
      if (slotError) return setError(errorMessage(slotError, "Open times couldn't be loaded."));
      const busy = data || [];
      const opening = toMinutes(schedule.start_time);
      const closing = toMinutes(schedule.end_time);
      const duration = Number(schedule.slot_duration_minutes);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const next = [];
      for (let start = opening; start + duration <= closing; start += duration) {
        const end = start + duration;
        const taken = busy.some((b) => start < toMinutes(b.end_time) && end > toMinutes(b.start_time));
        if (!taken && (forDate !== todayLocal() || start > nowMinutes)) {
          next.push({ start_time: toTime(start), end_time: toTime(end) });
        }
      }
      setSlots(next);
    },
    [hours]
  );

  function chooseSpecialty(value) {
    setSpecialtyId(value);
    const nextChoices = bookableDoctors.filter((d) => !value || sameId(d.specialty_id, value));
    const keep = nextChoices.some((d) => sameId(d.id, doctorId));
    const nextDoctorId = keep ? doctorId : nextChoices.length === 1 ? String(nextChoices[0].id) : "";
    setDoctorId(nextDoctorId);
    if (!keep) {
      setDate("");
      loadSlots(null, "");
    }
  }

  function chooseDoctor(value) {
    setDoctorId(value);
    setDate("");
    loadSlots(null, "");
  }

  function chooseDate(value) {
    setDate(value);
    loadSlots(doctor, value);
  }

  async function submit(event) {
    event.preventDefault();
    if (!doctor || !date || !slot) return setError("Choose a doctor, a date and an open time.");
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.from("appointments").insert({
      patient_id: userId,
      doctor_id: doctor.id,
      appointment_date: date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      reason: reason.trim() || null,
      status: "pending",
    });
    setSaving(false);
    if (saveError) {
      const taken =
        saveError.code === "23P01" ||
        saveError.code === "23505" ||
        String(saveError.message).includes("doctor_no_overlapping_appointments");
      setError(taken ? "Someone booked that time a moment ago. Choose another time." : errorMessage(saveError, "The booking couldn't be saved."));
      loadSlots(doctor, date);
      return;
    }
    onBooked(
      `Requested ${doctor.full_name} on ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })} at ${formatTime(slot.start_time)}. You'll see it change to Confirmed once the hospital approves it.`
    );
  }

  if (directoryLoading && doctors.length === 0) return <p className="muted loading-line">Loading doctors…</p>;

  return (
    <form className="panel booking-form" onSubmit={submit}>
      <Notice tone="error">{error}</Notice>

      <div className="booking-step">
        <h2 className="step-title">
          <span className="step-number">1</span> Doctor
        </h2>
        <div className="form-grid">
          <label className="field">
            <span>Specialty</span>
            <select value={specialtyId} onChange={(e) => chooseSpecialty(e.target.value)}>
              <option value="">All specialties</option>
              {activeSpecialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Doctor</span>
            <select value={doctorId} onChange={(e) => chooseDoctor(e.target.value)} required>
              <option value="">{choices.length ? "Choose a doctor" : "No doctors available"}</option>
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                  {!specialtyId && d.specialties?.name ? ` (${d.specialties.name})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {doctor && (
          <p className="muted small">
            {doctor.full_name} sees patients on {days.map((d) => d.label).join(", ")}.
          </p>
        )}
      </div>

      <div className={`booking-step${doctor ? "" : " is-disabled"}`}>
        <h2 className="step-title">
          <span className="step-number">2</span> Date
        </h2>
        {doctor ? (
          <>
            <div className="chip-row chip-row-wrap" role="group" aria-label="Next available dates">
              {quickDates.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip chip-date"
                  aria-pressed={date === value}
                  onClick={() => chooseDate(value)}
                >
                  <span>{formatDate(value, { weekday: "short" })}</span>
                  <strong className="tabular">{formatDate(value, { day: "numeric", month: "short" })}</strong>
                </button>
              ))}
            </div>
            <label className="field field-inline">
              <span>Or pick another date</span>
              <input type="date" min={todayLocal()} value={date} onChange={(e) => chooseDate(e.target.value)} />
            </label>
          </>
        ) : (
          <p className="muted small">Choose a doctor first.</p>
        )}
      </div>

      <div className={`booking-step${date ? "" : " is-disabled"}`}>
        <h2 className="step-title">
          <span className="step-number">3</span> Time
        </h2>
        {!date ? (
          <p className="muted small">Choose a date to see open times.</p>
        ) : loadingSlots ? (
          <p className="muted small">Checking open times…</p>
        ) : slots.length === 0 ? (
          <p className="muted small">
            {doctor && !scheduleFor(hours, doctor.id, new Date(`${date}T12:00:00`).getDay())
              ? `${doctor.full_name} doesn't see patients on ${formatDate(date, { weekday: "long" })}s.`
              : "Every time on this date is taken. Try another date."}
          </p>
        ) : (
          <div className="slot-grid" role="group" aria-label="Open times">
            {slots.map((s) => (
              <button
                key={s.start_time}
                type="button"
                className="slot"
                aria-pressed={slot?.start_time === s.start_time}
                onClick={() => setSlot(s)}
              >
                {formatTime(s.start_time)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="booking-step">
        <label className="field">
          <span>Reason for visit (optional)</span>
          <textarea
            rows="3"
            maxLength="500"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A few words help the doctor prepare"
          />
        </label>
      </div>

      <div className="booking-summary">
        <p>
          {slot && doctor
            ? `${doctor.full_name}, ${formatDate(date, { weekday: "short", day: "numeric", month: "short" })} at ${formatTime(slot.start_time)}`
            : "Choose a doctor, date and time."}
        </p>
        <div className="button-row">
          <button className="btn btn-quiet" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving || !slot}>
            {saving ? "Requesting…" : "Request appointment"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Medical records                                                     */
/* ------------------------------------------------------------------ */

function RecordsPage({ userId, isPatient, isDoctor, myDoctor, myDoctorLoaded }) {
  const canUpload = !isPatient;
  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [form, setForm] = useState({ patient_id: "", title: "", file: null });
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [patientFilter, setPatientFilter] = useState("all");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (canUpload) {
        const { data: patientData, error: patientError } = await supabase.rpc("get_medical_record_patients");
        if (patientError) throw patientError;
        setPatients(patientData || []);
      }
      let query = supabase
        .from("medical_records")
        .select(
          "id, patient_id, record_date, title, diagnosis, notes, file_path, file_name, mime_type, file_size_bytes, uploaded_by, created_at, doctor:doctors(full_name)"
        )
        .order("record_date", { ascending: false })
        .order("id", { ascending: false });
      // The database already limits rows to what this account may see.
      // Patients also filter explicitly, so a policy mistake can't widen the list.
      if (isPatient) query = query.eq("patient_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Medical records error:", error);
      setNotice({ tone: "error", text: errorMessage(error, "Medical records couldn't be loaded.") });
    } finally {
      setLoading(false);
    }
  }, [canUpload, isPatient, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const patientName = (id) => patients.find((p) => sameId(p.id, id))?.full_name || "Patient";
  const shown = patientFilter === "all" ? records : records.filter((r) => sameId(r.patient_id, patientFilter));

  async function upload(event) {
    event.preventDefault();
    setNotice({ tone: "", text: "" });
    const file = form.file;
    if (!form.patient_id || !form.title.trim() || !file) {
      return setNotice({ tone: "error", text: "Choose a patient, add a title and select a file." });
    }
    if (!MEDICAL_FILE_TYPES.includes(file.type) || !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      return setNotice({ tone: "error", text: "Upload a PDF, JPG, PNG or WEBP file." });
    }
    if (file.size > MAX_FILE_BYTES) {
      return setNotice({ tone: "error", text: "Files can be up to 10 MB." });
    }

    setUploading(true);
    // The first folder is the patient's id; Storage policies use it to decide who can read the file.
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100);
    const objectPath = `${form.patient_id}/${crypto.randomUUID()}-${safeName}`;
    try {
      const { error: storageError } = await supabase.storage
        .from("medical-documents")
        .upload(objectPath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (storageError) throw storageError;

      const { error: recordError } = await supabase.from("medical_records").insert({
        patient_id: form.patient_id,
        title: form.title.trim(),
        record_date: todayLocal(),
        file_path: objectPath,
        file_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
      });
      if (recordError) {
        await supabase.storage.from("medical-documents").remove([objectPath]);
        throw recordError;
      }
      setNotice({ tone: "success", text: `"${form.title.trim()}" was shared with ${patientName(form.patient_id)}.` });
      setForm({ patient_id: "", title: "", file: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (error) {
      console.error("Upload error:", error);
      const message = String(error?.message || "");
      setNotice({
        tone: "error",
        text: /bucket not found/i.test(message)
          ? 'The "medical-documents" bucket is missing. Run the CarePoint SQL setup.'
          : /row-level security|permission|unauthorized|403/i.test(message)
            ? "You can only upload for patients who have booked with you."
            : /payload too large|maximum.*size/i.test(message)
              ? "That file is larger than the 10 MB limit."
              : `Upload failed: ${message || "unknown error"}`,
      });
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(record) {
    // Open the tab during the click so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const { data, error } = await supabase.storage.from("medical-documents").createSignedUrl(record.file_path, 60);
    if (error || !data?.signedUrl) {
      tab?.close();
      return setNotice({ tone: "error", text: "This document couldn't be opened. You may not have access to it." });
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  async function remove(record) {
    if (!window.confirm(`Delete "${record.title || record.file_name}" permanently?`)) return;
    setDeletingId(record.id);
    setNotice({ tone: "", text: "" });
    // Delete the database row first: if that's not allowed, the file stays untouched.
    const { data: deleted, error: rowError } = await supabase
      .from("medical_records")
      .delete()
      .eq("id", record.id)
      .select("id");
    if (rowError || !deleted?.length) {
      setDeletingId(null);
      return setNotice({
        tone: "error",
        text: rowError
          ? errorMessage(rowError, "The record couldn't be deleted.")
          : "Only an administrator or the doctor who uploaded this document can delete it.",
      });
    }
    if (record.file_path) {
      const { error: fileError } = await supabase.storage.from("medical-documents").remove([record.file_path]);
      if (fileError) console.warn("Record deleted but file remained in Storage:", fileError.message);
    }
    setDeletingId(null);
    setRecords((current) => current.filter((r) => r.id !== record.id));
    setNotice({ tone: "success", text: "Document deleted." });
  }

  const waitingForLink = isDoctor && myDoctorLoaded && !myDoctor;

  return (
    <>
      <PageHeader
        title={isPatient ? "My medical records" : "Medical records"}
        description={
          isPatient
            ? "Reports and documents your care team has shared with you. Only you and your care team can see them."
            : isDoctor
              ? "Documents for patients who have booked with you."
              : "Upload and manage documents for any patient."
        }
      >
        <RefreshButton onClick={load} busy={loading} />
      </PageHeader>

      <Notice tone={notice.tone || "info"} onClose={() => setNotice({ tone: "", text: "" })}>
        {notice.text}
      </Notice>

      {waitingForLink && (
        <Notice tone="info">
          You can upload documents once an administrator has verified your doctor account.
        </Notice>
      )}

      {canUpload && !waitingForLink && (
        <form className="panel form-panel" onSubmit={upload}>
          <h2>Upload a document</h2>
          <div className="form-grid form-grid-3">
            <label className="field">
              <span>Patient</span>
              <select
                required
                value={form.patient_id}
                onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              >
                <option value="">{patients.length ? "Choose a patient" : "No patients available"}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name || "Unnamed patient"} ({patient.id.slice(0, 6)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input
                required
                maxLength="160"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Blood test results"
              />
            </label>
            <label className="field">
              <span>File (PDF or image, up to 10 MB)</span>
              <input
                ref={fileInputRef}
                required
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={uploading || patients.length === 0}>
              <Upload size={18} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload"}
            </button>
            {patients.length === 0 && !loading && (
              <span className="muted small">
                {isDoctor ? "Patients appear here after they book with you." : "No patient accounts exist yet."}
              </span>
            )}
          </div>
        </form>
      )}

      {canUpload && records.length > 0 && (
        <div className="list-toolbar">
          <label className="field field-inline">
            <span>Show</span>
            <select value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}>
              <option value="all">All patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || "Unnamed patient"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && records.length === 0 ? (
        <p className="muted loading-line">Loading records…</p>
      ) : shown.length === 0 ? (
        <EmptyState title="No documents yet">
          {isPatient
            ? "When your doctor or the hospital shares a report with you, it will appear here."
            : "Uploaded documents will appear here."}
        </EmptyState>
      ) : (
        <ul className="panel row-list">
          {shown.map((record) => (
            <li className="row record-row" key={record.id}>
              <span className="file-icon" aria-hidden="true">
                <FileText size={20} />
              </span>
              <div className="row-main">
                <strong>{record.title || record.file_name || "Document"}</strong>
                <span className="muted">
                  {[
                    canUpload && patientName(record.patient_id),
                    formatDate(record.record_date, { day: "numeric", month: "short", year: "numeric" }),
                    record.doctor?.full_name && `from ${record.doctor.full_name}`,
                    formatFileSize(record.file_size_bytes),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
                {record.diagnosis && <span className="row-note">Assessment: {record.diagnosis}</span>}
                {record.notes && <span className="row-note">{record.notes}</span>}
              </div>
              <div className="row-actions">
                {record.file_path && (
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => openDocument(record)}>
                    Open
                  </button>
                )}
                {canUpload && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-small"
                    disabled={deletingId === record.id}
                    onClick={() => remove(record)}
                  >
                    {deletingId === record.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Patient queue                                                       */
/* ------------------------------------------------------------------ */

function useAutoRefresh(callback, delay) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") saved.current({ quiet: true });
    }, delay);
    return () => clearInterval(id);
  }, [delay]);
}

function QueuePage(props) {
  return props.isPatient ? <PatientQueue /> : <StaffQueue {...props} />;
}

function PatientQueue() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    const { data, error: loadError } = await supabase.rpc("get_my_queue_status");
    if (loadError) setError(errorMessage(loadError, "Your queue status couldn't be loaded."));
    else {
      setError("");
      setEntries(data || []);
      setUpdatedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, QUEUE_REFRESH_MS);

  return (
    <>
      <PageHeader
        title="My queue token"
        description={
          updatedAt
            ? `Updates automatically. Last checked at ${updatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`
            : "Your place in today's queue."
        }
      >
        <RefreshButton onClick={() => load()} busy={loading} />
      </PageHeader>
      <Notice tone="error">{error}</Notice>

      {loading && entries.length === 0 ? (
        <p className="muted loading-line">Checking today's queue…</p>
      ) : entries.length === 0 ? (
        <EmptyState title="You're not in a queue today">
          When you arrive for a confirmed appointment, reception checks you in and your token appears here.
        </EmptyState>
      ) : (
        <div className="token-list">
          {entries.map((entry) => (
            <TokenSlip key={entry.queue_id} entry={entry} />
          ))}
        </div>
      )}
    </>
  );
}

function TokenSlip({ entry }) {
  const headline = {
    waiting:
      entry.patients_ahead === 0 ? "You're next. Please stay close to the consultation room." : "Please wait to be called.",
    next: "It's your turn. Please go to the consultation room now.",
    in_consultation: "You're with the doctor.",
    completed: "Your consultation is complete.",
    skipped: "You missed your call. Please speak to reception.",
  }[entry.status];

  return (
    <article className={`token-slip token-${entry.status}`}>
      <div className="token-slip-top">
        <div>
          <span className="token-label">Token</span>
          <strong className="token-number tabular">{entry.token_number}</strong>
        </div>
        <StatusBadge status={entry.status} labels={QUEUE_STATUS} />
      </div>
      <p className="token-headline">{headline}</p>
      <div className="token-tear" aria-hidden="true" />
      <dl className="token-facts">
        <div>
          <dt>Doctor</dt>
          <dd>
            {entry.doctor_name}
            {entry.specialty_name ? <span className="muted">, {entry.specialty_name}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Now serving</dt>
          <dd className="tabular">{entry.now_serving ? `Token ${entry.now_serving}` : "Not started"}</dd>
        </div>
        {["waiting", "next"].includes(entry.status) && (
          <>
            <div>
              <dt>Ahead of you</dt>
              <dd className="tabular">
                {entry.patients_ahead} {entry.patients_ahead === 1 ? "patient" : "patients"}
              </dd>
            </div>
            <div>
              <dt>Estimated wait</dt>
              <dd className="tabular">
                {entry.status === "next" || !entry.estimated_wait_minutes
                  ? "Now"
                  : `About ${entry.estimated_wait_minutes} min`}
              </dd>
            </div>
          </>
        )}
      </dl>
      {["waiting", "next"].includes(entry.status) && (
        <p className="token-foot">
          Estimate based on about {entry.minutes_per_patient} minutes per patient. Emergencies can change the order.
        </p>
      )}
    </article>
  );
}

function StaffQueue({ isAdmin, isDoctor, myDoctor, myDoctorLoaded }) {
  const [entries, setEntries] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [busyId, setBusyId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (isDoctor && (!myDoctorLoaded || !myDoctor)) {
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      const today = todayLocal();
      let queueQuery = supabase
        .from("patient_queue")
        .select(
          "id, appointment_id, patient_id, doctor_id, queue_date, token_number, status, checked_in_at, called_at, started_at, completed_at, appointment:appointments(start_time, end_time, reason, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name))"
        )
        .eq("queue_date", today)
        .order("token_number", { ascending: true });
      let arrivalQuery = supabase
        .from("appointments")
        .select("id, doctor_id, start_time, end_time, doctor:doctors(full_name), patient:profiles!appointments_patient_id_fkey(full_name)")
        .eq("appointment_date", today)
        .eq("status", "confirmed")
        .order("start_time", { ascending: true });
      if (isDoctor) {
        queueQuery = queueQuery.eq("doctor_id", myDoctor.id);
        arrivalQuery = arrivalQuery.eq("doctor_id", myDoctor.id);
      }
      const [queueResult, arrivalResult] = await Promise.all([queueQuery, arrivalQuery]);
      if (queueResult.error || arrivalResult.error) {
        setNotice({
          tone: "error",
          text: errorMessage(queueResult.error || arrivalResult.error, "Today's queue couldn't be loaded."),
        });
      } else {
        const queued = queueResult.data || [];
        setEntries(queued);
        setArrivals((arrivalResult.data || []).filter((a) => !queued.some((q) => sameId(q.appointment_id, a.id))));
        setUpdatedAt(new Date());
      }
      setLoading(false);
    },
    [isDoctor, myDoctor, myDoctorLoaded]
  );

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, QUEUE_REFRESH_MS);

  async function run(id, rpc, args, successText) {
    setBusyId(id);
    setNotice({ tone: "", text: "" });
    const { data, error } = await supabase.rpc(rpc, args);
    setBusyId(null);
    if (error) return setNotice({ tone: "error", text: errorMessage(error, "The queue couldn't be updated.") });
    setNotice({ tone: "success", text: successText(data) });
    load({ quiet: true });
  }

  // Group entries by doctor so each consultation room has its own board.
  const boards = useMemo(() => {
    const byDoctor = new Map();
    entries.forEach((entry) => {
      const key = String(entry.doctor_id);
      if (!byDoctor.has(key)) {
        byDoctor.set(key, {
          doctorId: entry.doctor_id,
          doctorName: entry.appointment?.doctor?.full_name || "Doctor",
          specialty: entry.appointment?.doctor?.specialties?.name,
          entries: [],
        });
      }
      byDoctor.get(key).entries.push(entry);
    });
    return [...byDoctor.values()].map((board) => {
      const done = board.entries.filter((e) => e.status === "completed" && e.started_at && e.completed_at);
      const average = done.length
        ? Math.round(
            done.reduce((sum, e) => sum + (new Date(e.completed_at) - new Date(e.started_at)) / 60000, 0) / done.length
          )
        : 10;
      return {
        ...board,
        minutesPerPatient: Math.min(60, Math.max(3, average)),
        serving: board.entries.find((e) => e.status === "in_consultation"),
        called: board.entries.find((e) => e.status === "next"),
        waitingCount: board.entries.filter((e) => ["waiting", "next"].includes(e.status)).length,
      };
    });
  }, [entries]);

  const order = { in_consultation: 0, next: 1, waiting: 2, skipped: 3, completed: 4 };

  if (isDoctor && myDoctorLoaded && !myDoctor) {
    return (
      <>
        <PageHeader title="Patient queue" />
        <Notice tone="info">
          Your queue appears once an administrator has verified your doctor account.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? "Today's queue" : "My queue"}
        description={
          updatedAt
            ? `${formatDate(todayLocal(), { weekday: "long", day: "numeric", month: "long" })}. Updates automatically, last at ${updatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`
            : "Check patients in, then call, see and finish each token."
        }
      >
        <RefreshButton onClick={() => load()} busy={loading} />
      </PageHeader>

      <Notice tone={notice.tone || "info"} onClose={() => setNotice({ tone: "", text: "" })}>
        {notice.text}
      </Notice>

      <section className="panel list-panel">
        <h2>
          Waiting to check in <span className="chip-count">{arrivals.length}</span>
        </h2>
        {arrivals.length === 0 ? (
          <p className="muted small">
            No confirmed appointments are waiting for check-in today. Pending requests must be confirmed first.
          </p>
        ) : (
          <ul className="row-list">
            {arrivals.map((appointment) => (
              <li className="row" key={appointment.id}>
                <div className="row-main">
                  <strong>{appointment.patient?.full_name || "Patient"}</strong>
                  <span className="muted">
                    <span className="tabular">{formatTime(appointment.start_time)}</span>
                    {isAdmin ? `, ${appointment.doctor?.full_name || "Doctor"}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={busyId === `in-${appointment.id}`}
                  onClick={() =>
                    run(
                      `in-${appointment.id}`,
                      "check_in_patient",
                      { p_appointment_id: appointment.id },
                      (data) => `${appointment.patient?.full_name || "Patient"} is token ${data?.token_number}.`
                    )
                  }
                >
                  Check in
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && entries.length === 0 ? (
        <p className="muted loading-line">Loading today's queue…</p>
      ) : boards.length === 0 ? (
        <EmptyState title="No one is in the queue yet">
          Checked-in patients appear here in token order.
        </EmptyState>
      ) : (
        boards.map((board) => {
          const sorted = [...board.entries].sort(
            (a, b) => order[a.status] - order[b.status] || a.token_number - b.token_number
          );
          return (
            <section className="panel queue-board" key={board.doctorId}>
              <div className="queue-board-head">
                <div>
                  <h2>{board.doctorName}</h2>
                  {board.specialty && <span className="muted">{board.specialty}</span>}
                </div>
                <div className="now-serving" aria-live="polite">
                  <span>Now serving</span>
                  <strong className="tabular">{board.serving ? board.serving.token_number : "–"}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === `next-${board.doctorId}` || !board.entries.some((e) => e.status === "waiting")}
                  onClick={() =>
                    run(
                      `next-${board.doctorId}`,
                      "call_next_patient",
                      { p_doctor_id: board.doctorId },
                      (data) => `Token ${data?.token_number} called.`
                    )
                  }
                >
                  Call next
                </button>
              </div>
              <p className="muted small">
                {board.waitingCount} waiting, about {board.minutesPerPatient} min per patient
              </p>
              <ul className="row-list queue-rows">
                {sorted.map((entry) => {
                  const ahead = board.entries.filter(
                    (o) => ["waiting", "next"].includes(o.status) && o.token_number < entry.token_number
                  ).length;
                  const wait = (ahead + (board.serving ? 1 : 0)) * board.minutesPerPatient;
                  const busy = busyId === entry.id;
                  const act = (action, text) =>
                    run(entry.id, "update_queue_status", { p_queue_id: entry.id, p_action: action }, () => text);
                  const name = entry.appointment?.patient?.full_name || "Patient";
                  return (
                    <li className={`row queue-row queue-${entry.status}`} key={entry.id}>
                      <span className="queue-token tabular" aria-label={`Token ${entry.token_number}`}>
                        {entry.token_number}
                      </span>
                      <div className="row-main">
                        <strong>{name}</strong>
                        <span className="muted">
                          Booked {formatTime(entry.appointment?.start_time)}
                          {entry.status === "waiting" && (wait > 0 ? `, wait about ${wait} min` : ", next in line")}
                        </span>
                      </div>
                      <StatusBadge status={entry.status} labels={QUEUE_STATUS} />
                      <div className="row-actions">
                        {entry.status === "waiting" && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={busy}
                            onClick={() => act("call", `Token ${entry.token_number} called.`)}
                          >
                            Call
                          </button>
                        )}
                        {["waiting", "next"].includes(entry.status) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={busy || Boolean(board.serving)}
                            title={board.serving ? `Finish token ${board.serving.token_number} first` : undefined}
                            onClick={() => act("start", `${name} is with the doctor.`)}
                          >
                            Start
                          </button>
                        )}
                        {entry.status === "in_consultation" && (
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={busy}
                            onClick={() => act("complete", `Token ${entry.token_number} finished.`)}
                          >
                            Finish
                          </button>
                        )}
                        {["waiting", "next"].includes(entry.status) && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={busy}
                            onClick={() => act("skip", `Token ${entry.token_number} skipped.`)}
                          >
                            Skip
                          </button>
                        )}
                        {entry.status === "skipped" && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={busy}
                            onClick={() => act("requeue", `Token ${entry.token_number} is back in the queue.`)}
                          >
                            Return to queue
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
