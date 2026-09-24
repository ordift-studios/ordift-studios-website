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
// component), so it parses as UTC midnight of that date. The deadline
// day itself stays open — registration closes only once the following
// day begins, giving visitors the full deadline day rather than closing
// at its first instant. Exported so CountdownTimer can count down to
// this exact instant too — the countdown, the badge, and the API must
// all agree on one closing moment.
export function getRegistrationCloseInstant(
  workshop: Pick<Workshop, "registrationDeadline">
): Date | null {
  if (!workshop.registrationDeadline) return null;
  const deadlineStart = new Date(workshop.registrationDeadline);
  return new Date(deadlineStart.getTime() + 24 * 60 * 60 * 1000);
}

export function isRegistrationDeadlinePassed(
  workshop: Pick<Workshop, "registrationDeadline">,
  now: Date = new Date()
): boolean {
  const closesAt = getRegistrationCloseInstant(workshop);
  return closesAt !== null && now.getTime() >= closesAt.getTime();
}

// registrationOpensAt is (like registrationDeadline) a Sanity `date`
// field — no time/zone component, so it parses as UTC midnight of that
// date, the same convention getRegistrationCloseInstant already uses.
// Unlike the deadline (which gets a full extra day of grace so the
// deadline day itself stays open), opening has no such grace — it
// simply becomes true from that UTC midnight onward, matching "once
// the configured date/time is reached" literally.
function isRegistrationOpenDateReached(
  workshop: Pick<Workshop, "registrationOpensAt">,
  now: Date = new Date()
): boolean {
  // No configured opening date = no auto-open rule at all — "coming-soon"
  // stays a manual-only transition, exactly as before this fix (see the
  // "no registrationOpensAt configured is unaffected" note above).
  if (!workshop.registrationOpensAt) return false;
  return now.getTime() >= new Date(workshop.registrationOpensAt).getTime();
}

// The status actually shown and enforced everywhere — same as the raw
// CMS `status` field with two real-date-driven adjustments:
//   - a manually-"open" workshop is demoted to "closed" once its
//     deadline has passed (unchanged from before this fix);
//   - a "coming-soon" workshop is PROMOTED to "open" once its
//     configured registrationOpensAt date has been reached (2026-09-24
//     correction — "coming-soon" previously had no relationship to
//     registrationOpensAt at all, so a workshop staff configured to
//     open automatically on a given date stayed stuck on "Registration
//     isn't open yet" forever unless someone manually flipped its
//     status). A workshop with no registrationOpensAt configured is
//     unaffected — "coming-soon" with no opening date remains a
//     manual-only transition, exactly as before.
// "full"/"closed"/"completed" are never touched by either rule — those
// are terminal/manual states a real registration-open date must never
// silently override. Shared by the detail page, WorkshopCard, and the
// registration API so the frontend and server can't disagree.
export function getEffectiveWorkshopStatus(
  workshop: Pick<Workshop, "status" | "registrationDeadline" | "registrationOpensAt">,
  now: Date = new Date()
): WorkshopStatus {
  let status = workshop.status;
  if (status === "coming-soon" && isRegistrationOpenDateReached(workshop, now)) {
    status = "open";
  }
  if (status === "open" && isRegistrationDeadlinePassed(workshop, now)) {
    return "closed";
  }
  return status;
}

export function isRegistrationOpen(
  workshop: Pick<Workshop, "status" | "registrationDeadline" | "registrationOpensAt">,
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
