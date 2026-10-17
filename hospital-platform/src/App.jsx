
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { supabase } from "./supabase";
import "./App.css";

const WEEKDAYS = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
const toMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Restore the user's session and listen for authentication changes.
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error("Session error:", error.message);
      }

      setSession(data?.session ?? null);
      setCheckingSession(false);
    }

    restoreSession();

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

  // Load only the signed-in user's profile.
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setProfileError("");
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError("");
      setProfile(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Profile error:", error.message);
        setProfileError(
          "We could not load your profile. Check the profiles table and its RLS policies."
        );
      } else if (!data) {
        setProfileError(
          "Your account exists, but its profile is missing. Ask the hospital administrator to check the database setup."
        );
      } else {
        setProfile(data);
      }

      setProfileLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  if (checkingSession) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">H+</div>
        <p>Loading your hospital portal...</p>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (profileLoading) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">H+</div>
        <p>Preparing your secure workspace...</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <main className="loading-screen">
        <section className="error-card">
          <div className="brand-icon">H+</div>
          <h1>Profile setup required</h1>
          <p>{profileError || "Your profile is not available."}</p>
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          <button
            className="text-button"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return <Dashboard session={session} profile={profile} />;
}

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
        if (fullName.trim().length < 2) {
          throw new Error("Please enter your full name.");
        }

        if (password.length < 8) {
          throw new Error("Use a password with at least 8 characters.");
        }

        const { data, error: authError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                requested_role: signupRole,
              },
            },
          });

        if (authError) throw authError;

        if (data.session) {
          setMessage(signupRole === "doctor"
            ? "Account created. Your doctor access request is pending administrator approval. Until approved, you will only have patient access."
            : "Your patient account has been created successfully.");
        } else {
          setMessage(
            signupRole === "doctor"
              ? "Account created. Check your email to verify your address. Doctor access requires administrator approval; until approved, your account remains a patient account."
              : "Account created. Check your email to verify your address before signing in."
          );
          setMode("login");
        }
      } else if (mode === "login") {
        const { error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (authError) throw authError;
      } else if (mode === "reset") {
        const { error: authError } =
          await supabase.auth.resetPasswordForEmail(
            email.trim(),
            {
              redirectTo: window.location.origin,
            }
          );

        if (authError) throw authError;

        setMessage(
          "If an account exists for this email, password-reset instructions will be sent."
        );
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="brand-lockup">
          <div className="brand-icon">H+</div>
          <div>
            <strong>CarePoint</strong>
            <span>Hospital & Health</span>
          </div>
        </div>

        <div className="brand-message">
          <span className="eyebrow">YOUR HEALTH, OUR PRIORITY</span>
          <h1>Healthcare made simpler.</h1>
          <p>
            Find the right specialist, manage appointments, and
            access your hospital services in one secure place.
          </p>

          <div className="brand-features">
            <div><span>✓</span> Specialist-led care</div>
            <div><span>✓</span> Secure patient access</div>
            <div><span>✓</span> Connected healthcare services</div>
          </div>
        </div>

        <p className="brand-footer">
          A better experience for every patient.
        </p>
      </section>

      <section className="auth-form-panel">
        <div className="mobile-brand">
          <div className="brand-icon">H+</div>
          <strong>CarePoint</strong>
        </div>

        <div className="auth-card">
          <span className="eyebrow">
            {mode === "signup" ? "GET STARTED" : "WELCOME TO CAREPOINT"}
          </span>

          <h2>
            {mode === "login"
              ? "Sign in to your account"
              : mode === "signup"
                ? "Create your account"
                : "Reset your password"}
          </h2>

          <p className="muted">
            {mode === "login"
              ? "Enter your details to continue to your portal."
              : mode === "signup"
                ? "Create an account to access hospital services."
                : "Enter your email to receive password-reset instructions."}
          </p>

          {error && (
            <div className="notice error-notice" role="alert">
              {error}
            </div>
          )}

          {message && (
            <div className="notice success-notice" role="status">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label className="field">
                Full name
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>
            )}

            {mode === "signup" && (
              <label className="field">
                Account type
                <select value={signupRole} onChange={(e) => setSignupRole(e.target.value)}>
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor — request verified access</option>
                </select>
                {signupRole === "doctor" && (
                  <span className="form-hint">Doctor access is not activated automatically. A hospital administrator must verify and link your doctor profile.</span>
                )}
              </label>
            )}

            <label className="field">
              Email address
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
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                />
              </label>
            )}

            {mode === "login" && (
              <div className="form-options">
                <span>Secure sign-in</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => changeMode("reset")}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Please wait..."
                : mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset instructions"}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to CarePoint?
                <button
                  className="text-button"
                  onClick={() => changeMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Remember your account?
                <button
                  className="text-button"
                  onClick={() => changeMode("login")}
                >
                  Back to sign in
                </button>
              </>
            )}
          </div>

          <p className="privacy-note">
            Your account and health information should only be
            accessible to authorized users.
          </p>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ session, profile }) {
  const role = profile.role;
  const displayName =
    profile.full_name ||
    session.user.user_metadata?.full_name ||
    session.user.email;

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [page, setPage] = useState("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [specialties, setSpecialties] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [doctorForm, setDoctorForm] = useState({
    full_name: "",
    specialty_id: "",
    qualifications: "",
    experience_years: "0",
    bio: "",
  });
  const [showSpecialtyForm, setShowSpecialtyForm] = useState(false);
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [specialtyForm, setSpecialtyForm] = useState({
    name: "",
    description: "",
  });
  const [appointments, setAppointments] = useState([]);
  const [queueEntries, setQueueEntries] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [queueBusyId, setQueueBusyId] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [loadingMedicalRecords, setLoadingMedicalRecords] = useState(false);
  const [medicalRecordsError, setMedicalRecordsError] = useState("");
  const [medicalRecordPatients, setMedicalRecordPatients] = useState([]);
  const [loadingRecordPatients, setLoadingRecordPatients] = useState(false);
  const [uploadingMedicalRecord, setUploadingMedicalRecord] = useState(false);
  const [medicalUploadMessage, setMedicalUploadMessage] = useState("");
  const [medicalUploadError, setMedicalUploadError] = useState("");
  const [medicalUploadForm, setMedicalUploadForm] = useState({ patient_id: "", title: "", file: null });
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");
  const [appointmentMessage, setAppointmentMessage] = useState("");
  const [doctorHours, setDoctorHours] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedScheduleDoctor, setSelectedScheduleDoctor] = useState(null);
  const [scheduleRows, setScheduleRows] = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    appointment_date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });

  const isAdmin = role === "admin";
  const isDoctor = role === "doctor";
  const canUploadMedicalDocuments = role === "admin" || role === "doctor";

  // Give each in-app section a browser-history entry so Back/Forward moves
  // between CarePoint sections naturally instead of showing a toast or dialog.
  const navigateToPage = (nextPage) => {
    if (nextPage === page) return;
    window.history.pushState({ carePointPage: nextPage }, "", window.location.href);
    setPage(nextPage);
  };

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), carePointPage: "home" }, "", window.location.href);
    const handlePopState = (event) => {
      const previousPage = event.state?.carePointPage;
      if (previousPage) setPage(previousPage);
      else setPage("home");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function loadDirectory() {
    setLoadingDirectory(true);
    setDirectoryError("");

    try {
      const [specialtyResult, doctorResult, hoursResult] = await Promise.all([
        supabase
          .from("specialties")
          .select("id, name, description, is_active")
          .order("name"),
        supabase
          .from("doctors")
          .select(
            "id, full_name, qualifications, experience_years, bio, image_url, is_active, specialty_id, specialties(id, name)"
          )
          .order("full_name"),
        supabase.from("doctor_schedules")
          .select("id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active"),
      ]);

      if (specialtyResult.error) throw specialtyResult.error;
      if (doctorResult.error) throw doctorResult.error;
      if (hoursResult.error) throw hoursResult.error;

      setSpecialties(specialtyResult.data || []);
      setDoctors(doctorResult.data || []);
      setDoctorHours(hoursResult.data || []);
    } catch (error) {
      setDirectoryError(
        error.message ||
          "Could not load the directory. Check your database tables and Supabase permissions."
      );
    } finally {
      setLoadingDirectory(false);
    }
  }

  useEffect(() => {
    if (page === "directory") loadDirectory();
    if (page === "appointments") loadAppointments();
    if (page === "records") loadMedicalRecords();
    if (page === "queue") { loadQueue(); if (isAdmin) loadAppointments(); }
  }, [page]);

  async function loadMedicalRecords() {
    setMedicalRecords([]);
    setMedicalRecordsError("");
    setMedicalUploadMessage("");
    if (canUploadMedicalDocuments) {
      setLoadingRecordPatients(true);
      const { data: patientData, error: patientError } = await supabase.rpc("get_medical_record_patients");
      if (patientError) {
        console.error("Medical record patient list error:", patientError);
        setMedicalRecordsError("Could not load the authorized patient list. Run the medical document upload migration and verify the uploader role.");
      } else {
        setMedicalRecordPatients(patientData || []);
      }
      setLoadingRecordPatients(false);
    }

    setLoadingMedicalRecords(true);
    try {
      const { data, error } = await supabase
        .from("medical_records")
        .select("id, patient_id, record_date, title, diagnosis, notes, file_path, file_name, mime_type, file_size_bytes, uploaded_by, doctor:doctors(full_name, specialties(name))")
        .order("record_date", { ascending: false });
      if (error) throw error;
      setMedicalRecords(data || []);
    } catch (error) {
      console.error("Medical records error:", error);
      setMedicalRecordsError("Medical records could not be loaded. Confirm the medical document migration and Supabase policies have been installed.");
    } finally {
      setLoadingMedicalRecords(false);
    }
  }

  async function uploadMedicalDocument(event) {
    event.preventDefault();
    setMedicalUploadError("");
    setMedicalUploadMessage("");
    const file = medicalUploadForm.file;
    if (!canUploadMedicalDocuments) {
      setMedicalUploadError("Only authorized admins and doctor accounts can upload medical documents.");
      return;
    }
    if (!medicalUploadForm.patient_id || !file || !medicalUploadForm.title.trim()) {
      setMedicalUploadError("Select a patient, enter a document title, and choose a PDF or image.");
      return;
    }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const allowedExtensions = /\.(pdf|jpe?g|png|webp)$/i;
    if (!allowedTypes.includes(file.type) || !allowedExtensions.test(file.name)) {
      setMedicalUploadError("Allowed formats are PDF, JPG, PNG, and WEBP images.");
      return;
    }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMedicalUploadError("The maximum file size is 10 MB.");
      return;
    }

    setUploadingMedicalRecord(true);
    let objectPath = "";
    try {
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100);
      objectPath = `${medicalUploadForm.patient_id}/${crypto.randomUUID()}-${safeName}`;
      const { error: storageError } = await supabase.storage
        .from("medical-documents")
        .upload(objectPath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (storageError) throw storageError;

      const { error: recordError } = await supabase.from("medical_records").insert({
        patient_id: medicalUploadForm.patient_id,
        title: medicalUploadForm.title.trim(),
        record_date: todayLocal(),
        file_path: objectPath,
        file_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        uploaded_by: session.user.id,
      });
      if (recordError) {
        await supabase.storage.from("medical-documents").remove([objectPath]);
        throw recordError;
      }
      setMedicalUploadForm({ patient_id: "", title: "", file: null });
      const input = document.getElementById("medical-document-file");
      if (input) input.value = "";
      setMedicalUploadMessage("Document uploaded securely.");
      await loadMedicalRecords();
    } catch (error) {
      console.error("Medical document upload error:", error);
      setMedicalUploadError(error.message || "Upload failed. Check storage policies and your authorization.");
    } finally {
      setUploadingMedicalRecord(false);
    }
  }

  async function openMedicalDocument(record) {
    setMedicalUploadError("");
    const { data, error } = await supabase.storage
      .from("medical-documents")
      .createSignedUrl(record.file_path, 60);
    if (error) {
      setMedicalUploadError("You do not have permission to access this document, or the link could not be created.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function loadQueue() {
    setLoadingQueue(true);
    setQueueError("");
    setQueueMessage("");
    try {
      const { data, error } = await supabase
        .from("patient_queue")
        .select("id, appointment_id, patient_id, doctor_id, queue_date, token_number, status, checked_in_at, started_at, completed_at, appointment:appointments(appointment_date, start_time, end_time, reason, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name))")
        .eq("queue_date", todayLocal())
        .order("doctor_id", { ascending: true })
        .order("token_number", { ascending: true });
      if (error) throw error;
      setQueueEntries(data || []);
    } catch (error) {
      setQueueError(error.message || "Could not load the queue. Check the patient_queue table and its RLS policies.");
      setQueueEntries([]);
    } finally {
      setLoadingQueue(false);
    }
  }

  async function checkInPatient(appointment) {
    setQueueBusyId(appointment.id);
    setQueueError("");
    setQueueMessage("");
    try {
      const { data, error } = await supabase.rpc("check_in_patient", { p_appointment_id: appointment.id });
      if (error) throw error;
      setQueueMessage(`Patient checked in successfully. Token #${data.token_number}.`);
      await Promise.all([loadQueue(), loadAppointments()]);
    } catch (error) {
      setQueueError(error.message || "Could not check in this patient.");
    } finally {
      setQueueBusyId(null);
    }
  }

  async function updateQueueStatus(entry, status) {
    setQueueBusyId(entry.id);
    setQueueError("");
    setQueueMessage("");
    const updates = { status };
    if (status === "in_consultation") updates.started_at = new Date().toISOString();
    if (status === "completed") updates.completed_at = new Date().toISOString();
    try {
      const { error } = await supabase.from("patient_queue").update(updates).eq("id", entry.id);
      if (error) throw error;
      setQueueMessage(`Queue updated: ${status.replaceAll("_", " ")}.`);
      await loadQueue();
    } catch (error) {
      setQueueError(error.message || "Could not update queue status.");
    } finally {
      setQueueBusyId(null);
    }
  }

  async function loadAppointments() {
    setLoadingAppointments(true);
    setAppointmentError("");
    let query = supabase
      .from("appointments")
      .select("id, patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, created_at, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name)")
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (isDoctor) {
      // The doctor account must be explicitly linked to a doctors row by an admin.
      const { data: linkedDoctor, error: linkedDoctorError } = await supabase
        .from("doctors").select("id").eq("user_id", session.user.id).maybeSingle();
      if (linkedDoctorError) throw linkedDoctorError;
      if (!linkedDoctor) {
        setAppointments([]);
        setAppointmentError("Your doctor account is awaiting administrator verification and profile linking.");
        setLoadingAppointments(false);
        return;
      }
      query = query.eq("doctor_id", linkedDoctor.id);
    } else if (!isAdmin) {
      query = query.eq("patient_id", session.user.id);
    }
    const { data, error } = await query;
    if (error) {
      setAppointmentError(error.message);
      setAppointments([]);
    } else {
      setAppointments(data || []);
    }
    setLoadingAppointments(false);
  }

  function openBooking(doctor) {
    setBookingDoctor(doctor);
    setBookingForm({ appointment_date: "", start_time: "", end_time: "", reason: "" });
    setAvailableSlots([]);
    setAppointmentError("");
    setAppointmentMessage("");
    navigateToPage("appointments");
  }

  async function loadAvailableSlots(doctor, date) {
    setAvailableSlots([]);
    setBookingForm((current) => ({ ...current, start_time: "", end_time: "" }));
    if (!doctor || !date) return;
    setLoadingSlots(true);
    setAppointmentError("");
    try {
      const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
      const schedule = doctorHours.find((row) =>
        String(row.doctor_id) === String(doctor.id) && Number(row.day_of_week) === dayOfWeek && row.is_active !== false
      );
      if (!schedule) {
        setAvailableSlots([]);
        return;
      }
      // This RPC returns only occupied times, without exposing other patients' records.
      const { data, error } = await supabase.rpc("get_doctor_booked_slots", {
        p_doctor_id: doctor.id,
        p_appointment_date: date,
      });
      if (error) throw error;
      const busy = data || [];
      const opening = toMinutes(schedule.start_time);
      const closing = toMinutes(schedule.end_time);
      const duration = Number(schedule.slot_duration_minutes);
      const now = new Date();
      const selectedIsToday = date === todayLocal();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const slots = [];
      for (let start = opening; start + duration <= closing; start += duration) {
        const end = start + duration;
        const overlaps = busy.some((appointment) =>
          start < toMinutes(appointment.end_time) && end > toMinutes(appointment.start_time)
        );
        if (!overlaps && (!selectedIsToday || start > currentMinutes)) {
          slots.push({ start_time: toTime(start), end_time: toTime(end) });
        }
      }
      setAvailableSlots(slots);
    } catch (error) {
      setAppointmentError(error.message || "Could not load available appointment slots.");
    } finally {
      setLoadingSlots(false);
    }
  }

  function editDoctorSchedule(doctor) {
    setSelectedScheduleDoctor(doctor);
    setScheduleRows(WEEKDAYS.map((day) => {
      const existing = doctorHours.find((row) =>
        String(row.doctor_id) === String(doctor.id) && Number(row.day_of_week) === day.value && row.is_active !== false
      );
      return {
        day_of_week: day.value,
        enabled: Boolean(existing),
        opening_time: existing?.start_time?.slice(0, 5) || "09:00",
        closing_time: existing?.end_time?.slice(0, 5) || "17:00",
        appointment_duration_minutes: String(existing?.slot_duration_minutes || 30),
      };
    }));
    setDirectoryError("");
    setSuccessMessage("");
  }

  async function saveDoctorSchedule(event) {
    event.preventDefault();
    if (!selectedScheduleDoctor) return;
    const enabledRows = scheduleRows.filter((row) => row.enabled);
    for (const row of enabledRows) {
      if (toMinutes(row.opening_time) >= toMinutes(row.closing_time)) {
        setDirectoryError(`${WEEKDAYS[row.day_of_week].label}: closing time must be after opening time.`);
        return;
      }
      if (!Number.isInteger(Number(row.appointment_duration_minutes)) ||
          Number(row.appointment_duration_minutes) < 5 ||
          Number(row.appointment_duration_minutes) > 240) {
        setDirectoryError("Appointment duration must be between 5 and 240 minutes.");
        return;
      }
    }
    setSavingSchedule(true);
    setDirectoryError("");
    setSuccessMessage("");
    try {
      const payload = enabledRows.map((row) => ({
        doctor_id: selectedScheduleDoctor.id,
        day_of_week: row.day_of_week,
        start_time: row.opening_time,
        end_time: row.closing_time,
        slot_duration_minutes: Number(row.appointment_duration_minutes),
        is_active: true,
      }));
      // Update existing weekday rows and insert missing ones. Disabled days are
      // marked inactive rather than deleting records, so a failed save is safer.
      for (const row of scheduleRows) {
        const existing = doctorHours.find((item) =>
          String(item.doctor_id) === String(selectedScheduleDoctor.id) &&
          Number(item.day_of_week) === row.day_of_week
        );
        if (existing) {
          const update = row.enabled
            ? { start_time: row.opening_time, end_time: row.closing_time, slot_duration_minutes: Number(row.appointment_duration_minutes), is_active: true }
            : { is_active: false };
          const { error } = await supabase.from("doctor_schedules").update(update).eq("id", existing.id);
          if (error) throw error;
        } else if (row.enabled) {
          const { error } = await supabase.from("doctor_schedules").insert({
            doctor_id: selectedScheduleDoctor.id, day_of_week: row.day_of_week,
            start_time: row.opening_time, end_time: row.closing_time,
            slot_duration_minutes: Number(row.appointment_duration_minutes), is_active: true,
          });
          if (error) throw error;
        }
      }
      setSelectedScheduleDoctor(null);
      setSuccessMessage(`Working hours saved for ${selectedScheduleDoctor.full_name}.`);
      await loadDirectory();
    } catch (error) {
      setDirectoryError(error.message || "Could not save the doctor's working hours.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function bookAppointment(event) {
    event.preventDefault();
    if (!bookingDoctor || !bookingForm.appointment_date || !bookingForm.start_time || !bookingForm.end_time) {
      setAppointmentError("Choose an available appointment slot before submitting.");
      return;
    }
    const dayOfWeek = new Date(`${bookingForm.appointment_date}T12:00:00`).getDay();
    const schedule = doctorHours.find((row) =>
      String(row.doctor_id) === String(bookingDoctor.id) && Number(row.day_of_week) === dayOfWeek
    );
    const duration = Number(schedule?.slot_duration_minutes || 0);
    const startMinutes = toMinutes(bookingForm.start_time);
    const endMinutes = toMinutes(bookingForm.end_time);
    if (!schedule || startMinutes < toMinutes(schedule.start_time) ||
        endMinutes > toMinutes(schedule.end_time) || endMinutes - startMinutes !== duration) {
      setAppointmentError("This time is outside the doctor's working hours or does not match the appointment duration. Please select an available slot.");
      await loadAvailableSlots(bookingDoctor, bookingForm.appointment_date);
      return;
    }
    setSavingAppointment(true);
    setAppointmentError("");
    setAppointmentMessage("");
    const { error } = await supabase.from("appointments").insert({
      patient_id: session.user.id,
      doctor_id: bookingDoctor.id,
      appointment_date: bookingForm.appointment_date,
      start_time: bookingForm.start_time,
      end_time: bookingForm.end_time,
      reason: bookingForm.reason.trim() || null,
      status: "pending",
    });
    setSavingAppointment(false);
    if (error) {
      setAppointmentError(
        error.message.includes("doctor_no_overlapping_appointments") ||
        error.code === "23P01" || error.code === "23505"
          ? "That time was just booked by someone else. Please choose another available slot."
          : error.message
      );
      await loadAvailableSlots(bookingDoctor, bookingForm.appointment_date);
      return;
    }
    const bookedDate = bookingForm.appointment_date;
    setBookingDoctor(null);
    setAppointmentMessage("Appointment request submitted. Its status is pending until the hospital confirms it.");
    await loadAppointments();
    if (bookedDate) await loadAvailableSlots(bookingDoctor, bookedDate);
  }

  async function updateAppointmentStatus(appointment, status) {
    setAppointmentError("");
    setAppointmentMessage("");
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appointment.id);
    if (error) {
      setAppointmentError(error.message);
      return;
    }
    setAppointmentMessage(`Appointment #${appointment.id} marked ${status}.`);
    await loadAppointments();
  }

  async function handleSignOut() {
    const shouldSignOut = window.confirm("Are you sure you want to sign out of CarePoint?");
    if (!shouldSignOut) return;

    setSigningOut(true);
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      setSigningOut(false);
    }
  }

  async function addSpecialty(event) {
    event.preventDefault();
    setSavingSpecialty(true);
    setDirectoryError("");
    setSuccessMessage("");

    const { error } = await supabase.from("specialties").insert({
      name: specialtyForm.name.trim(),
      description: specialtyForm.description.trim(),
      is_active: true,
    });

    setSavingSpecialty(false);
    if (error) {
      setDirectoryError(error.message);
      return;
    }

    setSpecialtyForm({ name: "", description: "" });
    setShowSpecialtyForm(false);
    setSuccessMessage("Specialty added.");
    await loadDirectory();
  }

  async function addDoctor(event) {
    event.preventDefault();
    setSavingDoctor(true);
    setDirectoryError("");
    setSuccessMessage("");

    const payload = {
      full_name: doctorForm.full_name.trim(),
      specialty_id: doctorForm.specialty_id
        ? Number(doctorForm.specialty_id)
        : null,
      qualifications: doctorForm.qualifications.trim(),
      experience_years: Number(doctorForm.experience_years || 0),
      bio: doctorForm.bio.trim(),
      is_active: true,
    };

    const { error } = await supabase.from("doctors").insert(payload);
    setSavingDoctor(false);

    if (error) {
      setDirectoryError(error.message);
      return;
    }

    setDoctorForm({
      full_name: "",
      specialty_id: "",
      qualifications: "",
      experience_years: "0",
      bio: "",
    });
    setShowDoctorForm(false);
    setSuccessMessage("Doctor added to the directory.");
    await loadDirectory();
  }

  async function toggleDoctor(doctor) {
    setDirectoryError("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("doctors")
      .update({ is_active: !doctor.is_active })
      .eq("id", doctor.id);

    if (error) {
      setDirectoryError(error.message);
      return;
    }

    setSuccessMessage(
      `${doctor.full_name} is now ${doctor.is_active ? "inactive" : "active"}.`
    );
    await loadDirectory();
  }

  async function toggleSpecialty(specialty) {
    setDirectoryError("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("specialties")
      .update({ is_active: !specialty.is_active })
      .eq("id", specialty.id);

    if (error) {
      setDirectoryError(error.message);
      return;
    }

    setSuccessMessage(
      `${specialty.name} is now ${
        specialty.is_active ? "inactive" : "active"
      }.`
    );
    await loadDirectory();
  }

  const roleVisibleDoctors = isAdmin
    ? doctors
    : doctors.filter((doctor) => doctor.is_active);
  const visibleDoctors = roleVisibleDoctors.filter((doctor) => {
    const query = doctorSearch.trim().toLowerCase();
    if (!query) return true;
    return [doctor.full_name, doctor.qualifications, doctor.bio, doctor.specialties?.name]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
  const visibleSpecialties = isAdmin
    ? specialties
    : specialties.filter((specialty) => specialty.is_active);

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-icon">H+</div>
          <div>
            <strong>CarePoint</strong>
            <span>Hospital &amp; Health</span>
          </div>
        </div>

        <div className="user-menu">
          <div className="profile-menu-wrap">
            <button
              type="button"
              className="profile-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <span className="avatar">{displayName.trim().charAt(0).toUpperCase()}</span>
              <span className="user-info">
                <strong>{displayName}</strong>
                <span>{role}</span>
              </span>
              <span className="profile-menu-chevron" aria-hidden="true"><ChevronDown size={16} strokeWidth={2} /></span>
            </button>
            {profileMenuOpen && (
              <>
                <button className="profile-menu-dismiss" aria-label="Close profile menu" onClick={() => setProfileMenuOpen(false)} />
                <div className="profile-dropdown" role="menu">
                  <div className="profile-dropdown-heading">
                    <span className="avatar">{displayName.trim().charAt(0).toUpperCase()}</span>
                    <div>
                      <strong>{displayName}</strong>
                      <span>{session.user.email}</span>
                    </div>
                  </div>
                  <button type="button" role="menuitem" onClick={() => { setShowMyProfile(true); setProfileMenuOpen(false); }}>
                    <span aria-hidden="true">◉</span> View my profile
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); handleSignOut(); }} disabled={signingOut}>
                    <span aria-hidden="true">⇄</span> Switch account
                  </button>
                  <div className="profile-dropdown-footnote">Switching accounts signs you out securely first.</div>
                </div>
              </>
            )}
          </div>
          <button
            className="secondary-button topbar-signout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>

        {showMyProfile && (
          <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMyProfile(false); }}>
            <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="my-profile-title">
              <button className="profile-modal-close" type="button" aria-label="Close profile" onClick={() => setShowMyProfile(false)}>×</button>
              <div className="profile-modal-identity">
                <span className="profile-modal-avatar">{displayName.trim().charAt(0).toUpperCase()}</span>
                <span className="eyebrow">CAREPOINT ACCOUNT</span>
                <h2 id="my-profile-title">My profile</h2>
                <p>View the details associated with your signed-in account.</p>
              </div>
              <dl className="profile-detail-list">
                <div><dt>Full name</dt><dd>{profile.full_name || session.user.user_metadata?.full_name || "Not provided"}</dd></div>
                <div><dt>Email address</dt><dd>{session.user.email || "Not available"}</dd></div>
                <div><dt>Account role</dt><dd><span className="role-pill">{role}</span></dd></div>
                <div><dt>Account ID</dt><dd className="profile-account-id">{session.user.id}</dd></div>
                <div><dt>Email verification</dt><dd>{session.user.email_confirmed_at ? "Verified" : "Not verified"}</dd></div>
              </dl>
              <div className="profile-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowMyProfile(false)}>Close</button>
                <button className="primary-button" type="button" disabled={signingOut} onClick={handleSignOut}>{signingOut ? "Signing out..." : "Switch account"}</button>
              </div>
            </section>
          </div>
        )}
      </header>

      <section className="dashboard-content">
        <div className="welcome-banner">
          <div>
            <span className="eyebrow">CAREPOINT PORTAL</span>
            <h1>{isAdmin ? "Hospital operations overview." : isDoctor ? "Your clinical workspace." : "Your healthcare, in one place."}</h1>
            <p>
              {isAdmin
                ? "Manage hospital departments and the doctor directory."
                : isDoctor
                  ? "Manage your own appointments and view your assigned patients."
                  : "Explore specialties and find the right doctor for your care."}
            </p>
          </div>
          <div className="welcome-symbol">+</div>
        </div>

        {signOutError && <div className="notice error-notice" role="alert">{signOutError}</div>}

        <div className="mobile-nav-bar">
          <span className="mobile-nav-current">{({ home: "Overview", directory: "Doctors & specialties", appointments: "Appointments", records: "Medical records", queue: "Patient queue" })[page] || "Menu"}</span>
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="carepoint-main-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
        <nav id="carepoint-main-navigation" className={`directory-nav${mobileNavOpen ? " mobile-nav-open" : ""}`} aria-label="Main navigation">
          <button
            className={page === "home" ? "directory-nav-button active" : "directory-nav-button"}
            onClick={() => { navigateToPage("home"); setMobileNavOpen(false); }}
          >Overview</button>
          <button
            className={page === "directory" ? "directory-nav-button active" : "directory-nav-button"}
            onClick={() => { navigateToPage("directory"); setMobileNavOpen(false); }}
          >Doctors &amp; specialties</button>
          <button
            className={page === "appointments" ? "directory-nav-button active" : "directory-nav-button"}
            onClick={() => { setBookingDoctor(null); navigateToPage("appointments"); setMobileNavOpen(false); }}
          >Appointments</button>
          <button
            className={page === "records" ? "directory-nav-button active" : "directory-nav-button"}
            onClick={() => { navigateToPage("records"); setMobileNavOpen(false); }}
          >Medical records</button>
          <button
            className={page === "queue" ? "directory-nav-button active" : "directory-nav-button"}
            onClick={() => { navigateToPage("queue"); setMobileNavOpen(false); }}
          >Patient queue</button>
        </nav>

        {page === "home" ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Your workspace</h2>
                <p>Choose an area to continue.</p>
              </div>
              <span className="role-pill">{role}</span>
            </div>
            <div className="feature-grid">
              <button className="feature-card feature-card-button" onClick={() => navigateToPage("directory")}>
                <div className="feature-number">01</div>
                <h3>Doctors &amp; departments</h3>
                <p>{isAdmin ? "Add doctors and manage specialties." : isDoctor ? "Browse the hospital directory; your appointments remain limited to your own profile." : "Browse active doctors and specialties."}</p>
                <span className="coming-soon">Open directory →</span>
              </button>
              <button className="feature-card feature-card-button" onClick={() => { setBookingDoctor(null); navigateToPage("appointments"); }}>
                <div className="feature-number">02</div>
                <h3>Appointments</h3>
                <p>{isAdmin ? "Review all requests and update appointment status." : isDoctor ? "View only appointments assigned to you and update their progress." : "Request a visit and review your appointment status."}</p>
                <span className="coming-soon">Open appointments →</span>
              </button>
              <button className="feature-card feature-card-button" onClick={() => navigateToPage("records")}>
                <div className="feature-number">03</div>
                <h3>Medical records</h3>
                <p>{isAdmin ? "Clinical records are restricted to protect patient privacy." : isDoctor ? "Review documents for patients assigned to your care, subject to access policies." : "Review your visit summaries and clinical notes."}</p>
                <span className="coming-soon">{isAdmin ? "Restricted area" : "Open medical records →"}</span>
              </button>
            </div>
          </>
        ) : page === "records" ? (
          <section className="doctor-directory">
            <div className="directory-heading">
              <div>
                <h2>{canUploadMedicalDocuments ? "Medical documents" : "My medical records"}</h2>
                <p>{canUploadMedicalDocuments ? "Upload patient documents using your authorized staff account. Access is enforced by Supabase policies." : "Private visit summaries and documents associated with your account."}</p>
              </div>
              <button className="secondary-button" onClick={loadMedicalRecords} disabled={loadingMedicalRecords}>{loadingMedicalRecords ? "Refreshing..." : "Refresh"}</button>
            </div>
            {canUploadMedicalDocuments && (
              <form className="directory-form medical-upload-form" onSubmit={uploadMedicalDocument}>
                <h3>Upload a medical document</h3>
                <p className="form-hint">PDF or image (JPG, PNG, WEBP), maximum 10 MB. Files are stored in a private bucket.</p>
                {medicalUploadError && <div className="notice error-notice" role="alert">{medicalUploadError}</div>}
                {medicalUploadMessage && <div className="notice success-notice" role="status">{medicalUploadMessage}</div>}
                <label className="field">Patient
                  <select required value={medicalUploadForm.patient_id} onChange={(e) => setMedicalUploadForm((f) => ({ ...f, patient_id: e.target.value }))}>
                    <option value="">{loadingRecordPatients ? "Loading patients..." : "Select a patient"}</option>
                    {medicalRecordPatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name || "Patient"} · {patient.id.slice(0, 8)}</option>)}
                  </select>
                </label>
                <label className="field">Document title
                  <input required maxLength="160" value={medicalUploadForm.title} onChange={(e) => setMedicalUploadForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Blood test results" />
                </label>
                <label className="field">Choose PDF or image
                  <input id="medical-document-file" required type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setMedicalUploadForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} />
                </label>
                <div className="directory-actions"><button className="primary-button" type="submit" disabled={uploadingMedicalRecord || loadingRecordPatients || medicalRecordPatients.length === 0}>{uploadingMedicalRecord ? "Uploading securely..." : "Upload document"}</button></div>
                {medicalRecordPatients.length === 0 && !loadingRecordPatients && <p className="form-hint">No patients were returned. Confirm the migration is installed and that this account has the admin or doctor role.</p>}
              </form>
            )}
            {medicalRecordsError && <div className="notice error-notice" role="alert">{medicalRecordsError}</div>}
            {loadingMedicalRecords ? (
              <p className="directory-empty-state">Loading medical records...</p>
            ) : medicalRecords.length === 0 ? (
              <div className="records-empty-state">
                <div className="records-empty-icon">+</div>
                <h3>No medical documents available</h3>
                <p>{canUploadMedicalDocuments ? "Uploaded documents will appear here when the database permissions allow your account to view them." : "When a document is securely attached to your account, it will appear here."}</p>
              </div>
            ) : (
              <div className="medical-record-list">
                {medicalRecords.map((record) => (
                  <article className="medical-record-card" key={record.id}>
                    <div className="medical-record-header">
                      <div><span className="appointment-reference">Medical record · {record.record_date}</span><h3>{record.title || "Clinical document"}</h3></div>
                      <span className="record-private-label">Private</span>
                    </div>
                    {record.file_name && <p className="medical-record-doctor">{record.file_name} · {record.file_size_bytes ? `${(record.file_size_bytes / (1024 * 1024)).toFixed(2)} MB` : "File"}</p>}
                    {record.diagnosis && <div className="medical-record-section"><strong>Diagnosis / assessment</strong><p>{record.diagnosis}</p></div>}
                    {record.notes && <div className="medical-record-section"><strong>Visit notes</strong><p>{record.notes}</p></div>}
                    {record.file_path && <div className="directory-actions"><button type="button" className="secondary-button" onClick={() => openMedicalDocument(record)}>Open document securely</button></div>}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : page === "queue" ? (
          <section className="doctor-directory queue-page">
            <div className="directory-heading">
              <div>
                <h2>Patient queue</h2>
                <p>{isAdmin ? "Check in today's confirmed appointments and monitor each doctor's queue." : isDoctor ? "Manage today's queue for your linked doctor profile." : "Track your token and estimated waiting time for today's visit."}</p>
              </div>
              <button className="secondary-button" onClick={loadQueue} disabled={loadingQueue}>{loadingQueue ? "Refreshing..." : "Refresh queue"}</button>
            </div>
            {queueError && <div className="notice error-notice" role="alert">{queueError}</div>}
            {queueMessage && <div className="notice success-notice" role="status">{queueMessage}</div>}
            {isAdmin && <div className="queue-checkin-panel">
              <h3>Check in a patient</h3>
              <p>Only confirmed appointments scheduled for today can be checked in.</p>
              {appointments.filter(a => a.appointment_date === todayLocal() && a.status === "confirmed" && !queueEntries.some(q => String(q.appointment_id) === String(a.id))).length === 0 ? <p className="form-hint">No eligible appointments found. Refresh Appointments first if you have just confirmed a booking.</p> : <div className="queue-checkin-list">
                {appointments.filter(a => a.appointment_date === todayLocal() && a.status === "confirmed" && !queueEntries.some(q => String(q.appointment_id) === String(a.id))).map(a => <article className="queue-checkin-row" key={a.id}>
                  <div><strong>{a.patient?.full_name || "Patient"}</strong><span>{a.doctor?.full_name || "Doctor"} · {String(a.start_time).slice(0,5)} · Appointment #{a.id}</span></div>
                  <button className="primary-button" disabled={queueBusyId === a.id} onClick={() => checkInPatient(a)}>{queueBusyId === a.id ? "Checking in..." : "Check in"}</button>
                </article>)}
              </div>}
            </div>}
            {loadingQueue ? <p className="directory-empty-state">Loading today's queue...</p> : queueEntries.length === 0 ? <div className="records-empty-state"><div className="records-empty-icon">+</div><h3>No patients in today's queue</h3><p>{isAdmin ? "Check in a confirmed appointment to create the first token." : isDoctor ? "Today's checked-in patients will appear here." : "When you are checked in for an appointment, your token will appear here."}</p></div> : <div className="queue-list">
              {queueEntries.filter(entry => isAdmin || (isDoctor ? true : String(entry.patient_id) === String(session.user.id))).map(entry => {
                const ahead = queueEntries.filter(other => String(other.doctor_id) === String(entry.doctor_id) && other.queue_date === entry.queue_date && other.token_number < entry.token_number && ["waiting", "next", "in_consultation"].includes(other.status)).length;
                const canSeeWholeQueue = isAdmin || isDoctor;
                const activeCount = queueEntries.filter(other => String(other.doctor_id) === String(entry.doctor_id) && ["waiting", "next", "in_consultation"].includes(other.status)).length;
                const estimate = ahead * 10;
                return <article className="queue-card" key={entry.id}>
                  <div className="queue-card-top"><div><span className="appointment-reference">{entry.appointment?.doctor?.full_name || "Doctor"} · {entry.queue_date}</span><h3>{entry.appointment?.patient?.full_name || (String(entry.patient_id) === String(session.user.id) ? "Your appointment" : "Patient")}</h3></div><span className={`queue-status queue-status-${entry.status}`}>{entry.status.replaceAll("_", " ")}</span></div>
                  <div className="queue-token-row"><div><span>Token</span><strong>#{entry.token_number}</strong></div><div><span>Patients ahead</span><strong>{entry.status === "completed" || entry.status === "skipped" ? "—" : canSeeWholeQueue ? ahead : "Live update"}</strong></div><div><span>Estimated wait</span><strong>{entry.status === "completed" ? "Completed" : entry.status === "in_consultation" ? "In progress" : canSeeWholeQueue ? `${estimate}–${estimate + 10} min` : "Ask reception"}</strong></div></div>
                  <p className="queue-hint">{canSeeWholeQueue ? "Estimate uses an approximate 10 minutes per patient and may change due to delays or urgent cases." : "Your queue details are private. Reception can provide a current waiting-time estimate."}</p>
                  {(isAdmin || isDoctor) && !["completed", "skipped"].includes(entry.status) && <div className="directory-actions queue-actions">
                    {entry.status === "waiting" && <button className="secondary-button" disabled={queueBusyId === entry.id} onClick={() => updateQueueStatus(entry, "next")}>Call next</button>}
                    {entry.status !== "in_consultation" && <button className="primary-button" disabled={queueBusyId === entry.id} onClick={() => updateQueueStatus(entry, "in_consultation")}>Start consultation</button>}
                    {entry.status !== "completed" && <button className="secondary-button" disabled={queueBusyId === entry.id} onClick={() => updateQueueStatus(entry, "completed")}>Mark completed</button>}
                    <button className="secondary-button" disabled={queueBusyId === entry.id} onClick={() => updateQueueStatus(entry, "skipped")}>Skip</button>
                  </div>}
                </article>;
              })}
            </div>}
          </section>
        ) : page === "appointments" ? (
          <section className="doctor-directory">
            <div className="directory-heading">
              <div>
                <h2>{bookingDoctor ? `Book with ${bookingDoctor.full_name}` : isAdmin ? "Appointment management" : "My appointments"}</h2>
                <p>{bookingDoctor ? "Choose a date and time for your appointment request." : isAdmin ? "Review patient requests and manage their status." : isDoctor ? "Only appointments assigned to your verified doctor profile are shown here." : "View your appointment requests and their current status."}</p>
              </div>
              <button className="secondary-button" onClick={loadAppointments} disabled={loadingAppointments}>{loadingAppointments ? "Refreshing..." : "Refresh"}</button>
            </div>
            {appointmentError && <div className="notice error-notice" role="alert">{appointmentError}</div>}
            {appointmentMessage && <div className="notice success-notice" role="status">{appointmentMessage}</div>}
            {bookingDoctor && !isAdmin && (
              <form className="directory-form" onSubmit={bookAppointment}>
                <h3>Appointment details</h3>
                <label className="field">Doctor<input value={bookingDoctor.full_name} readOnly /></label>
                <label className="field">Appointment date<input type="date" required min={todayLocal()} value={bookingForm.appointment_date} onChange={(e) => { const date = e.target.value; setBookingForm((current) => ({ ...current, appointment_date: date, start_time: "", end_time: "" })); loadAvailableSlots(bookingDoctor, date); }} /></label>
                <div className="available-slots-panel">
                  <strong>Available appointment slots</strong>
                  {!bookingForm.appointment_date ? <p className="form-hint">Choose a date to see available times.</p>
                    : loadingSlots ? <p className="form-hint">Checking availability...</p>
                    : availableSlots.length === 0 ? <p className="form-hint">No available slots for this date. The doctor may not work this day, or all slots may be booked.</p>
                    : <div className="slot-grid">{availableSlots.map((slot) => {
                      const selected = bookingForm.start_time === slot.start_time;
                      return <button key={slot.start_time} type="button" className={`slot-button${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => setBookingForm((current) => ({ ...current, start_time: slot.start_time, end_time: slot.end_time }))}>{slot.start_time} – {slot.end_time}</button>;
                    })}</div>}
                </div>
                <label className="field">Reason for visit (optional)<textarea rows="3" maxLength="500" value={bookingForm.reason} onChange={(e) => setBookingForm({ ...bookingForm, reason: e.target.value })} placeholder="Briefly describe what you need help with" /></label>
                <p className="form-hint">Slots follow the doctor's configured working hours and appointment duration. Pending and confirmed appointments are unavailable to other patients.</p>
                <div className="directory-actions"><button type="submit" className="primary-button" disabled={savingAppointment || loadingSlots || !bookingForm.appointment_date || !bookingForm.start_time || !bookingForm.end_time}>{savingAppointment ? "Submitting..." : "Submit appointment request"}</button><button type="button" className="secondary-button" onClick={() => { setBookingDoctor(null); navigateToPage("directory"); }}>Back to doctors</button></div>
              </form>
            )}
            {!bookingDoctor && (loadingAppointments ? <p className="directory-empty-state">Loading appointments...</p> : appointments.length === 0 ? <p className="directory-empty-state">No appointments found yet. {isAdmin ? "Patient requests will appear here." : isDoctor ? "Appointments assigned to your linked doctor profile will appear here." : "Open Doctors & specialties to request your first appointment."}</p> : (
              <div className="appointment-list">
                {appointments.map((appointment) => (
                  <article className="appointment-card" key={appointment.id}>
                    <div className="appointment-card-main">
                      <div><span className="appointment-reference">Appointment #{appointment.id}</span><h3>{appointment.doctor?.full_name || "Doctor"}</h3><p>{appointment.doctor?.specialties?.name || "Specialty not assigned"}</p></div>
                      <span className={`appointment-status ${appointment.status}`}>{appointment.status}</span>
                    </div>
                    <div className="appointment-meta"><span><strong>Date</strong>{appointment.appointment_date}</span><span><strong>Time</strong>{String(appointment.start_time).slice(0,5)}–{String(appointment.end_time).slice(0,5)}</span>{(isAdmin || isDoctor) && <span><strong>Patient</strong>{appointment.patient?.full_name || "Patient"}</span>}</div>
                    {appointment.reason && <p className="appointment-reason"><strong>Reason:</strong> {appointment.reason}</p>}
                    {(isAdmin || isDoctor) && <div className="directory-actions appointment-actions">{isAdmin && appointment.status !== "confirmed" && appointment.status !== "completed" && <button className="primary-button" onClick={() => updateAppointmentStatus(appointment, "confirmed")}>Confirm</button>}{appointment.status !== "cancelled" && appointment.status !== "completed" && <button className="secondary-button" onClick={() => updateAppointmentStatus(appointment, "cancelled")}>Cancel</button>}{appointment.status === "confirmed" && <button className="secondary-button" onClick={() => updateAppointmentStatus(appointment, "completed")}>Mark completed</button>}{isAdmin && appointment.status === "confirmed" && appointment.appointment_date === todayLocal() && <button className="primary-button" onClick={() => { navigateToPage("queue"); }}>Open queue to check in</button>}</div>}
                  </article>
                ))}
              </div>
            ))}
          </section>
        ) : (
          <section className="doctor-directory">
            <div className="directory-heading">
              <div>
                <h2>Doctors &amp; specialties</h2>
                <p>Directory information is stored in your Supabase database.</p>
              </div>
              <button className="secondary-button" onClick={loadDirectory} disabled={loadingDirectory}>
                {loadingDirectory ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {directoryError && <div className="notice error-notice" role="alert">{directoryError}</div>}
            {successMessage && <div className="notice success-notice" role="status">{successMessage}</div>}

            {isAdmin && (
              <div className="directory-actions">
                <button className="primary-button" onClick={() => setShowDoctorForm((v) => !v)}>
                  {showDoctorForm ? "Cancel doctor form" : "+ Add doctor"}
                </button>
                <button className="secondary-button" onClick={() => setShowSpecialtyForm((v) => !v)}>
                  {showSpecialtyForm ? "Cancel specialty form" : "+ Add specialty"}
                </button>
              </div>
            )}

            {isAdmin && showDoctorForm && (
              <form className="directory-form" onSubmit={addDoctor}>
                <h3>Add a doctor</h3>
                <label className="field">
                  Full name
                  <input required value={doctorForm.full_name} onChange={(e) => setDoctorForm({ ...doctorForm, full_name: e.target.value })} placeholder="Dr. Aanya Sharma" />
                </label>
                <label className="field">
                  Specialty
                  <select value={doctorForm.specialty_id} onChange={(e) => setDoctorForm({ ...doctorForm, specialty_id: e.target.value })}>
                    <option value="">Choose a specialty (optional)</option>
                    {specialties.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  Qualifications
                  <input value={doctorForm.qualifications} onChange={(e) => setDoctorForm({ ...doctorForm, qualifications: e.target.value })} placeholder="MBBS, MD" />
                </label>
                <label className="field">
                  Years of experience
                  <input type="number" min="0" max="80" value={doctorForm.experience_years} onChange={(e) => setDoctorForm({ ...doctorForm, experience_years: e.target.value })} />
                </label>
                <label className="field">
                  Short introduction
                  <textarea rows="3" value={doctorForm.bio} onChange={(e) => setDoctorForm({ ...doctorForm, bio: e.target.value })} placeholder="Areas of clinical interest..." />
                </label>
                <button className="primary-button" type="submit" disabled={savingDoctor || !doctorForm.full_name.trim()}>
                  {savingDoctor ? "Saving..." : "Save doctor"}
                </button>
              </form>
            )}

            {isAdmin && selectedScheduleDoctor && (
              <form className="directory-form schedule-form" onSubmit={saveDoctorSchedule}>
                <h3>Working hours · {selectedScheduleDoctor.full_name}</h3>
                <p className="form-hint">Enable each working day, then set opening/closing times and appointment duration for that day.</p>
                {scheduleRows.map((row) => (
                  <div className="schedule-row" key={row.day_of_week}>
                    <label className="schedule-day"><input type="checkbox" checked={row.enabled} onChange={(e) => setScheduleRows((rows) => rows.map((item) => item.day_of_week === row.day_of_week ? { ...item, enabled: e.target.checked } : item))} /> {WEEKDAYS[row.day_of_week].label}</label>
                    <label className="field">Opens<input type="time" disabled={!row.enabled} required={row.enabled} value={row.opening_time} onChange={(e) => setScheduleRows((rows) => rows.map((item) => item.day_of_week === row.day_of_week ? { ...item, opening_time: e.target.value } : item))} /></label>
                    <label className="field">Closes<input type="time" disabled={!row.enabled} required={row.enabled} value={row.closing_time} onChange={(e) => setScheduleRows((rows) => rows.map((item) => item.day_of_week === row.day_of_week ? { ...item, closing_time: e.target.value } : item))} /></label>
                    <label className="field">Duration (min)<input type="number" min="5" max="240" step="5" disabled={!row.enabled} required={row.enabled} value={row.appointment_duration_minutes} onChange={(e) => setScheduleRows((rows) => rows.map((item) => item.day_of_week === row.day_of_week ? { ...item, appointment_duration_minutes: e.target.value } : item))} /></label>
                  </div>
                ))}
                <div className="directory-actions"><button className="primary-button" type="submit" disabled={savingSchedule}>{savingSchedule ? "Saving hours..." : "Save working hours"}</button><button className="secondary-button" type="button" onClick={() => setSelectedScheduleDoctor(null)}>Cancel</button></div>
              </form>
            )}

            {isAdmin && showSpecialtyForm && (
              <form className="directory-form" onSubmit={addSpecialty}>
                <h3>Add a specialty</h3>
                <label className="field">
                  Specialty name
                  <input required value={specialtyForm.name} onChange={(e) => setSpecialtyForm({ ...specialtyForm, name: e.target.value })} placeholder="For example, ENT" />
                </label>
                <label className="field">
                  Description
                  <textarea rows="2" value={specialtyForm.description} onChange={(e) => setSpecialtyForm({ ...specialtyForm, description: e.target.value })} placeholder="What this department treats" />
                </label>
                <button className="primary-button" type="submit" disabled={savingSpecialty || !specialtyForm.name.trim()}>
                  {savingSpecialty ? "Saving..." : "Save specialty"}
                </button>
              </form>
            )}

            {loadingDirectory ? (
              <p className="directory-empty-state">Loading directory from Supabase...</p>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <h2>Specialties</h2>
                    <p>{visibleSpecialties.length} department{visibleSpecialties.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                {visibleSpecialties.length === 0 ? (
                  <p className="directory-empty-state">No specialties are available yet.</p>
                ) : (
                  <div className="specialty-grid">
                    {visibleSpecialties.map((specialty) => (
                      <article className="specialty-card" key={specialty.id}>
                        <div>
                          <h3>{specialty.name}</h3>
                          <p>{specialty.description || "Hospital specialty"}</p>
                        </div>
                        {isAdmin && (
                          <button className="directory-action-button" onClick={() => toggleSpecialty(specialty)}>
                            {specialty.is_active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                <div className="section-heading doctor-section-heading">
                  <div>
                    <h2>Doctors</h2>
                    <p>{visibleDoctors.length} matching doctor{visibleDoctors.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <label className="field doctor-search-field">
                  Search doctors
                  <input
                    type="search"
                    value={doctorSearch}
                    onChange={(event) => setDoctorSearch(event.target.value)}
                    placeholder="Search by name, specialty, qualification..."
                    aria-label="Search doctors by name, specialty, or qualification"
                  />
                </label>
                {visibleDoctors.length === 0 ? (
                  <p className="directory-empty-state">No doctors have been added yet. {isAdmin ? "Use “Add doctor” above to create the first listing." : ""}</p>
                ) : (
                  <div className="doctor-grid">
                    {visibleDoctors.map((doctor) => (
                      <article className="doctor-card" key={doctor.id}>
                        {doctor.image_url ? (
                          <img className="doctor-avatar doctor-photo" src={doctor.image_url} alt={`Portrait of ${doctor.full_name}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        ) : (
                          <div className="doctor-avatar">{doctor.full_name.trim().charAt(0).toUpperCase()}</div>
                        )}
                        <div className="doctor-details">
                          <div className="doctor-card-heading">
                            <h3>{doctor.full_name}</h3>
                            {isAdmin && <span className={doctor.is_active ? "doctor-status active" : "doctor-status"}>{doctor.is_active ? "Active" : "Inactive"}</span>}
                          </div>
                          <p className="doctor-specialty">{doctor.specialties?.name || "Specialty not assigned"}</p>
                          {doctor.qualifications && <p>{doctor.qualifications}</p>}
                          <p>{doctor.experience_years} year{doctor.experience_years === 1 ? "" : "s"} of experience</p>
                          {doctor.bio && <p className="doctor-bio">{doctor.bio}</p>}
                        </div>
                        <div className="doctor-card-actions">
                          {!isAdmin && !isDoctor && doctor.is_active && <button className="primary-button" onClick={() => openBooking(doctor)}>Book appointment</button>}
                          {isAdmin && <><button className="directory-action-button" onClick={() => editDoctorSchedule(doctor)}>Working hours</button><button className="directory-action-button" onClick={() => toggleDoctor(doctor)}>{doctor.is_active ? "Deactivate" : "Activate"}</button></>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </section>

      <footer className="dashboard-footer">
        CarePoint Hospital &amp; Health · Created by Rohit
      </footer>
    </main>
  );
}
