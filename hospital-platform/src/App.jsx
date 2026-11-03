import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { BrandMark } from "./components/common";
import { AuthScreen } from "./components/auth/AuthScreen";
import { Dashboard } from "./components/dashboard/Dashboard";
import "./App.css";

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
