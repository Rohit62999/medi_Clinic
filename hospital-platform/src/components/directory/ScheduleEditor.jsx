import { useState } from "react";
import { supabase } from "../../supabase";
import { WEEKDAYS } from "../../constants";
import { errorMessage, sameId, scheduleFor, toMinutes } from "../../utils/helpers";
import { Notice } from "../common";

export function ScheduleEditor({ doctor, hours, onClose, onSaved }) {
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

