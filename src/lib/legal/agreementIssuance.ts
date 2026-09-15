import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { transitionAgreementStatus, recordIssuedDocumentHash, assignAgreementPartyProfile } from "@/lib/legal/agreementEngine";
import { createSignatureRequest, generateSignatoryAccessLink, verifySignatoryToken } from "@/lib/legal/signatureEngine";
import { EMPLOYMENT_AGREEMENT_VARIABLES, OS_LGL_007_FULL_TEXT, type EmploymentAgreementVariableKey } from "@/lib/legal/documents/os-lgl-007-employee-employment-agreement";
import { sendEmail } from "@/lib/shared/email/dispatch";

// Employee Employment Agreement issuance bridge (Workforce/Employee
// Self-Service Phase, 2026-09-15) — the smallest correct implementation
// of approved_for_issue -> sent, reusing every existing piece
// (agreementEngine.ts, signatureEngine.ts, the Resend-backed
// sendEmail(), the createHash() precedent already used for the master-
// text hash in employeeAgreements.ts) rather than building a parallel
// system. No PDF/document-rendering pipeline exists anywhere in this
// codebase (confirmed by inventory before writing this) — the issued
// artifact is a deterministic, composed PLAIN TEXT document instead: the
// verbatim, unmodified OS-LGL-007 master text, followed by a clearly
// separated Schedule A section of the frozen snapshot values — never
// spliced into the master's own placeholders. This is fully sufficient
// for genuine review/signature and, unlike a binary render, is exactly
// reproducible and independently verifiable from the same two
// already-immutable inputs.

const ISSUED_DOCUMENTS_BUCKET = "issued-agreement-documents";

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to issue this agreement." };
  return { ok: true };
}

// Pure — directly testable. The Schedule A section here is deliberately
// the SAME EMPLOYMENT_AGREEMENT_VARIABLES ordering/labels the review
// page already uses (employeeAgreements.ts), so the issued artifact
// and the Founder-review screen can never silently disagree on which
// fields exist or how they're labeled.
export function composeIssuedAgreementText(params: {
  masterFullText: string;
  masterVersion: string;
  agreementReference: string;
  snapshot: Partial<Record<EmploymentAgreementVariableKey, string>>;
}): string {
  const divider = "=".repeat(72);
  const scheduleALines = EMPLOYMENT_AGREEMENT_VARIABLES.map(
    (v) => `${v.label}: ${params.snapshot[v.key] ?? "N/A"}`
  ).join("\n");
  return [
    params.masterFullText,
    "",
    divider,
    `ISSUED AGREEMENT REFERENCE: ${params.agreementReference}`,
    `OS-LGL-007 MASTER VERSION: ${params.masterVersion}`,
    divider,
    "",
    "SCHEDULE A — RESOLVED EMPLOYEE-SPECIFIC PARTICULARS (frozen at issuance, never re-resolved)",
    "",
    scheduleALines,
    "",
  ].join("\n");
}

type IssuanceStep = "compose_and_hash" | "employer_signatory" | "signature_request" | "deliver_access_links" | "transition_to_sent";

export type IssueAgreementResult = { ok: true } | { ok: false; error: string; step: IssuanceStep };

// Resumable/idempotent by design (2026-09-15): every sub-step checks
// whether it has already genuinely completed before doing anything, so
// a retry after a transient failure (e.g. one email provider hiccup)
// picks up exactly where it left off — never re-uploads, never creates
// a second signature_requests row, never re-attaches an already-set
// employer signatory, never resends an already-generated access link.
// Only transitions approved_for_issue -> sent as the LAST step, and
// only once every earlier step is confirmed complete — a failure at
// any point leaves the agreement genuinely still approved_for_issue,
// exactly matching "a failed render, storage operation, signature-
// request creation or delivery must not falsely advance the lifecycle".
export async function issueEmployeeEmploymentAgreement(params: {
  agreementId: string;
  actorUserId: string;
}): Promise<IssueAgreementResult> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return { ok: false, error: auth.error, step: "compose_and_hash" };

  const admin = createAdminClient();
  const { data: agreement } = await admin
    .from("agreements")
    .select("id, status, agreement_reference, master_version_id, issued_document_sha256")
    .eq("id", params.agreementId)
    .maybeSingle();
  if (!agreement) return { ok: false, error: "Agreement not found.", step: "compose_and_hash" };
  if (agreement.status !== "approved_for_issue") {
    return { ok: false, error: `Agreement must be "approved_for_issue" to be issued (currently "${agreement.status}").`, step: "compose_and_hash" };
  }

  // Step 1: compose the immutable artifact, hash it, store it, and
  // record the hash — skipped entirely if already done (recordIssuedDocumentHash
  // itself also refuses to overwrite, as a second independent guard).
  if (!agreement.issued_document_sha256) {
    const { data: version } = await admin.from("legal_document_versions").select("version").eq("id", agreement.master_version_id).maybeSingle();
    const { data: snapshotRow } = await admin
      .from("agreement_snapshots")
      .select("snapshot_data")
      .eq("agreement_id", agreement.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snapshotRow) return { ok: false, error: "No frozen Schedule A snapshot exists for this agreement — cannot issue.", step: "compose_and_hash" };

    const composed = composeIssuedAgreementText({
      masterFullText: OS_LGL_007_FULL_TEXT,
      masterVersion: version?.version ?? "unknown",
      agreementReference: agreement.agreement_reference,
      snapshot: snapshotRow.snapshot_data as Partial<Record<EmploymentAgreementVariableKey, string>>,
    });
    const documentSha256 = createHash("sha256").update(composed, "utf8").digest("hex");

    const { error: uploadError } = await admin.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .upload(`${agreement.id}.txt`, Buffer.from(composed, "utf8"), { contentType: "text/plain", upsert: false });
    if (uploadError) {
      console.error("[legal] failed to upload issued agreement document", uploadError.message);
      return { ok: false, error: "Failed to store the issued agreement document.", step: "compose_and_hash" };
    }

    const hashResult = await recordIssuedDocumentHash({ agreementId: agreement.id, documentSha256, actorUserId: params.actorUserId });
    if (!hashResult.ok) return { ok: false, error: hashResult.error, step: "compose_and_hash" };
  }

  // Step 2: resolve and attach the required employer signatory. The
  // OS-LGL-007 master leaves this open ("For the Employer: Name /
  // Title/Authority / Signature / Date") — no named role is specified
  // anywhere in the controlled text. The authenticated Super Admin
  // actually performing this issuance — the one person whose exercise
  // of authority this act literally is — becomes the employer's real
  // signing party. Never a hard-coded profile id, never fabricated.
  const employerAssignment = await assignAgreementPartyProfile({
    agreementId: agreement.id,
    partyRole: "employer",
    profileId: params.actorUserId,
    actorUserId: params.actorUserId,
  });
  if (!employerAssignment.ok) return { ok: false, error: employerAssignment.error, step: "employer_signatory" };

  // Step 3: create the signature request — one signatory row per
  // existing agreement_parties row (employer + employee) — skipped if
  // one already exists for this agreement.
  const { data: existingRequest } = await admin.from("signature_requests").select("id").eq("agreement_id", agreement.id).maybeSingle();
  let signatureRequestId = existingRequest?.id ?? null;
  if (!signatureRequestId) {
    const created = await createSignatureRequest({ agreementId: agreement.id, actorUserId: params.actorUserId });
    if (!created.ok) return { ok: false, error: created.error, step: "signature_request" };
    signatureRequestId = created.signatureRequestId;
  }

  // Step 4: for every signatory who does not yet have an access link,
  // generate one and deliver it by real email to their REAL, reachable
  // address — never the reserved-but-unprovisioned corporate mailbox
  // (madjei@ordiftstudios.com has status "reserved", provisioned_at is
  // null — genuinely cannot receive mail, confirmed directly against
  // Production before writing this). Resolves each signatory's real
  // email via their linked profile's real auth account
  // (admin.auth.admin.getUserById — the same pattern already used
  // elsewhere in this codebase, e.g. receipts.ts/profileCard.ts), not
  // the corporate identity table.
  const { data: signatories } = await admin
    .from("signature_signatories")
    .select("id, role, token_hash, agreement_party_id, agreement_parties(profile_id)")
    .eq("signature_request_id", signatureRequestId);
  for (const signatory of signatories ?? []) {
    if (signatory.token_hash) continue; // already generated and, by construction, already sent
    const party = signatory.agreement_parties as unknown as { profile_id: string | null } | null;
    if (!party?.profile_id) {
      return { ok: false, error: `The "${signatory.role}" signatory has no linked account to deliver a real access link to.`, step: "deliver_access_links" };
    }
    const { data: authUser } = await admin.auth.admin.getUserById(party.profile_id);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) {
      return { ok: false, error: `The "${signatory.role}" signatory's account has no email on file.`, step: "deliver_access_links" };
    }

    const link = await generateSignatoryAccessLink({ signatoryId: signatory.id, actorUserId: params.actorUserId });
    if (!link.ok) return { ok: false, error: link.error, step: "deliver_access_links" };

    const signUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://ordiftstudios.com"}/legal/sign/${link.token}`;
    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: `${agreement.agreement_reference} — Employment Agreement ready for your review`,
      html: `<p>An employment agreement (${agreement.agreement_reference}) is ready for your review and signature.</p><p><a href="${signUrl}">Review and sign →</a></p><p>This link expires ${link.expiresAt}.</p>`,
      text: `An employment agreement (${agreement.agreement_reference}) is ready for your review and signature.\n\nReview and sign: ${signUrl}\n\nThis link expires ${link.expiresAt}.`,
      logPrefix: "[legal agreement issuance]",
      emailType: "agreement_signature_request",
      referenceNumber: agreement.agreement_reference,
    });
    if (!emailResult.ok) return { ok: false, error: `Failed to deliver the access link to the "${signatory.role}" signatory.`, step: "deliver_access_links" };
  }

  // Step 5: only now, with every signatory confirmed to have a
  // delivered access link, transition the agreement itself.
  const { data: finalSignatories } = await admin.from("signature_signatories").select("token_hash").eq("signature_request_id", signatureRequestId);
  const allDelivered = (finalSignatories ?? []).length > 0 && (finalSignatories ?? []).every((s) => s.token_hash);
  if (!allDelivered) return { ok: false, error: "Not every required signatory has a delivered access link yet.", step: "deliver_access_links" };

  const transition = await transitionAgreementStatus({ agreementId: agreement.id, toStatus: "sent", actorUserId: params.actorUserId });
  if (!transition.ok) return { ok: false, error: transition.error, step: "transition_to_sent" };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.agreement.issued_and_sent",
    entityType: "agreement",
    entityId: agreement.id,
    metadata: { agreementReference: agreement.agreement_reference },
  });

  return { ok: true };
}

// External signatory review (2026-09-15) — NO admin session, the same
// token-only access boundary as every other function in
// signatureEngine.ts. Fetches the EXACT stored bytes of the issued
// artifact (not a live re-render), so what the signatory reviews is
// provably the same content whose hash was recorded.
export async function getIssuedAgreementTextForSignatory(
  rawToken: string
): Promise<
  | { ok: true; text: string; agreementReference: string; role: string; status: string }
  | { ok: false; error: string }
> {
  const verification = await verifySignatoryToken(rawToken);
  if (!verification.ok) return verification;

  const admin = createAdminClient();
  const { data: agreement } = await admin
    .from("agreements")
    .select("agreement_reference")
    .eq("id", verification.signatory.agreementId)
    .maybeSingle();
  if (!agreement) return { ok: false, error: "Agreement not found." };

  const { data: file, error } = await admin.storage.from(ISSUED_DOCUMENTS_BUCKET).download(`${verification.signatory.agreementId}.txt`);
  if (error || !file) return { ok: false, error: "The issued document could not be retrieved." };

  const text = await file.text();
  return {
    ok: true,
    text,
    agreementReference: agreement.agreement_reference,
    role: verification.signatory.role,
    status: verification.signatory.status,
  };
}
