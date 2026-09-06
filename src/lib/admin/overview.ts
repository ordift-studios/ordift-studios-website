import { createClient } from "@/lib/supabase/server";
import { contentRepository } from "@/lib/content";
import { getAllEnquiries, getAllWorkshopRegistrations } from "@/lib/portal/data";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listAllPaymentObligations, PAYABLE_STATUS_LABELS } from "@/lib/payments/payoutObligations";
import { listAllEngagements, isTerminalEngagementStatus, type Engagement } from "@/lib/payables/engagements";
import { listProjectFilesAwaitingBackup, type ProjectFileAwaitingBackup } from "@/lib/payables/projectFiles";

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
