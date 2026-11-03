import { PAGE_IDS, WEEKDAYS } from "../constants";

export const toMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

export const toTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const todayLocal = () => toDateKey(new Date());

export const formatTime = (time) => {
  if (!time) return "";
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, "0");
  return `${((hours + 11) % 12) + 1}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
};

export const formatDate = (date, options = { weekday: "short", day: "numeric", month: "short" }) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options) : "";

export const formatFileSize = (bytes) => {
  if (!bytes) return "";
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export const initialOf = (name) =>
  (String(name || "").replace(/^dr\.?\s+/i, "").trim().charAt(0) || "?").toUpperCase();

export const sameId = (a, b) => String(a) === String(b);

export const errorMessage = (error, fallback) => {
  const message = String(error?.message || "");
  if (!message) return fallback;
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account doesn't have permission to do that.";
  }
  return message;
};

export const scheduleFor = (hours, doctorId, dayOfWeek) =>
  hours.find(
    (row) => sameId(row.doctor_id, doctorId) && Number(row.day_of_week) === dayOfWeek && row.is_active !== false
  );

export const workingDays = (hours, doctorId) =>
  WEEKDAYS.filter((day) => scheduleFor(hours, doctorId, day.value));

export const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export const readPageFromHash = () => {
  const id = window.location.hash.replace("#", "");
  return PAGE_IDS.includes(id) ? id : "home";
};

