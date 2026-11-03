import { CalendarDays, FileText, Home, ListOrdered, Stethoscope } from "lucide-react";

export const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

export const NAV_ITEMS = [
  { id: "home", label: "Overview", icon: Home },
  { id: "directory", label: "Doctors", icon: Stethoscope },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "records", label: "Records", icon: FileText },
  { id: "queue", label: "Queue", icon: ListOrdered },
];

export const PAGE_IDS = NAV_ITEMS.map((item) => item.id);

export const APPOINTMENT_STATUS = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const QUEUE_STATUS = {
  waiting: "Waiting",
  next: "Called",
  in_consultation: "With doctor",
  completed: "Done",
  skipped: "Skipped",
};

export const MEDICAL_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const QUEUE_REFRESH_MS = 20000;

