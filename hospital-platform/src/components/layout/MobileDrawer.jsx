import { useEffect, useRef } from "react";
import { LogOut, User, X } from "lucide-react";
import { NAV_ITEMS } from "../../constants";
import { initialOf } from "../../utils/helpers";

export function MobileDrawer({
  open,
  onClose,
  page,
  navigate,
  displayName,
  email,
  role,
  onShowProfile,
  onSignOut,
  signingOut,
}) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && drawerRef.current) {
        // Keep keyboard focus inside the open drawer.
        const focusable = drawerRef.current.querySelectorAll("button, a[href]");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  function go(id) {
    navigate(id);
    onClose();
  }

  return (
    <div className={`drawer-layer${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        id="mobile-drawer"
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="drawer-head">
          <span className="avatar avatar-lg" aria-hidden="true">
            {initialOf(displayName)}
          </span>
          <div className="drawer-identity">
            <strong>{displayName}</strong>
            <span>{email}</span>
            <span className="role-tag">{role}</span>
          </div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close menu" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="drawer-link"
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <Icon size={20} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="drawer-footer">
          <button
            type="button"
            className="drawer-link"
            onClick={() => {
              onClose();
              onShowProfile();
            }}
          >
            <User size={20} aria-hidden="true" />
            My profile
          </button>
          <button type="button" className="drawer-link drawer-logout" onClick={onSignOut} disabled={signingOut}>
            <LogOut size={20} aria-hidden="true" />
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>
    </div>
  );
}

