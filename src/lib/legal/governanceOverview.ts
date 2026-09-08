import { createAdminClient } from "@/lib/supabase/admin";
import { isIssuedAgreementStatus, isTerminalAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase H (2026-09-08).
// Read-only listing/aggregation layer for the Admin Legal & Governance
// area (src/app/admin/legal/page.tsx). Metadata/governance reads only
// — never renders or mutates legal prose or agreement state. No
// internal auth gate in this module, matching the existing precedent
// in masterRegistry.ts (listLegalDocumentMasters()/
// getLegalSuiteSettingsStatus()) — the calling page is the real
// boundary (Super Admin / Admin redirect), and every underlying table
// carries its own admin-tier-only RLS regardless.

export type AgreementSummaryRow = {
  id: string;
  agreementReference: string;
  status: AgreementLifecycleStatus;
  masterCode: string | null;
  masterTitle: string | null;
  jurisdiction: string | null;
  jurisdictionReviewRequired: boolean;
  createdAt: string;
};

async function fetchAgreementSummaries(admin: ReturnType<typeof createAdminClient>, filters?: { jurisdictionReviewRequired?: boolean }, limit = 50): Promise<AgreementSummaryRow[]> {
  let query = admin
    .from("agreements")
    .select("id, agreement_reference, status, jurisdiction, jurisdiction_review_required, created_at, legal_document_masters(code, title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters?.jurisdictionReviewRequired !== undefined) {
    query = query.eq("jurisdiction_review_required", filters.jurisdictionReviewRequired);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[legal] failed to load agreements for Admin Legal & Governance", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const master = row.legal_document_masters as unknown as { code: string; title: string } | null;
    return {
      id: row.id,
      agreementReference: row.agreement_reference,
      status: row.status as AgreementLifecycleStatus,
      masterCode: master?.code ?? null,
      masterTitle: master?.title ?? null,
      jurisdiction: row.jurisdiction,
      jurisdictionReviewRequired: row.jurisdiction_review_required,
      createdAt: row.created_at,
    };
  });
}

export async function listAgreementsForAdmin(limit = 50): Promise<AgreementSummaryRow[]> {
  const admin = createAdminClient();
  return fetchAgreementSummaries(admin, undefined, limit);
}

// The Legal Review Queue — agreements flagged by routeJurisdiction()
// as needing human jurisdiction review AND not yet in a terminal
// state. Never a general-purpose "all agreements needing attention"
// list — narrowly the one review reason this phase actually tracks.
export async function listLegalReviewQueue(): Promise<AgreementSummaryRow[]> {
  const admin = createAdminClient();
  const rows = await fetchAgreementSummaries(admin, { jurisdictionReviewRequired: true }, 100);
  return rows.filter((row) => !isTerminalAgreementStatus(row.status));
}

export type AmendmentSummaryRow = {
  id: string;
  agreementId: string;
  agreementReference: string | null;
  amendmentNumber: number;
  reason: string;
  status: string;
  createdAt: string;
};

export async function listAmendmentsForAdmin(limit = 50): Promise<AmendmentSummaryRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreement_amendments")
    .select("id, agreement_id, amendment_number, reason, status, created_at, agreements(agreement_reference)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[legal] failed to load agreement amendments", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    agreementId: row.agreement_id,
    agreementReference: (row.agreements as unknown as { agreement_reference: string } | null)?.agreement_reference ?? null,
    amendmentNumber: row.amendment_number,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export type ReleaseSummaryRow = {
  id: string;
  agreementId: string;
  agreementReference: string | null;
  masterCode: string;
  usageRightsGranted: string[];
  aiSyntheticRightsGranted: string[];
  territory: string | null;
  duration: string | null;
  grantedAt: string;
};

export async function listReleasesForAdmin(limit = 50): Promise<ReleaseSummaryRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreement_releases")
    .select("id, agreement_id, master_code, usage_rights, ai_synthetic_rights, territory, duration, granted_at, agreements(agreement_reference)")
    .order("granted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[legal] failed to load agreement releases", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    agreementId: row.agreement_id,
    agreementReference: (row.agreements as unknown as { agreement_reference: string } | null)?.agreement_reference ?? null,
    masterCode: row.master_code,
    usageRightsGranted: Object.entries(row.usage_rights as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k),
    aiSyntheticRightsGranted: Object.entries(row.ai_synthetic_rights as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k),
    territory: row.territory,
    duration: row.duration,
    grantedAt: row.granted_at,
  }));
}

export type SignatureRequestSummaryRow = {
  id: string;
  agreementId: string;
  agreementReference: string | null;
  status: string;
  signatoryCount: number;
  signedCount: number;
  createdAt: string;
};

export async function listSignatureRequestsForAdmin(limit = 50): Promise<SignatureRequestSummaryRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signature_requests")
    .select("id, agreement_id, status, created_at, agreements(agreement_reference), signature_signatories(status)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[legal] failed to load signature requests", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const signatories = (row.signature_signatories as unknown as { status: string }[] | null) ?? [];
    return {
      id: row.id,
      agreementId: row.agreement_id,
      agreementReference: (row.agreements as unknown as { agreement_reference: string } | null)?.agreement_reference ?? null,
      status: row.status,
      signatoryCount: signatories.length,
      signedCount: signatories.filter((s) => s.status === "signed").length,
      createdAt: row.created_at,
    };
  });
}

export type LegalGovernanceOverviewCounts = {
  agreementsByStatus: Record<string, number>;
  totalAgreements: number;
  activeReleases: number;
  pendingReviewCount: number;
  signatureRequestsInProgress: number;
  signatureRequestsCompleted: number;
  amendmentsCount: number;
};

export async function getLegalGovernanceOverviewCounts(): Promise<LegalGovernanceOverviewCounts> {
  const admin = createAdminClient();

  const [{ data: agreements }, { count: releasesCount }, { data: signatureRequests }, { count: amendmentsCount }] = await Promise.all([
    admin.from("agreements").select("status, jurisdiction_review_required"),
    admin.from("agreement_releases").select("id", { count: "exact", head: true }),
    admin.from("signature_requests").select("status"),
    admin.from("agreement_amendments").select("id", { count: "exact", head: true }),
  ]);

  const agreementsByStatus: Record<string, number> = {};
  let pendingReviewCount = 0;
  for (const row of agreements ?? []) {
    agreementsByStatus[row.status] = (agreementsByStatus[row.status] ?? 0) + 1;
    if (row.jurisdiction_review_required && !isTerminalAgreementStatus(row.status as AgreementLifecycleStatus)) pendingReviewCount += 1;
  }

  let signatureRequestsInProgress = 0;
  let signatureRequestsCompleted = 0;
  for (const row of signatureRequests ?? []) {
    if (row.status === "completed") signatureRequestsCompleted += 1;
    else if (row.status !== "revoked" && row.status !== "cancelled") signatureRequestsInProgress += 1;
  }

  return {
    agreementsByStatus,
    totalAgreements: (agreements ?? []).length,
    activeReleases: releasesCount ?? 0,
    pendingReviewCount,
    signatureRequestsInProgress,
    signatureRequestsCompleted,
    amendmentsCount: amendmentsCount ?? 0,
  };
}

// Re-exported for the page's own use without a second import line.
export { isIssuedAgreementStatus };
