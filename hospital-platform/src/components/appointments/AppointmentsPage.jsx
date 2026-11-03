import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../supabase";
import { APPOINTMENT_STATUS } from "../../constants";
import { errorMessage, formatDate, formatTime, todayLocal } from "../../utils/helpers";
import { EmptyState, Notice, PageHeader, RefreshButton, StatusBadge } from "../common";
import { BookingForm } from "./BookingForm";

export function AppointmentsPage({
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
    const prevAppointments = appointments;
    // Optimistic UI update
    setAppointments((curr) => curr.map((a) => (a.id === appointment.id ? { ...a, status } : a)));
    setBusyId(appointment.id);
    setNotice({ tone: "", text: "" });

    const { error } = await supabase.from("appointments").update({ status }).eq("id", appointment.id);
    setBusyId(null);

    if (error) {
      // Revert on error
      setAppointments(prevAppointments);
      return setNotice({ tone: "error", text: errorMessage(error, "The appointment couldn't be updated.") });
    }
    setNotice({ tone: "success", text: `Appointment ${APPOINTMENT_STATUS[status].toLowerCase()}.` });
    load();
  }

  async function cancelOwn(appointment) {
    if (!window.confirm(`Cancel your appointment with ${appointment.doctor?.full_name || "the doctor"}?`)) return;

    const prevAppointments = appointments;
    // Optimistic UI update
    setAppointments((curr) => curr.map((a) => (a.id === appointment.id ? { ...a, status: "cancelled" } : a)));
    setBusyId(appointment.id);
    setNotice({ tone: "", text: "" });

    const { error } = await supabase.rpc("cancel_my_appointment", { p_appointment_id: appointment.id });
    setBusyId(null);

    if (error) {
      // Revert on error
      setAppointments(prevAppointments);
      return setNotice({ tone: "error", text: errorMessage(error, "The appointment couldn't be cancelled.") });
    }
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
                        {canStaffAct
                          ? appointment.patient?.full_name || "Patient"
                          : appointment.doctor?.full_name || "Doctor"}
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
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            onClick={() => navigate("queue")}
                          >
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

