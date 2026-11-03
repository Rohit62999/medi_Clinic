import { RefreshCw } from "lucide-react";

export function RefreshButton({ onClick, busy, label = "Refresh" }) {
  return (
    <button type="button" className="btn btn-quiet btn-icon-text" onClick={onClick} disabled={busy}>
      <RefreshCw size={16} className={busy ? "spin" : undefined} aria-hidden="true" />
      <span>{busy ? "Refreshing" : label}</span>
    </button>
  );
}

