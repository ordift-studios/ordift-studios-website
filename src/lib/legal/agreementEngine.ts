import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { isValidAgreementLifecycleTransition, isIssuedAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";
import { formatAgreementReference } from "./agreementReference";
import { routeJurisdiction, requiresJurisdictionReview } from "./jurisdictionRouting";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E (2026-09-08).
// DB-backed Agreement Engine foundation. Nothing in this module is
// called by any real UI or workflow yet — it exists so the
// architecture can be exercised by tests and extended cleanly in a
// later, separately-authorized wiring phase (Admin UI / Client Portal
// / real generation). Authorized via GOVERNANCE_CAPABILITIES.
// contractAdminister — the same capability already governing legal
// master/version lifecycle transitions, since issuing/administering a
// real agreement is the same governance duty, one level down from
// template administration. Zero real authority_grants rows exist for
// it in Production — Super Admin is the only actor who can pass today.

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer legal agreements." };
  return { ok: true };
}

// Collision-safe by construction — nextval() on a real Postgres
// sequence is atomic; two concurrent callers can never receive the
// same number (Part 13's explicit requirement).
export async function generateNextAgreementReference(): Promise<string> {
  const admin = createAdminClient();
  // public.next_legal_agreement_reference_seq() (migration 0069) is a
  // thin RPC wrapper around a real Postgres sequence's nextval() — the
  // sequence name is a hardcoded literal inside that function body,
  // never built from caller input, so this is safe with zero injection
  // risk. Supabase-js has no first-class "call nextval on a sequence"
  // endpoint, hence the wrapper. If it's ever removed, this call fails
  // loudly rather than silently fabricating a sequence number.
  const { data, error } = await admin.rpc("next_legal_agreement_reference_seq");
  if (error || data === null || data === undefined) {
    throw new Error(`Failed to generate the next agreement reference sequence number: ${error?.message ?? "no value returned"}`);
  }
  const year = new Date().getFullYear();
  return formatAgreementReference(year, Number(data));
}

export type CreateDraftAgreementParams = {
  masterId: string;
  masterVersionId: string;
  classification: string;
  engagementJurisdiction: string | null;
  jurisdictionIsComplexOrConflicting?: boolean;
  primaryContextType?: string | null;
  primaryContextReference?: string | null;
  actorUserId: string;
};

export type CreateDraftAgreementResult = { ok: true; agreementId: string; agreementReference: string } | { ok: false; error: string };

// Creates a DRAFT agreement only — never issues, sends, or executes
// anything. jurisdiction routing runs at creation time so a draft
// starting out already flags jurisdiction_review_required when
// appropriate, rather than discovering it later at issuance.
export async function createDraftAgreement(params: CreateDraftAgreementParams): Promise<CreateDraftAgreementResult> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const routing = routeJurisdiction(params.engagementJurisdiction, params.jurisdictionIsComplexOrConflicting ?? false);
  const jurisdiction = routing.outcome === "routed" ? routing.jurisdiction : null;
  const jurisdictionReviewRequired = requiresJurisdictionReview(routing);

  const reference = await generateNextAgreementReference();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreements")
    .insert({
      agreement_reference: reference,
      master_id: params.masterId,
      master_version_id: params.masterVersionId,
      classification: params.classification,
      status: "draft",
      jurisdiction,
      jurisdiction_review_required: jurisdictionReviewRequired,
      primary_context_type: params.primaryContextType ?? null,
      primary_context_reference: params.primaryContextReference ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[legal] failed to create draft agreement", error?.message);
    return { ok: false, error: "Failed to create the draft agreement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.draft_created",
    entityType: "agreement",
    entityId: data.id,
    metadata: { agreementReference: reference, masterId: params.masterId, jurisdictionReviewRequired },
  });

  return { ok: true, agreementId: data.id, agreementReference: reference };
}

// Reusable across every agreement type (E.5 Stage 3B-3C) — a party is
// either a real Ordift account (profileId) or an external counterparty
// (name/email), matching agreement_parties' own schema exactly. No
// document-type-specific logic here; the same function adds the
// Employer/Employee parties for an Employee Employment Agreement or
// any future OS-LGL-0xx transaction agreement.
export async function addAgreementParty(params: {
  agreementId: string;
  partyRole: string;
  profileId?: string | null;
  externalName?: string | null;
  externalEmail?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; partyId: string } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;
  if (!params.profileId && !params.externalName) {
    return { ok: false, error: "A party requires either an existing account (profileId) or a name." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreement_parties")
    .insert({
      agreement_id: params.agreementId,
      party_role: params.partyRole,
      profile_id: params.profileId ?? null,
      external_name: params.externalName ?? null,
      external_email: params.externalEmail ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[legal] failed to add agreement party", error?.message);
    return { ok: false, error: "Failed to add this party to the agreement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.party_added",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { partyId: data.id, partyRole: params.partyRole },
  });

  return { ok: true, partyId: data.id };
}

// Transitions an agreement's lifecycle status — atomic compare-and-
// swap on the prior status, same idempotency pattern as
// transitionLegalDocumentVersionStatus()/advanceOnboardingStage().
// Refuses any transition isValidAgreementLifecycleTransition() doesn't
// allow. Stamps the matching timestamp column for the target status
// where one exists (Part 12's own named stages).
const STATUS_TIMESTAMP_COLUMN: Partial<Record<AgreementLifecycleStatus, string>> = {
  sent: "sent_at",
  viewed: "viewed_at",
  fully_executed: "executed_at",
  active: "active_at",
  completed: "completed_at",
  declined: "declined_at",
  cancelled: "cancelled_at",
  expired: "expired_at",
  terminated: "terminated_at",
};

export async function transitionAgreementStatus(params: {
  agreementId: string;
  toStatus: AgreementLifecycleStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("agreements").select("id, status").eq("id", params.agreementId).maybeSingle();
  if (!existing) return { ok: false, error: "Agreement not found." };

  const fromStatus = existing.status as AgreementLifecycleStatus;
  if (!isValidAgreementLifecycleTransition(fromStatus, params.toStatus)) {
    return { ok: false, error: `Cannot move an agreement from "${fromStatus}" to "${params.toStatus}".` };
  }

  const updates: Record<string, unknown> = { status: params.toStatus };
  const timestampColumn = STATUS_TIMESTAMP_COLUMN[params.toStatus];
  if (timestampColumn) updates[timestampColumn] = new Date().toISOString();
  if (params.toStatus === "approved_for_issue") updates.issued_at = new Date().toISOString();

  const { error } = await admin.from("agreements").update(updates).eq("id", params.agreementId).eq("status", fromStatus);
  if (error) {
    console.error("[legal] failed to transition agreement status", error.message);
    return { ok: false, error: "Failed to update the agreement status." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.status_changed",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { fromStatus, toStatus: params.toStatus, isIssued: isIssuedAgreementStatus(params.toStatus) },
  });

  return { ok: true };
}

// Freezes a commercial/legal snapshot onto an agreement — append-only,
// never updates an existing snapshot row. Reuses whatever real quote/
// booking data the caller already resolved (sourceReference) — this
// function never computes pricing itself.
export async function attachAgreementSnapshot(params: {
  agreementId: string;
  snapshotData: Record<string, unknown>;
  sourceReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreement_snapshots")
    .insert({
      agreement_id: params.agreementId,
      snapshot_data: params.snapshotData,
      source_reference: params.sourceReference ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[legal] failed to attach agreement snapshot", error?.message);
    return { ok: false, error: "Failed to attach the agreement snapshot." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.snapshot_attached",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { snapshotId: data.id, sourceReference: params.sourceReference ?? null },
  });

  return { ok: true, snapshotId: data.id };
}

// Records the SHA-256 of the exact issued artifact (Phase F's
// traceability chain: ISSUED ARTIFACT -> SHA-256). Set-once by design:
// refuses if a hash is already recorded, rather than silently
// overwriting what a signature process may already be bound to.
export async function recordIssuedDocumentHash(params: {
  agreementId: string;
  documentSha256: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  if (!/^[0-9a-f]{64}$/i.test(params.documentSha256)) {
    return { ok: false, error: "documentSha256 must be a well-formed SHA-256 hex digest." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("agreements").select("id, issued_document_sha256").eq("id", params.agreementId).maybeSingle();
  if (!existing) return { ok: false, error: "Agreement not found." };
  if (existing.issued_document_sha256) {
    return { ok: false, error: "An issued-document hash is already recorded for this agreement and cannot be overwritten." };
  }

  const { error } = await admin
    .from("agreements")
    .update({
      issued_document_sha256: params.documentSha256,
      issued_document_recorded_at: new Date().toISOString(),
      issued_document_recorded_by: params.actorUserId,
    })
    .eq("id", params.agreementId)
    .is("issued_document_sha256", null);
  if (error) {
    console.error("[legal] failed to record issued document hash", error.message);
    return { ok: false, error: "Failed to record the issued document hash." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.issued_document_hash_recorded",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { documentSha256: params.documentSha256 },
  });

  return { ok: true };
}

// Append-only amendment — never edits the original agreement row.
// amendment_number is resolved as (current max + 1) for this
// agreement, matching the append-only sequential pattern already used
// elsewhere in this codebase.
export async function createAgreementAmendment(params: {
  agreementId: string;
  reason: string;
  changes: Record<string, unknown>;
  actorUserId: string;
}): Promise<{ ok: true; amendmentId: string; amendmentNumber: number } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existingAgreement } = await admin.from("agreements").select("id, status").eq("id", params.agreementId).maybeSingle();
  if (!existingAgreement) return { ok: false, error: "Agreement not found." };
  if (!isIssuedAgreementStatus(existingAgreement.status as AgreementLifecycleStatus)) {
    return { ok: false, error: "An amendment can only be recorded against an agreement that has already been issued." };
  }

  const { data: existingAmendments } = await admin
    .from("agreement_amendments")
    .select("amendment_number")
    .eq("agreement_id", params.agreementId)
    .order("amendment_number", { ascending: false })
    .limit(1);
  const nextNumber = (existingAmendments?.[0]?.amendment_number ?? 0) + 1;

  const { data, error } = await admin
    .from("agreement_amendments")
    .insert({
      agreement_id: params.agreementId,
      amendment_number: nextNumber,
      reason: params.reason,
      changes: params.changes,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[legal] failed to create agreement amendment", error?.message);
    return { ok: false, error: "Failed to create the amendment." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.amendment_created",
    entityType: "agreement",
    entityId: params.agreementId,
    metadata: { amendmentId: data.id, amendmentNumber: nextNumber },
  });

  return { ok: true, amendmentId: data.id, amendmentNumber: nextNumber };
}
