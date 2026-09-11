import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentRepository } from "@/lib/content";
import { getAllEnquiries, getAllWorkshopRegistrations } from "@/lib/portal/data";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import {
  listAllPaymentObligations,
  getPaymentObligation,
  PAYABLE_STATUS_LABELS,
} from "@/lib/payments/payoutObligations";
import {
  listAllEngagements,
  getEngagement,
  isTerminalEngagementStatus,
  type Engagement,
} from "@/lib/payables/engagements";
import { listProjectFilesAwaitingBackup, type ProjectFileAwaitingBackup } from "@/lib/payables/projectFiles";
import { listStaffOnboarding, canManageOnboarding } from "@/lib/organization/onboarding";
import { getUnsatisfiedRequiredForStage } from "@/lib/organization/onboardingRequirements";
import { listSeparationCases, canManageSeparationCases } from "@/lib/organization/separationCases";
import { getUnsatisfiedRequiredSeparationRequirements } from "@/lib/organization/separationRequirements";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import {
  getRecentActivity,
  SUPER_ADMIN_ONLY_ACTIONS,
  ADMIN_TIER_ACTIONS,
  type ActivityLogEntry,
} from "@/lib/admin/activityLog";

export type OverviewStats = {
  newEnquiriesThisWeek: number;
  openWorkshopsCount: number;
  pendingModelApplications: number;
  pendingVendorApplications: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// One query per stat rather than a single aggregate RPC — these are cheap
// count-only requests (head: true means Postgres never materializes rows),
// and keeping them separate means one failing table can't blank out the
// whole dashboard.
export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = await createClient();
  const sinceIso = new Date(Date.now() - WEEK_MS).toISOString();

  const [enquiriesResult, modelResult, vendorResult, workshops] = await Promise.all([
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", sinceIso),
    supabase
      .from("model_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("vendor_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    contentRepository.getWorkshops(),
  ]);

  if (enquiriesResult.error) {
    console.error("[admin] overview: enquiries count failed", enquiriesResult.error.message);
  }
  if (modelResult.error) {
    console.error("[admin] overview: model_profiles count failed", modelResult.error.message);
  }
  if (vendorResult.error) {
    console.error("[admin] overview: vendor_profiles count failed", vendorResult.error.message);
  }

  return {
    newEnquiriesThisWeek: enquiriesResult.count ?? 0,
    openWorkshopsCount: workshops.filter((w) => w.status === "open").length,
    pendingModelApplications: modelResult.count ?? 0,
    pendingVendorApplications: vendorResult.count ?? 0,
  };
}

// Phase K.3 (2026-09-06) — "Needs Attention" layer, general tier. Uses the
// SESSION client throughout (via getAllEnquiries/getAllWorkshopRegistrations,
// both already RLS-scoped and already used by /admin/enquiries and
// /admin/bookings respectively) so it is safe to call unconditionally from
// any staff-or-above viewer of /admin/overview — no new authorization
// surface is introduced here. The two conditions reuse this codebase's own
// existing "needs action" signals rather than inventing new ones:
// crm_stage === "new_lead" (first of the 13 real CRM_STAGES, i.e. an
// enquiry nobody has triaged yet) and paymentStatus === "Pending" (one of
// the 4 real PAYMENT_STATUSES on a workshop registration).
export type GeneralNeedsAttention = {
  newLeadEnquiries: number;
  pendingPaymentRegistrations: number;
};

export async function getGeneralNeedsAttention(): Promise<GeneralNeedsAttention> {
  const [newLeadEnquiries, pendingPaymentRegistrations] = await Promise.all([
    getAllEnquiries({ stage: "new_lead" }),
    getAllWorkshopRegistrations({ paymentStatus: "Pending" }),
  ]);

  return {
    newLeadEnquiries: newLeadEnquiries.length,
    pendingPaymentRegistrations: pendingPaymentRegistrations.length,
  };
}

// E.5 Stage 2I, Part F (2026-09-11) — Onboarding-domain tier of "Needs
// Attention", following the exact same typed/conditionally-rendered
// pattern as GeneralNeedsAttention/PayablesNeedsAttention above/below,
// not a new notification architecture. Deliberately narrow — only a
// real, actionable condition surfaces here (a required approval-type
// requirement genuinely blocking the current stage), never every
// in_progress record, per explicit instruction not to turn every
// onboarding record into a warning.
export type OnboardingNeedsAttention = {
  awaitingApproval: { onboardingId: string; profileId: string; profileName: string | null; stage: string; requirementLabels: string[] }[];
};

export async function getOnboardingNeedsAttention(actorUserId: string): Promise<OnboardingNeedsAttention | null> {
  if (!(await canManageOnboarding(actorUserId))) return null;

  const admin = createAdminClient();
  const inProgress = (await listStaffOnboarding()).filter((o) => o.status === "in_progress");
  if (inProgress.length === 0) return { awaitingApproval: [] };

  const profileIds = inProgress.map((o) => o.profileId);
  const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", profileIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));

  const awaitingApproval: OnboardingNeedsAttention["awaitingApproval"] = [];
  for (const o of inProgress) {
    const unsatisfied = await getUnsatisfiedRequiredForStage({
      onboardingId: o.id,
      profileId: o.profileId,
      pipeline: o.pipeline,
      stage: o.stage,
    });
    const approvalItems = unsatisfied.filter((r) => r.requirementType === "approval");
    if (approvalItems.length > 0) {
      awaitingApproval.push({
        onboardingId: o.id,
        profileId: o.profileId,
        profileName: nameById.get(o.profileId) ?? null,
        stage: o.stage,
        requirementLabels: approvalItems.map((r) => r.label),
      });
    }
  }

  return { awaitingApproval };
}

// E.5 Stage 2J, Part 10 (2026-09-12) — Separation/offboarding tier of
// "Needs Attention", same typed/conditionally-rendered pattern. Only
// two concrete, non-arbitrary conditions are surfaced (a deliberate
// subset of Part 10's example list, matching the same discipline
// already applied to Onboarding's own Needs Attention tier): a
// self-initiated case genuinely awaiting company acknowledgement, and
// a case whose required clearance is fully satisfied and is therefore
// genuinely ready for Final Clearance to be recorded. Routine
// in-progress clearance work is never surfaced as a warning.
export type SeparationNeedsAttention = {
  awaitingAcknowledgement: { separationCaseId: string; profileId: string; profileName: string | null }[];
  readyForFinalClearance: { separationCaseId: string; profileId: string; profileName: string | null }[];
};

export async function getSeparationNeedsAttention(actorUserId: string): Promise<SeparationNeedsAttention | null> {
  if (!(await canManageSeparationCases(actorUserId))) return null;

  const admin = createAdminClient();
  const openCases = (await listSeparationCases()).filter((c) => c.status === "open");
  if (openCases.length === 0) return { awaitingAcknowledgement: [], readyForFinalClearance: [] };

  const profileIds = openCases.map((c) => c.profileId);
  const [{ data: profiles }, usersResult] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", profileIds),
    listUsersWithRoles(),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
  const rolesByProfileId = new Map((usersResult.ok ? usersResult.users : []).map((u) => [u.id, u.roles]));

  const awaitingAcknowledgement: SeparationNeedsAttention["awaitingAcknowledgement"] = [];
  const readyForFinalClearance: SeparationNeedsAttention["readyForFinalClearance"] = [];

  for (const c of openCases) {
    if (c.initiatedByRole === "self" && !c.companyAcknowledgedAt) {
      awaitingAcknowledgement.push({ separationCaseId: c.id, profileId: c.profileId, profileName: nameById.get(c.profileId) ?? null });
    }

    const unsatisfied = await getUnsatisfiedRequiredSeparationRequirements({
      separationCaseId: c.id,
      profileId: c.profileId,
      roles: rolesByProfileId.get(c.profileId) ?? [],
      finalSettlementStatus: c.finalSettlementStatus,
    });
    if (unsatisfied.length === 0) {
      readyForFinalClearance.push({ separationCaseId: c.id, profileId: c.profileId, profileName: nameById.get(c.profileId) ?? null });
    }
  }

  return { awaitingAcknowledgement, readyForFinalClearance };
}

// Phase K.3 (2026-09-06) — Payables-domain tier of "Needs Attention", plus
// the Payables summary and due/overdue engagements sections. Deliberately
// separate from getGeneralNeedsAttention() above: everything here reads
// through admin-client bulk-list functions (listAllPaymentObligations has
// no internal authorization check of its own — established convention is
// that the CALLER gates it), so this function performs the same
// authorizeWithSuperAdminOverride(FINANCE_CAPABILITIES.payeeAdminister)
// check /admin/payables itself relies on, and returns null for an
// unauthorized viewer. The page must render this whole section
// conditionally on a non-null result — never show it empty/zeroed to a
// plain staff account, since that would misrepresent "nothing needs
// attention" instead of "you can't see this."
//
// listAllEngagements() and listProjectFilesAwaitingBackup() already
// self-guard with the identical check and fail closed (return []) on their
// own, so calling them here after our own check is redundant-but-harmless
// defense in depth, not a new gate.
export type PayablesNeedsAttention = {
  payableStatusCounts: { status: string; label: string; count: number }[];
  pendingApprovalCount: number;
  approvedAwaitingPaymentCount: number;
  overdueEngagements: DueEngagementSummary[];
  dueSoonEngagements: DueEngagementSummary[];
  filesAwaitingBackup: ProjectFileAwaitingBackup[];
};

export type DueEngagementSummary = {
  id: string;
  payeeProfileId: string | null;
  payeeName: string | null;
  operationalTitleName: string | null;
  dueDate: string;
  status: string;
};

const DUE_SOON_WINDOW_MS = WEEK_MS; // 7 days — same window this file already uses for newEnquiriesThisWeek.

function toDueEngagementSummary(e: Engagement): DueEngagementSummary {
  return {
    id: e.id,
    payeeProfileId: e.payeeProfileId,
    payeeName: e.payeeName,
    operationalTitleName: e.operationalTitleName,
    dueDate: e.dueDate as string, // callers only pass engagements already filtered to dueDate !== null
    status: e.status,
  };
}

export async function getPayablesNeedsAttention(actorUserId: string): Promise<PayablesNeedsAttention | null> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return null;

  const [obligations, engagements, filesAwaitingBackup] = await Promise.all([
    listAllPaymentObligations(),
    listAllEngagements(actorUserId),
    listProjectFilesAwaitingBackup(actorUserId),
  ]);

  const counts = new Map<string, number>();
  for (const o of obligations) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  const payableStatusCounts = Object.keys(PAYABLE_STATUS_LABELS)
    .map((status) => ({ status, label: PAYABLE_STATUS_LABELS[status], count: counts.get(status) ?? 0 }))
    .filter((row) => row.count > 0);

  const now = Date.now();
  const dueSoonThreshold = now + DUE_SOON_WINDOW_MS;
  const openWithDueDate = engagements.filter((e) => e.dueDate && !isTerminalEngagementStatus(e.status));
  const overdueEngagements = openWithDueDate
    .filter((e) => new Date(e.dueDate as string).getTime() < now)
    .map(toDueEngagementSummary);
  const dueSoonEngagements = openWithDueDate
    .filter((e) => {
      const dueMs = new Date(e.dueDate as string).getTime();
      return dueMs >= now && dueMs <= dueSoonThreshold;
    })
    .map(toDueEngagementSummary);

  return {
    payableStatusCounts,
    pendingApprovalCount: counts.get("pending_approval") ?? 0,
    approvedAwaitingPaymentCount: counts.get("approved") ?? 0,
    overdueEngagements,
    dueSoonEngagements,
    filesAwaitingBackup,
  };
}

// Follow-up correction (2026-09-06) — Recent Activity was showing a raw
// activity_log.entity_id (a UUID) as a second line under every row, and
// no resolved business-object name at all. This resolves entity_id into
// a human-readable label for display, WITHOUT touching activity_log,
// ActivityLogEntry, or any other consumer of getRecentActivity() —
// display-only, additive, Overview-local.
//
// Authorization reasoning (why this can't leak beyond what the current
// viewer already sees): a row for a given `action` can only be present
// in `entries` at all if getRecentActivity()'s own
// getExcludedActionsForViewerTier() already let it through for the
// CURRENT viewer — i.e. the viewer is already confirmed Admin-tier (for
// ADMIN_TIER_ACTIONS) or Super-Admin (for SUPER_ADMIN_ONLY_ACTIONS).
// Resolving a payee/engagement name only for rows whose action is in
// one of those two existing Sets is therefore not a new authorization
// decision — it's the same one already made, reused. Every other action
// (e.g. the staff-visible-by-default project_file.* lifecycle events)
// gets ONLY a neutral, non-identifying label by entity_type — never a
// resolved person/engagement name — so this can never hand a lower-tier
// viewer identity or financial context the existing tiering didn't
// already clear them for.
const NEUTRAL_ENTITY_LABELS: Record<string, string> = {
  engagement: "Engagement",
  payment_obligation: "Payment obligation",
  project_file: "File",
  user: "Account",
};

function humanizeEntityType(entityType: string): string {
  return entityType
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function neutralEntityLabel(entityType: string | null): string | null {
  if (!entityType) return null;
  return NEUTRAL_ENTITY_LABELS[entityType] ?? humanizeEntityType(entityType);
}

export type ActivityFeedEntry = {
  id: string;
  action: string;
  actorName: string | null;
  entityLabel: string | null;
  createdAt: string;
};

function metadataPayeeId(entry: ActivityLogEntry): string | null {
  const value = (entry.metadata as { payeeProfileId?: unknown }).payeeProfileId;
  return typeof value === "string" ? value : null;
}

export async function getRecentActivityForOverview(limit?: number): Promise<ActivityFeedEntry[]> {
  const entries = await getRecentActivity(limit);
  if (entries.length === 0) return [];

  const resolvableActions = new Set<string>([...SUPER_ADMIN_ONLY_ACTIONS, ...ADMIN_TIER_ACTIONS]);

  const engagementIds = new Set<string>();
  const obligationIds = new Set<string>();
  const directProfileIds = new Set<string>(); // entityType "user": entity_id IS a profile id for every resolvable action that uses it (verified per action below)

  for (const e of entries) {
    if (!resolvableActions.has(e.action) || !e.entityId) continue;
    if (e.entityType === "engagement") engagementIds.add(e.entityId);
    else if (e.entityType === "payment_obligation") obligationIds.add(e.entityId);
    else if (e.entityType === "user") directProfileIds.add(e.entityId);
    const metaId = metadataPayeeId(e);
    if (metaId) directProfileIds.add(metaId);
  }

  // Reuses the existing single-record lookups (getEngagement,
  // getPaymentObligation) rather than duplicating their queries — both
  // already resolve exactly the fields needed here.
  const [engagementPairs, obligationPairs] = await Promise.all([
    Promise.all([...engagementIds].map(async (id) => [id, await getEngagement(id)] as const)),
    Promise.all([...obligationIds].map(async (id) => [id, await getPaymentObligation(id)] as const)),
  ]);
  const engagementById = new Map(engagementPairs.filter(([, v]) => v !== null) as [string, Engagement][]);
  const obligationById = new Map(
    obligationPairs.filter(([, v]) => v !== null) as [string, Awaited<ReturnType<typeof getPaymentObligation>>][]
  );

  const profileIdsNeedingNames = new Set(directProfileIds);
  for (const eng of engagementById.values()) if (eng.payeeProfileId) profileIdsNeedingNames.add(eng.payeeProfileId);
  for (const ob of obligationById.values()) if (ob?.payeeProfileId) profileIdsNeedingNames.add(ob.payeeProfileId);

  let nameByProfileId = new Map<string, string | null>();
  if (profileIdsNeedingNames.size > 0) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("id, full_name").in("id", [...profileIdsNeedingNames]);
    if (error) console.error("[admin] overview: failed to resolve names for activity feed", error.message);
    nameByProfileId = new Map((data ?? []).map((p) => [p.id, p.full_name as string | null]));
  }

  return entries.map((e) => {
    let entityLabel = neutralEntityLabel(e.entityType);

    if (resolvableActions.has(e.action) && e.entityId) {
      const metaId = metadataPayeeId(e);
      if (e.entityType === "engagement") {
        const eng = engagementById.get(e.entityId);
        const payeeName = eng?.payeeProfileId ? nameByProfileId.get(eng.payeeProfileId) : null;
        entityLabel = eng?.operationalTitleName ?? payeeName ?? entityLabel;
      } else if (e.entityType === "payment_obligation") {
        const ob = obligationById.get(e.entityId);
        const payeeName = ob?.payeeProfileId ? nameByProfileId.get(ob.payeeProfileId) : null;
        entityLabel = payeeName ?? entityLabel;
      } else if (e.entityType === "user") {
        entityLabel = nameByProfileId.get(e.entityId) ?? entityLabel;
      } else if (metaId) {
        entityLabel = nameByProfileId.get(metaId) ?? entityLabel;
      }
    }

    return {
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      entityLabel,
      createdAt: e.createdAt,
    };
  });
}
