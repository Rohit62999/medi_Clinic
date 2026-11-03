import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { QUEUE_REFRESH_MS, QUEUE_STATUS } from "../../constants";
import { errorMessage, formatDate, formatTime, sameId, todayLocal } from "../../utils/helpers";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { EmptyState, Notice, PageHeader, RefreshButton, StatusBadge } from "../common";

export function StaffQueue({ isAdmin, isDoctor, myDoctor, myDoctorLoaded }) {
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
        .select(
          "id, doctor_id, start_time, end_time, doctor:doctors(full_name), patient:profiles!appointments_patient_id_fkey(full_name)"
        )
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

