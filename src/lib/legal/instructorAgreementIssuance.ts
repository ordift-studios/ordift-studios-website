import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { attachAgreementSnapshot, recordIssuedDocumentHash, transitionAgreementStatus } from "./agreementEngine";
import { createSignatureRequest, generateSignatoryAccessLink } from "./signatureEngine";
import { composeInstructorAgreementText, type InstructorSnapshot } from "./instructorAgreementDocument";
import { missingScheduleATerms, validateScheduleATerms, type ScheduleATerms } from "./instructorAgreementTerms";
import { loadVersion, verifyStoredMasterIntegrity } from "./masterRegistryActions";
import { deriveMasterContentReference } from "./masterContentReference";
import { loadAgreementReadiness } from "./agreementReadinessData";
import { resolveOnboardingLegalContext, OS_LGL_010, INSTRUCTOR_CONTEXT_TYPE } from "./instructorAgreements";
import { sendEmail } from "@/lib/shared/email/dispatch";

// OS-LGL-010 Instructor Agreement: Schedule A terms -> preview -> approve for issue -> issue for signature. Reuses the generic agreement engine,
// signature engine, issued-document bucket, hash recording and the existing token-based /legal/sign review page. Nothing here signs anything:
// execution happens only when each signatory signs through the signature engine, which alone moves the agreement to fully_executed.

const ISSUED_DOCUMENTS_BUCKET = "issued-agreement-documents";
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: string[] };

async function requireAuthority(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  return auth.ok ? { ok: true } : { ok: false, error: "Not authorized to administer this agreement." };
}

type AgreementRow = { id: string; status: string; agreement_reference: string; master_id: string; master_version_id: string; issued_document_sha256: string | null; primary_context_reference: string | null; primary_context_type: string | null };

// The agreement must be THIS onboarding's OS-LGL-010 agreement (never another person's, never another document type).
async function loadOwnedAgreement(onboardingId: string, agreementId: string): Promise<{ agreement: AgreementRow; snapshot: InstructorSnapshot; profileId: string } | { error: string }> {
  const admin = createAdminClient();
  const ctx = await resolveOnboardingLegalContext(onboardingId);
  if (!ctx) return { error: "Onboarding record not found." };
  const { data: a } = await admin.from("agreements").select("id, status, agreement_reference, master_id, master_version_id, issued_document_sha256, primary_context_reference, primary_context_type").eq("id", agreementId).maybeSingle();
  if (!a || a.primary_context_type !== INSTRUCTOR_CONTEXT_TYPE || a.primary_context_reference !== ctx.profileId) return { error: "This agreement does not belong to this onboarding." };
  const { data: master } = await admin.from("legal_document_masters").select("canonical_code").eq("id", a.master_id as string).maybeSingle();
  if (master?.canonical_code !== OS_LGL_010) return { error: "This is not an Instructor / Workshop Facilitator Agreement." };
  const { data: snap } = await admin.from("agreement_snapshots").select("snapshot_data").eq("agreement_id", agreementId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!snap) return { error: "No verified particulars were frozen for this agreement." };
  return { agreement: a as AgreementRow, snapshot: snap.snapshot_data as InstructorSnapshot, profileId: ctx.profileId };
}

// The master text comes from the stored, registered, activated master - re-verified byte for byte now.
async function loadVerifiedMasterText(versionId: string): Promise<{ ok: true; text: string; version: string } | { ok: false; error: string }> {
  const loaded = await loadVersion(versionId);
  if (!loaded) return { ok: false, error: "The legal master version was not found." };
  const { v } = loaded;
  if (v.status !== "active") return { ok: false, error: "The OS-LGL-010 template is not active, so no agreement can be composed from it." };
  const integrity = await verifyStoredMasterIntegrity(v);
  if (!integrity.ok) return { ok: false, error: `${integrity.error}` };
  if (integrity.markers > 0) return { ok: false, error: "The stored master contains unresolved counsel-review markers." };
  const expected = deriveMasterContentReference({ code: OS_LGL_010, version: "1.0", docxPath: v.master_docx_storage_path!, docxSha256: v.master_docx_sha256!, pdfPath: v.master_pdf_storage_path!, pdfSha256: v.master_pdf_sha256! });
  if (v.content_reference !== expected.contentReference || v.document_hash !== expected.documentHash) return { ok: false, error: "The registered content reference does not match the stored master." };
  return { ok: true, text: integrity.text, version: "1.0" };
}

// Exactly what would be issued, from the current frozen particulars. Read-only.
export async function previewInstructorAgreement(onboardingId: string, agreementId: string): Promise<Result<{ text: string; sha256: string }> | { ok: false; error: string; missing: string[] }> {
  const owned = await loadOwnedAgreement(onboardingId, agreementId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const master = await loadVerifiedMasterText(owned.agreement.master_version_id);
  if (!master.ok) return master;
  const composed = composeInstructorAgreementText({ masterText: master.text, masterVersion: master.version, snapshot: owned.snapshot });
  if (!composed.ok) return { ok: false, error: "Required particulars are missing, so the document cannot be previewed.", missing: composed.missing };
  return { ok: true, text: composed.text, sha256: createHash("sha256").update(composed.text, "utf8").digest("hex") };
}

// ------------------------------------------------------------------ 1. state the Schedule A terms (draft only; appends a new frozen snapshot)
export async function saveInstructorScheduleA(params: { onboardingId: string; agreementId: string; terms: Partial<ScheduleATerms>; actorUserId: string }): Promise<Result> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return auth;
  const owned = await loadOwnedAgreement(params.onboardingId, params.agreementId);
  if ("error" in owned) return { ok: false, error: owned.error };
  if (owned.agreement.status !== "draft") return { ok: false, error: `The terms can be changed only while the agreement is a draft (it is “${owned.agreement.status}”).` };
  const verdict = validateScheduleATerms(params.terms, new Date().toISOString().slice(0, 10));
  if (!verdict.ok) return { ok: false, error: verdict.errors[0], errors: verdict.errors };
  const saved = await attachAgreementSnapshot({ agreementId: params.agreementId, snapshotData: { ...owned.snapshot, scheduleA: verdict.terms }, sourceReference: `staff_onboarding:${params.onboardingId}:schedule_a`, actorUserId: params.actorUserId });
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

// ------------------------------------------------------------------ 2. approve this exact document for issue
export async function approveInstructorAgreementForIssue(params: { onboardingId: string; agreementId: string; actorUserId: string }): Promise<Result> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return auth;
  const owned = await loadOwnedAgreement(params.onboardingId, params.agreementId);
  if ("error" in owned) return { ok: false, error: owned.error };
  if (!["draft", "internal_review"].includes(owned.agreement.status)) return { ok: false, error: `Only a draft can be approved for issue (it is “${owned.agreement.status}”).` };

  // Every legal prerequisite must STILL hold now (approval date, registered and active master, confirmed entity, documented signatory).
  const ctx = await resolveOnboardingLegalContext(params.onboardingId);
  const readiness = ctx ? await loadAgreementReadiness({ onboardingId: params.onboardingId, canonicalCode: OS_LGL_010, jurisdictionName: ctx.jurisdictionName, jurisdictionSource: "the Founder-approved requisition", recordedEntityId: ctx.recordedEntityId }) : null;
  if (!readiness?.canIssue) return { ok: false, error: "The legal prerequisites are not all verified, so the agreement cannot be approved for issue.", errors: (readiness?.unresolved ?? []).map((c) => c.label) };

  // The Ordift signatory must be able to sign: the party needs a linked Ordift account to receive a secure link.
  const admin = createAdminClient();
  const { data: parties } = await admin.from("agreement_parties").select("party_role, profile_id").eq("agreement_id", params.agreementId);
  const ordift = (parties ?? []).find((p) => p.party_role === "ordift");
  const instructor = (parties ?? []).find((p) => p.party_role === "instructor");
  if (!instructor?.profile_id) return { ok: false, error: "The instructor has no linked account to receive a secure signing link." };
  if (!ordift?.profile_id) return { ok: false, error: "The Ordift signatory is not linked to an Ordift account, so no secure signing link can be delivered to them. Record the signatory with their verified account linked." };

  const preview = await previewInstructorAgreement(params.onboardingId, params.agreementId);
  if (!preview.ok) return { ok: false, error: preview.error, errors: "missing" in preview ? preview.missing : undefined };

  if (owned.agreement.status === "draft") {
    const t = await transitionAgreementStatus({ agreementId: params.agreementId, toStatus: "internal_review", actorUserId: params.actorUserId });
    if (!t.ok) return { ok: false, error: t.error };
  }
  const t2 = await transitionAgreementStatus({ agreementId: params.agreementId, toStatus: "approved_for_issue", actorUserId: params.actorUserId });
  if (!t2.ok) return { ok: false, error: t2.error };
  await logActivity({ actorUserId: params.actorUserId, action: "legal.instructor_agreement.approved_for_issue", entityType: "agreement", entityId: params.agreementId, metadata: { previewSha256: preview.sha256 } });
  return { ok: true };
}

// ------------------------------------------------------------------ 3. issue for signature (resumable; moves to "sent" only as the LAST step)
type IssueStep = "authorise" | "compose_and_hash" | "signature_request" | "deliver_access_links" | "transition_to_sent";
export async function issueInstructorAgreement(params: { onboardingId: string; agreementId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string; step: IssueStep }> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return { ok: false, error: auth.error, step: "authorise" };
  const owned = await loadOwnedAgreement(params.onboardingId, params.agreementId);
  if ("error" in owned) return { ok: false, error: owned.error, step: "authorise" };
  const agreement = owned.agreement;
  if (agreement.status !== "approved_for_issue") return { ok: false, error: `Agreement must be approved for issue first (it is “${agreement.status}”).`, step: "compose_and_hash" };
  const admin = createAdminClient();

  if (!agreement.issued_document_sha256) {
    const preview = await previewInstructorAgreement(params.onboardingId, params.agreementId);
    if (!preview.ok) return { ok: false, error: preview.error, step: "compose_and_hash" };
    const { error: uploadError } = await admin.storage.from(ISSUED_DOCUMENTS_BUCKET).upload(`${agreement.id}.txt`, Buffer.from(preview.text, "utf8"), { contentType: "text/plain", upsert: false });
    if (uploadError) { console.error("[legal] failed to store issued instructor agreement", uploadError.message); return { ok: false, error: "Failed to store the issued agreement document.", step: "compose_and_hash" }; }
    const hashed = await recordIssuedDocumentHash({ agreementId: agreement.id, documentSha256: preview.sha256, actorUserId: params.actorUserId });
    if (!hashed.ok) return { ok: false, error: hashed.error, step: "compose_and_hash" };
  }

  const { data: existing } = await admin.from("signature_requests").select("id").eq("agreement_id", agreement.id).maybeSingle();
  let requestId = (existing?.id as string | undefined) ?? null;
  if (!requestId) {
    const created = await createSignatureRequest({ agreementId: agreement.id, actorUserId: params.actorUserId });
    if (!created.ok) return { ok: false, error: created.error, step: "signature_request" };
    requestId = created.signatureRequestId;
  }

  const { data: signatories } = await admin.from("signature_signatories").select("id, role, token_hash, agreement_parties(profile_id)").eq("signature_request_id", requestId);
  for (const s of signatories ?? []) {
    if (s.token_hash) continue;
    const profileId = (s.agreement_parties as unknown as { profile_id: string | null } | null)?.profile_id;
    if (!profileId) return { ok: false, error: `The “${s.role}” signatory has no linked account to deliver a secure link to.`, step: "deliver_access_links" };
    const { data: authUser } = await admin.auth.admin.getUserById(profileId);
    const email = authUser?.user?.email;
    if (!email) return { ok: false, error: `The “${s.role}” signatory's account has no email on file.`, step: "deliver_access_links" };
    const link = await generateSignatoryAccessLink({ signatoryId: s.id as string, actorUserId: params.actorUserId });
    if (!link.ok) return { ok: false, error: link.error, step: "deliver_access_links" };
    const signUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://ordiftstudios.com"}/legal/sign/${link.token}`;
    const sent = await sendEmail({
      to: email,
      subject: `${agreement.agreement_reference} — Instructor / Workshop Facilitator Agreement ready for your review`,
      html: `<p>An Instructor / Workshop Facilitator Agreement (${agreement.agreement_reference}) is ready for your review and signature.</p><p><a href="${signUrl}">Review and sign →</a></p><p>This link expires ${link.expiresAt}.</p>`,
      text: `An Instructor / Workshop Facilitator Agreement (${agreement.agreement_reference}) is ready for your review and signature.\n\nReview and sign: ${signUrl}\n\nThis link expires ${link.expiresAt}.`,
      logPrefix: "[legal instructor agreement issuance]",
      emailType: "instructor_agreement_signature_request",
      referenceNumber: agreement.agreement_reference,
    });
    if (!sent.ok) return { ok: false, error: `Failed to deliver the secure link to the “${s.role}” signatory.`, step: "deliver_access_links" };
  }

  const { data: final } = await admin.from("signature_signatories").select("token_hash").eq("signature_request_id", requestId);
  if (!(final ?? []).length || !(final ?? []).every((s) => s.token_hash)) return { ok: false, error: "Not every signatory has a delivered secure link yet.", step: "deliver_access_links" };
  const t = await transitionAgreementStatus({ agreementId: agreement.id, toStatus: "sent", actorUserId: params.actorUserId });
  if (!t.ok) return { ok: false, error: t.error, step: "transition_to_sent" };
  await logActivity({ actorUserId: params.actorUserId, action: "legal.instructor_agreement.issued_and_sent", entityType: "agreement", entityId: agreement.id, metadata: { agreementReference: agreement.agreement_reference, documentSha256: agreement.issued_document_sha256 ?? null } });
  return { ok: true };
}

// ------------------------------------------------------------------ read model for the workspace
export type SigningProgress = { role: string; status: string; signedAt: string | null; linkExpiresAt: string | null; evidenceSha256: string | null }[];
export async function loadInstructorSigningProgress(agreementId: string): Promise<SigningProgress> {
  const admin = createAdminClient();
  const { data: req } = await admin.from("signature_requests").select("id").eq("agreement_id", agreementId).maybeSingle();
  if (!req) return [];
  const { data: sigs } = await admin.from("signature_signatories").select("id, role, status, signed_at, token_expires_at").eq("signature_request_id", req.id as string);
  const out: SigningProgress = [];
  for (const s of sigs ?? []) {
    const { data: ev } = await admin.from("signature_evidence").select("document_sha256").eq("signatory_id", s.id as string).maybeSingle();
    out.push({ role: s.role as string, status: s.status as string, signedAt: (s.signed_at as string | null) ?? null, linkExpiresAt: (s.token_expires_at as string | null) ?? null, evidenceSha256: (ev?.document_sha256 as string | null) ?? null });
  }
  return out;
}

export { missingScheduleATerms };
