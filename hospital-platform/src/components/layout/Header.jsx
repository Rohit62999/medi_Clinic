import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, User } from "lucide-react";
import { NAV_ITEMS } from "../../constants";
import { initialOf } from "../../utils/helpers";
import { BrandMark } from "../common";
import { MobileDrawer } from "./MobileDrawer";

export function Header({
  page,
  navigate,
  displayName,
  email,
  role,
  onShowProfile,
  onSignOut,
  signingOut,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  // Close the profile menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // If the window grows to desktop width, the drawer is no longer needed.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = (event) => {
      if (event.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#home" onClick={() => navigate("home")} aria-label="CarePoint overview">
          <BrandMark />
          <span className="brand-name">CarePoint</span>
        </a>

        <nav className="topnav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="topnav-link"
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => item.id === "appointments" && navigate("appointments")}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="profile-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="avatar" aria-hidden="true">
                {initialOf(displayName)}
              </span>
              <span className="profile-trigger-text">
                <strong>{displayName}</strong>
                <span>{role}</span>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-head">
                  <strong>{displayName}</strong>
                  <span>{email}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowProfile();
                  }}
                >
                  <User size={16} aria-hidden="true" /> My profile
                </button>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-quiet btn-icon-text" onClick={onSignOut} disabled={signingOut}>
            <LogOut size={16} aria-hidden="true" />
            <span>{signingOut ? "Logging out" : "Log out"}</span>
          </button>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>

      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        page={page}
        navigate={navigate}
        displayName={displayName}
        email={email}
        role={role}
        onShowProfile={onShowProfile}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
    </header>
  );
}

