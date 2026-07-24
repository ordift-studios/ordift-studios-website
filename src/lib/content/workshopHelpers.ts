import { formatDate } from "./formatters";
import type { Workshop, WorkshopStatus } from "./types";

export { formatDate };

export const STATUS_LABEL: Record<WorkshopStatus, string> = {
  "coming-soon": "Coming Soon",
  open: "Open for Registration",
  full: "Full",
  closed: "Closed",
  completed: "Completed",
};

export const STATUS_BADGE_CLASSES: Record<WorkshopStatus, string> = {
  "coming-soon": "bg-ordift-navy-950/5 text-ordift-ink-muted",
  open: "bg-ordift-gold/15 text-ordift-gold-pressed",
  full: "bg-ordift-navy-950/5 text-ordift-ink-muted",
  closed: "bg-ordift-navy-950/5 text-ordift-ink-muted",
  completed: "bg-ordift-navy-950/5 text-ordift-ink-muted",
};

export const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "all-levels": "All levels",
};

export function isPastWorkshop(workshop: Workshop): boolean {
  return workshop.status === "completed";
}

export function formatDateRange(workshop: Workshop): string {
  if (!workshop.startDate) return "To be announced";
  const start = formatDate(workshop.startDate);
  if (!workshop.endDate || workshop.endDate === workshop.startDate) return start;
  return `${start} – ${formatDate(workshop.endDate)}`;
}

export function isMultiDay(workshop: Workshop): boolean {
  return Boolean(
    workshop.startDate && workshop.endDate && workshop.startDate !== workshop.endDate
  );
}
