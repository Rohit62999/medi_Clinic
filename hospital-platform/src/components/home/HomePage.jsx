import { useEffect, useState } from "react";
import { CalendarDays, FileText, ListOrdered, Plus, Stethoscope } from "lucide-react";
import { supabase } from "../../supabase";
import { APPOINTMENT_STATUS } from "../../constants";
import { formatDate, formatTime, greeting, toMinutes, todayLocal } from "../../utils/helpers";
import { Notice, PageHeader, StatusBadge } from "../common";

export function HomePage({
  userId,
  isAdmin,
  isDoctor,
  isPatient,
  myDoctor,
  myDoctorLoaded,
  displayName,
  navigate,
  onBook,
}) {
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
        if (!cancelled) {
          setAdminCounts({ pending: pending.count ?? 0, today: todayConfirmed.count ?? 0 });
        }
      } else if (!isDoctor || myDoctorLoaded) {
        if (isDoctor && !myDoctor) {
          if (!cancelled) setNextAppointment(null);
        } else {
          let query = supabase
            .from("appointments")
            .select(
              "id, appointment_date, start_time, end_time, status, doctor:doctors(full_name, specialties(name)), patient:profiles!appointments_patient_id_fkey(full_name)"
            )
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

