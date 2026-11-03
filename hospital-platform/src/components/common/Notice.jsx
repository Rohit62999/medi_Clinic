import { X } from "lucide-react";

export function Notice({ tone = "info", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="notice-close" aria-label="Dismiss message" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

