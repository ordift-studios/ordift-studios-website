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

// TD-034: `registrationDeadline` is a Sanity `date` field (no time/zone
// component), so it parses as UTC midnight of that date — the same
// convention CountdownTimer and formatDate already use. Treated as the
// exact enforcement instant rather than "through the end of that day" so
// there's only ever one definition of "the deadline" in this codebase.
export function isRegistrationDeadlinePassed(
  workshop: Pick<Workshop, "registrationDeadline">,
  now: Date = new Date()
): boolean {
  if (!workshop.registrationDeadline) return false;
  return now.getTime() >= new Date(workshop.registrationDeadline).getTime();
}

// The status actually shown and enforced everywhere — same as the raw
// CMS `status` field except a manually-"open" workshop is demoted to
// "closed" once its deadline has passed. Every other status (staff-set
// "closed", "full", "coming-soon", "completed") passes through
// unchanged, so a deadline that's still in the future never reopens a
// workshop staff closed manually. Shared by the detail page, WorkshopCard,
// and the registration API so the frontend and server can't disagree.
export function getEffectiveWorkshopStatus(
  workshop: Pick<Workshop, "status" | "registrationDeadline">,
  now: Date = new Date()
): WorkshopStatus {
  if (workshop.status === "open" && isRegistrationDeadlinePassed(workshop, now)) {
    return "closed";
  }
  return workshop.status;
}

export function isRegistrationOpen(
  workshop: Pick<Workshop, "status" | "registrationDeadline">,
  now: Date = new Date()
): boolean {
  return getEffectiveWorkshopStatus(workshop, now) === "open";
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
