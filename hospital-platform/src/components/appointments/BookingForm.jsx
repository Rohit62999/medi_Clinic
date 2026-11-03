import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabase";
import {
  errorMessage,
  formatDate,
  formatTime,
  sameId,
  scheduleFor,
  toDateKey,
  todayLocal,
  toMinutes,
  toTime,
  workingDays,
} from "../../utils/helpers";
import { Notice } from "../common";

export function BookingForm({ userId, directory, directoryLoading, initial, onCancel, onBooked }) {
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
      setError(
        taken
          ? "Someone booked that time a moment ago. Choose another time."
          : errorMessage(saveError, "The booking couldn't be saved.")
      );
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

