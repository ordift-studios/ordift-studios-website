import { contentRepository } from "@/lib/content";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { createClient } from "@/lib/supabase/server";
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
  // Real count from the `deliverables` table (migration 0007).
  deliverablesAvailable: number;
  // No `updated_at` column exists on `enquiries`; the accurate version
  // of this (last stage-change timestamp) needs the client-read
  // `activity_log` RLS policy planned for Milestone 2. Using
  // submittedAt here is an honest, if coarser, stand-in — not a
  // fabricated timestamp.
  lastUpdated: string;
  submittedAt: string;
  // The reusable Project Workspace (Milestone 2) — every project card
  // opens here now.
  href: string;
};

function toProjectCard(enquiry: PortalEnquiry, deliverablesAvailable: number): ProjectCardData {
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
    deliverablesAvailable,
    lastUpdated: enquiry.submittedAt,
    submittedAt: enquiry.submittedAt,
    href: `/portal/client/projects/enquiry/${enquiry.id}`,
  };
}

export function getActiveProjects(
  enquiries: PortalEnquiry[],
  deliverablesCountByEntityId: Record<string, number> = {}
): ProjectCardData[] {
  return enquiries
    .filter((e) => isActiveCrmStage(e.crmStage))
    .map((e) => toProjectCard(e, deliverablesCountByEntityId[e.id] ?? 0));
}

const LATEST_UPDATES_LIMIT = 5;

export function getLatestProjectUpdates(
  enquiries: PortalEnquiry[],
  deliverablesCountByEntityId: Record<string, number> = {}
): ProjectCardData[] {
  return getActiveProjects(enquiries, deliverablesCountByEntityId)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, LATEST_UPDATES_LIMIT);
}

// ============================================================
// Deliverables summary (real counts, migration 0007)
// ============================================================

export type DeliverablesSummary = {
  totalCount: number;
  countByEntityId: Record<string, number>;
};

export async function getDeliverablesSummary(
  enquiries: PortalEnquiry[],
  registrations: PortalWorkshopRegistration[]
): Promise<DeliverablesSummary> {
  const enquiryIds = enquiries.map((e) => e.id);
  const registrationIds = registrations.map((r) => r.id);
  const countByEntityId: Record<string, number> = {};
  if (enquiryIds.length === 0 && registrationIds.length === 0) {
    return { totalCount: 0, countByEntityId };
  }

  const supabase = await createClient();

  if (enquiryIds.length > 0) {
    const { data, error } = await supabase
      .from("deliverables")
      .select("entity_id")
      .eq("entity_type", "enquiry")
      .in("entity_id", enquiryIds);
    if (error) console.error("[portal] failed to load deliverables summary (enquiry)", error.message);
    for (const row of data ?? []) {
      countByEntityId[row.entity_id] = (countByEntityId[row.entity_id] ?? 0) + 1;
    }
  }

  if (registrationIds.length > 0) {
    const { data, error } = await supabase
      .from("deliverables")
      .select("entity_id")
      .eq("entity_type", "workshop_registration")
      .in("entity_id", registrationIds);
    if (error) console.error("[portal] failed to load deliverables summary (workshop)", error.message);
    for (const row of data ?? []) {
      countByEntityId[row.entity_id] = (countByEntityId[row.entity_id] ?? 0) + 1;
    }
  }

  const totalCount = Object.values(countByEntityId).reduce((sum, n) => sum + n, 0);
  return { totalCount, countByEntityId };
}

// The Quick Actions "View Deliverables" link needs one concrete
// destination — deliverables live per-project, there's no aggregate
// view. Picks whichever project has the most, so the link always goes
// somewhere real; null (never fabricated) if nothing has been
// published yet.
export function getTopDeliverablesHref(
  summary: DeliverablesSummary,
  enquiries: PortalEnquiry[],
  registrations: PortalWorkshopRegistration[]
): string | null {
  const entries = Object.entries(summary.countByEntityId).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const [topEntityId] = entries[0];

  if (enquiries.some((e) => e.id === topEntityId)) {
    return `/portal/client/projects/enquiry/${topEntityId}/deliverables`;
  }
  if (registrations.some((r) => r.id === topEntityId)) {
    return `/portal/client/projects/workshop/${topEntityId}/deliverables`;
  }
  return null;
}

export type UpcomingSession = {
  registrationId: string;
  workshopSlug: string;
  workshopTitle: string;
  startDate: string;
  registrationStatus: string;
  waitingListPosition: number | null;
  href: string;
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
        href: `/portal/client/projects/workshop/${reg.id}`,
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
  href: string;
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
      href: `/portal/client/projects/enquiry/${e.id}`,
    })),
    ...registrations.map((r) => ({
      id: `workshop-${r.id}`,
      label: `Registered for ${r.workshopTitle}`,
      timestamp: r.registrationDate,
      href: `/portal/client/projects/workshop/${r.id}`,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, ACTIVITY_FEED_LIMIT);
}
