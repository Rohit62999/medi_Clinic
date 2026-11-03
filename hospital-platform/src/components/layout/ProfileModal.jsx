import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { initialOf } from "../../utils/helpers";

export function ProfileModal({ profile, session, displayName, onClose, onSignOut, signingOut }) {
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

