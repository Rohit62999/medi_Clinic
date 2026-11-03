import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { errorMessage, readPageFromHash } from "../../utils/helpers";
import { Notice } from "../common";
import { Header, ProfileModal } from "../layout";
import { HomePage } from "../home/HomePage";
import { DirectoryPage } from "../directory";
import { AppointmentsPage } from "../appointments";
import { RecordsPage } from "../records";
import { QueuePage } from "../queue";

export function Dashboard({ session, profile }) {
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
          .select(
            "id, full_name, qualifications, experience_years, bio, image_url, is_active, specialty_id, user_id, specialties(id, name)"
          )
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

