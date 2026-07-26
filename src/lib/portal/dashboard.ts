import { contentRepository } from "@/lib/content";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { CRM_STAGES } from "@/lib/admin/enquiries";
import { crmStageLabel, type PortalEnquiry, type PortalWorkshopRegistration } from "@/lib/portal/data";

// Pure derivation functions only — the page fetches `enquiries`/
// `registrations` once (via the existing getEnquiriesForUser /
// getWorkshopRegistrationsForUser) and passes them in here, so the
// dashboard's several widgets don't each re-query the same rows.

// The "happy path" subset of CRM_STAGES, in pipeline order — excludes the
// branch/outcome stages (repeat_client, referral, declined, closed) that
// aren't reached sequentially. Used for the dashboard's progress bar and
// "next milestone" — mirrors public.crm_stage (0001_init.sql) via the
// existing ordered CRM_STAGES constant, not a re-declared enum.
const HAPPY_PATH = CRM_STAGES.filter(
  (stage) => !["repeat_client", "referral", "declined", "closed"].includes(stage)
);

// A project counts as "active" while it's still moving through the
// pipeline — once it reaches `completed` (or a branch stage), it drops off
// the Active Projects widget. This is a display filter only, derived
// entirely from the existing crm_stage enum — no new field.
const ACTIVE_STAGE_CUTOFF = "completed";

export function isActiveCrmStage(stage: string): boolean {
  const idx = HAPPY_PATH.indexOf(stage as (typeof HAPPY_PATH)[number]);
  return idx !== -1 && stage !== ACTIVE_STAGE_CUTOFF;
}

export function nextCrmStage(stage: string): string | null {
  const idx = HAPPY_PATH.indexOf(stage as (typeof HAPPY_PATH)[number]);
  if (idx === -1 || idx === HAPPY_PATH.length - 1) return null;
  return HAPPY_PATH[idx + 1];
}

export function crmStageProgress(stage: string): { step: number; total: number } | null {
  const idx = HAPPY_PATH.indexOf(stage as (typeof HAPPY_PATH)[number]);
  if (idx === -1) return null;
  return { step: idx + 1, total: HAPPY_PATH.length };
}

export type ProjectCardData = {
  id: string;
  referenceNumber: string;
  title: string;
  projectType: string;
  statusLabel: string;
  nextMilestoneLabel: string | null;
  progress: { step: number; total: number } | null;
  paymentStatus: string | null;
  // Real appointment data doesn't exist for enquiries in the frozen
  // schema (no session/shoot-date field) — always null here, rendered
  // as an honest "not yet scheduled" state, never invented.
  nextAppointment: null;
  // Deliverables land in Milestone 3 — always 0 until that table exists.
  deliverablesAvailable: 0;
  // No `updated_at` column exists on `enquiries`; the accurate version
  // of this (last stage-change timestamp) needs the client-read
  // `activity_log` RLS policy planned for Milestone 2. Using
  // submittedAt here is an honest, if coarser, stand-in — not a
  // fabricated timestamp.
  lastUpdated: string;
  submittedAt: string;
  // The Booking & Project Timeline (Milestone 2) doesn't exist yet, so
  // there's nowhere real to click through to — always false in
  // Milestone 1. The card renders as informational-only, with a small
  // "Timeline coming soon" indicator instead of a dead link.
  timelineAvailable: false;
};

function toProjectCard(enquiry: PortalEnquiry): ProjectCardData {
  const next = nextCrmStage(enquiry.crmStage);
  return {
    id: enquiry.id,
    referenceNumber: enquiry.referenceNumber,
    title: `${pathwayLabel(enquiry.service)} — ${enquiry.referenceNumber}`,
    projectType: pathwayLabel(enquiry.service),
    statusLabel: crmStageLabel(enquiry.crmStage),
    nextMilestoneLabel: next ? crmStageLabel(next) : null,
    progress: crmStageProgress(enquiry.crmStage),
    paymentStatus: enquiry.paymentStatus,
    nextAppointment: null,
    deliverablesAvailable: 0,
    lastUpdated: enquiry.submittedAt,
    submittedAt: enquiry.submittedAt,
    timelineAvailable: false,
  };
}

export function getActiveProjects(enquiries: PortalEnquiry[]): ProjectCardData[] {
  return enquiries.filter((e) => isActiveCrmStage(e.crmStage)).map(toProjectCard);
}

const LATEST_UPDATES_LIMIT = 5;

export function getLatestProjectUpdates(enquiries: PortalEnquiry[]): ProjectCardData[] {
  return getActiveProjects(enquiries)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, LATEST_UPDATES_LIMIT);
}

export type UpcomingSession = {
  registrationId: string;
  workshopSlug: string;
  workshopTitle: string;
  startDate: string;
  registrationStatus: string;
  waitingListPosition: number | null;
};

export async function getUpcomingSessions(
  registrations: PortalWorkshopRegistration[]
): Promise<UpcomingSession[]> {
  const now = Date.now();

  const withDates = await Promise.all(
    registrations.map(async (reg): Promise<UpcomingSession | null> => {
      const workshop = await contentRepository.getWorkshopBySlug(reg.workshopSlug);
      if (!workshop?.startDate) return null;
      if (new Date(workshop.startDate).getTime() < now) return null;
      return {
        registrationId: reg.id,
        workshopSlug: reg.workshopSlug,
        workshopTitle: reg.workshopTitle,
        startDate: workshop.startDate,
        registrationStatus: reg.registrationStatus,
        waitingListPosition: reg.waitingListPosition,
      };
    })
  );

  return withDates
    .filter((s): s is UpcomingSession => s !== null)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export type ActivityFeedItem = {
  id: string;
  label: string;
  timestamp: string;
  // Enquiry activity has nowhere to link to until Milestone 2 ships the
  // project detail page — null renders as plain text, never a dead link.
  href: string | null;
};

const ACTIVITY_FEED_LIMIT = 8;

export function getRecentActivity(
  enquiries: PortalEnquiry[],
  registrations: PortalWorkshopRegistration[]
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [
    ...enquiries.map((e) => ({
      id: `enquiry-${e.id}`,
      label: `New ${pathwayLabel(e.service)} enquiry submitted — ${e.referenceNumber}`,
      timestamp: e.submittedAt,
      href: null,
    })),
    ...registrations.map((r) => ({
      id: `workshop-${r.id}`,
      label: `Registered for ${r.workshopTitle}`,
      timestamp: r.registrationDate,
      href: `/workshops/${r.workshopSlug}`,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, ACTIVITY_FEED_LIMIT);
}
