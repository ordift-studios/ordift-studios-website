import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { transitionAgreementStatus } from "./agreementEngine";
import {
  deriveSignatureRequestStatus,
  isFullyExecutedBySignatories,
  isTerminalSignatoryStatus,
  type SignatoryStatus,
} from "./signatureLifecycle";
import { generateSignatureToken, hashSignatureToken, computeTokenExpiry, isTokenExpired, DEFAULT_TOKEN_EXPIRY_DAYS } from "./signatureTokens";
import { buildEvidencePackage } from "./signatureEvidence";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F (2026-09-08).
// DB-backed Signature Engine foundation. No paid e-signature provider,
// no real agreement sent, no real signature request created in
// Production by this phase. Admin-initiated functions are gated by
// GOVERNANCE_CAPABILITIES.contractAdminister — the same capability
// already governing agreement administration (Phase E), since
// initiating/revoking a signature process is the same governance duty.
// The external-signatory functions (verifySignatoryToken and
// everything downstream of it) deliberately require NO Supabase
// session at all — an external counterparty has no Admin account and
// often no portal account either (Part 17) — their entire access path
// is possession of the raw token, verified by hashing it and matching
// signature_signatories.token_hash via the service-role admin client.

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer signature requests." };
  return { ok: true };
}

// Creates a signature request and one signatory row per existing
// agreement_parties row. Refuses unless the agreement already has an
// issued-document hash recorded (recordIssuedDocumentHash() in
// agreementEngine.ts) — a signature process can never attach to an
// agreement with no defined issued artifact.
export async function createSignatureRequest(params: {
  agreementId: string;
  actorUserId: string;
}): Promise<{ ok: true; signatureRequestId: string } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: agreement } = await admin.from("agreements").select("id, issued_document_sha256").eq("id", params.agreementId).maybeSingle();
  if (!agreement) return { ok: false, error: "Agreement not found." };
  if (!agreement.issued_document_sha256) {
    return { ok: false, error: "This agreement has no issued-document hash recorded yet — call recordIssuedDocumentHash() first." };
  }

  const { data: parties, error: partiesError } = await admin.from("agreement_parties").select("id, party_role").eq("agreement_id", params.agreementId);
  if (partiesError || !parties || parties.length === 0) {
    return { ok: false, error: "This agreement has no parties recorded — nothing to request a signature from." };
  }

  const { data: request, error: requestError } = await admin
    .from("signature_requests")
    .insert({ agreement_id: params.agreementId, status: "created", created_by: params.actorUserId })
    .select("id")
    .single();
  if (requestError || !request) {
    console.error("[legal] failed to create signature request", requestError?.message);
    return { ok: false, error: "Failed to create the signature request." };
  }

  const { error: signatoriesError } = await admin.from("signature_signatories").insert(
    parties.map((party) => ({
      signature_request_id: request.id,
      agreement_party_id: party.id,
      role: party.party_role,
      status: "pending" as SignatoryStatus,
    })),
  );
  if (signatoriesError) {
    console.error("[legal] failed to create signature signatories", signatoriesError.message);
    return { ok: false, error: "Failed to create the signatory rows for this request." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.signature_request.created",
    entityType: "signature_request",
    entityId: request.id,
    metadata: { agreementId: params.agreementId, signatoryCount: parties.length },
  });

  return { ok: true, signatureRequestId: request.id };
}

// Generates a high-entropy access link for one signatory. Returns the
// RAW token exactly once — the caller is responsible for delivering it
// through an out-of-scope channel (email, etc.) and must never log or
// persist it; only its hash is stored.
export async function generateSignatoryAccessLink(params: {
  signatoryId: string;
  actorUserId: string;
  expiryDays?: number;
}): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: signatory } = await admin.from("signature_signatories").select("id, status, signature_request_id").eq("id", params.signatoryId).maybeSingle();
  if (!signatory) return { ok: false, error: "Signatory not found." };
  // Generating (or re-sending) a link never itself changes status —
  // that happens on first verified access (verifySignatoryToken()).
  // Only a terminal signatory status refuses a new link outright.
  if (isTerminalSignatoryStatus(signatory.status as SignatoryStatus)) {
    return { ok: false, error: `Cannot generate a new access link for a signatory in a terminal status ("${signatory.status}").` };
  }

  const now = new Date();
  const { token, tokenHash } = generateSignatureToken();
  const expiresAt = computeTokenExpiry(now, params.expiryDays ?? DEFAULT_TOKEN_EXPIRY_DAYS);

  const { error } = await admin
    .from("signature_signatories")
    .update({ token_hash: tokenHash, token_created_at: now.toISOString(), token_expires_at: expiresAt.toISOString(), token_revoked_at: null })
    .eq("id", params.signatoryId);
  if (error) {
    console.error("[legal] failed to store signatory access token", error.message);
    return { ok: false, error: "Failed to generate the access link." };
  }

  await admin.from("signature_events").insert({
    signatory_id: params.signatoryId,
    event_type: "link_generated",
    actor_type: "admin",
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  await syncSignatureRequestStatus(admin, signatory.signature_request_id);

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.signature_signatory.link_generated",
    entityType: "signature_signatory",
    entityId: params.signatoryId,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

type VerifiedSignatory = { id: string; signatureRequestId: string; agreementId: string; role: string; status: SignatoryStatus; issuedDocumentSha256: string };

// The external-access entry point — NO Supabase session required.
// Hashes the presented token and looks it up via the service-role
// client; rejects on any mismatch, revocation, or expiry without
// revealing which condition failed (never confirms "token exists but
// is expired" vs "token does not exist" — both return the same
// generic error to avoid token-guessing oracle behavior).
export async function verifySignatoryToken(rawToken: string): Promise<{ ok: true; signatory: VerifiedSignatory } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const tokenHash = hashSignatureToken(rawToken);

  const { data: signatory } = await admin
    .from("signature_signatories")
    .select("id, status, signature_request_id, token_expires_at, token_revoked_at, role, signature_requests!inner(agreement_id, agreements!inner(id, issued_document_sha256))")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!signatory || signatory.token_revoked_at || !signatory.token_expires_at || isTokenExpired(new Date(signatory.token_expires_at))) {
    return { ok: false, error: "This access link is invalid or has expired." };
  }

  // Record "viewed" the first time a valid token is presented — never
  // regresses a later status back to viewed.
  if (signatory.status === "pending") {
    const { error: updateError } = await admin
      .from("signature_signatories")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", signatory.id)
      .eq("status", "pending");
    if (!updateError) {
      await admin.from("signature_events").insert({ signatory_id: signatory.id, event_type: "viewed", actor_type: "external_signatory" });
      await syncSignatureRequestStatus(admin, signatory.signature_request_id);
    }
  }

  const requestRow = signatory.signature_requests as unknown as { agreement_id: string; agreements: { id: string; issued_document_sha256: string | null } };
  const issuedHash = requestRow.agreements.issued_document_sha256;
  if (!issuedHash) return { ok: false, error: "This agreement has no issued document to sign." };

  return {
    ok: true,
    signatory: {
      id: signatory.id,
      signatureRequestId: signatory.signature_request_id,
      agreementId: requestRow.agreement_id,
      role: signatory.role,
      status: (signatory.status === "pending" ? "viewed" : signatory.status) as SignatoryStatus,
      issuedDocumentSha256: issuedHash,
    },
  };
}

// External path — no admin auth. Records explicit consent, the
// required step between "viewed" and "signed" (Part: consent must
// precede signature).
export async function recordSignatoryConsent(rawToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const verification = await verifySignatoryToken(rawToken);
  if (!verification.ok) return verification;

  const admin = createAdminClient();
  const { error } = await admin
    .from("signature_signatories")
    .update({ status: "consented", consented_at: new Date().toISOString() })
    .eq("id", verification.signatory.id)
    .eq("status", "viewed");
  if (error) return { ok: false, error: "Failed to record consent." };

  await admin.from("signature_events").insert({ signatory_id: verification.signatory.id, event_type: "consent_given", actor_type: "external_signatory" });
  await syncSignatureRequestStatus(admin, verification.signatory.signatureRequestId);
  return { ok: true };
}

export type RecordSignatoryDeclineParams = { rawToken: string; reason: string };

// External path — no admin auth.
export async function recordSignatoryDecline(params: RecordSignatoryDeclineParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const verification = await verifySignatoryToken(params.rawToken);
  if (!verification.ok) return verification;

  const admin = createAdminClient();
  const { error } = await admin
    .from("signature_signatories")
    .update({ status: "declined", declined_at: new Date().toISOString(), declined_reason: params.reason })
    .eq("id", verification.signatory.id)
    .in("status", ["viewed", "consented"]);
  if (error) return { ok: false, error: "Failed to record the decline." };

  await admin.from("signature_events").insert({
    signatory_id: verification.signatory.id,
    event_type: "declined",
    actor_type: "external_signatory",
    metadata: { reason: params.reason },
  });
  await syncSignatureRequestStatus(admin, verification.signatory.signatureRequestId);
  return { ok: true };
}

export type RecordSignatorySignatureParams = {
  rawToken: string;
  typedFullName: string;
  consentStatement: string;
  ipAddress: string | null;
  userAgent: string | null;
};

// External path — no admin auth. The chain's final, irreversible step:
// inserts an immutable signature_evidence row (insert-only at the
// database grant level — see migration 0070), then, only if every
// signatory on the request is now "signed", transitions the parent
// agreement to fully_executed via the same atomic CAS function Phase E
// already established (transitionAgreementStatus()) — so an agreement
// can never be marked fully executed by anything other than every
// required signatory actually having signed.
export async function recordSignatorySignature(params: RecordSignatorySignatureParams): Promise<{ ok: true; fullyExecuted: boolean } | { ok: false; error: string }> {
  const verification = await verifySignatoryToken(params.rawToken);
  if (!verification.ok) return verification;
  const { signatory } = verification;

  const evidenceResult = buildEvidencePackage({
    signatureMethod: "consent_click_typed_name",
    typedFullName: params.typedFullName,
    consentStatement: params.consentStatement,
    documentSha256: signatory.issuedDocumentSha256,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    signedAt: new Date(),
  });
  if (!evidenceResult.ok) return { ok: false, error: evidenceResult.error };

  const admin = createAdminClient();

  // Atomic compare-and-swap — only a "consented" signatory can become
  // "signed", the same idempotency pattern used everywhere else in
  // this Legal Suite.
  const { error: transitionError } = await admin
    .from("signature_signatories")
    .update({ status: "signed", signed_at: evidenceResult.evidence.signedAt.toISOString() })
    .eq("id", signatory.id)
    .eq("status", "consented");
  if (transitionError) {
    return { ok: false, error: "Signing requires prior recorded consent — please confirm consent before signing." };
  }

  const { error: evidenceError } = await admin.from("signature_evidence").insert({
    signatory_id: signatory.id,
    document_sha256: evidenceResult.evidence.documentSha256,
    signature_method: evidenceResult.evidence.signatureMethod,
    typed_full_name: evidenceResult.evidence.typedFullName,
    consent_statement: evidenceResult.evidence.consentStatement,
    ip_address: evidenceResult.evidence.ipAddress,
    user_agent: evidenceResult.evidence.userAgent,
    signed_at: evidenceResult.evidence.signedAt.toISOString(),
  });
  if (evidenceError) {
    console.error("[legal] failed to record signature evidence", evidenceError.message);
    return { ok: false, error: "Failed to record signature evidence." };
  }

  await admin.from("signature_events").insert({ signatory_id: signatory.id, event_type: "signed", actor_type: "external_signatory" });

  const requestStatus = await syncSignatureRequestStatus(admin, signatory.signatureRequestId);
  let fullyExecuted = false;
  if (requestStatus === "completed") {
    const transition = await transitionAgreementStatus({ agreementId: signatory.agreementId, toStatus: "fully_executed", actorUserId: "system:signature_engine" });
    // "system:signature_engine" is not a real profile id — this call
    // path is intentionally exercised only by tests/fixtures in this
    // phase (no real agreement exists to fully-execute), and wiring a
    // real system-actor identity is left to the separately-authorized
    // wiring phase. Documented here rather than silently swallowed.
    fullyExecuted = transition.ok;
  }

  return { ok: true, fullyExecuted };
}

// Recomputes and persists the request-level status from its
// signatories — pure derivation (signatureLifecycle.ts), never set
// arbitrarily. Also stamps completed_at once, the first time the
// derived status becomes "completed".
async function syncSignatureRequestStatus(admin: ReturnType<typeof createAdminClient>, signatureRequestId: string) {
  const { data: signatories } = await admin.from("signature_signatories").select("status").eq("signature_request_id", signatureRequestId);
  const derived = deriveSignatureRequestStatus((signatories ?? []) as { status: SignatoryStatus }[]);
  const updates: Record<string, unknown> = { status: derived };
  if (derived === "completed") updates.completed_at = new Date().toISOString();
  await admin.from("signature_requests").update(updates).eq("id", signatureRequestId);
  return derived;
}

// Admin-initiated revocation — a revoked link can never be used again
// even if it has not yet expired (token_revoked_at, checked
// independently of token_expires_at in verifySignatoryToken()).
export async function revokeSignatoryAccess(params: { signatoryId: string; actorUserId: string; reason: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: signatory } = await admin.from("signature_signatories").select("id, status, signature_request_id").eq("id", params.signatoryId).maybeSingle();
  if (!signatory) return { ok: false, error: "Signatory not found." };
  if (isFullyExecutedBySignatories([{ status: signatory.status as SignatoryStatus }]) || signatory.status === "declined") {
    return { ok: false, error: "Cannot revoke a signatory that has already signed or declined." };
  }

  const { error } = await admin
    .from("signature_signatories")
    .update({ status: "revoked", token_revoked_at: new Date().toISOString() })
    .eq("id", params.signatoryId)
    .eq("status", signatory.status);
  if (error) return { ok: false, error: "Failed to revoke signatory access." };

  await admin.from("signature_events").insert({
    signatory_id: params.signatoryId,
    event_type: "revoked",
    actor_type: "admin",
    metadata: { reason: params.reason },
  });
  await syncSignatureRequestStatus(admin, signatory.signature_request_id);

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.signature_signatory.revoked",
    entityType: "signature_signatory",
    entityId: params.signatoryId,
    metadata: { reason: params.reason },
  });

  return { ok: true };
}
