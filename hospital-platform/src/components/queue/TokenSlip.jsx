import { QUEUE_STATUS } from "../../constants";
import { StatusBadge } from "../common";

export function TokenSlip({ entry }) {
  const headline = {
    waiting:
      entry.patients_ahead === 0
        ? "You're next. Please stay close to the consultation room."
        : "Please wait to be called.",
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

