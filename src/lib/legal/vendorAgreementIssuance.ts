import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { transitionAgreementStatus, recordIssuedDocumentHash } from "@/lib/legal/agreementEngine";
import { createSignatureRequest, generateSignatoryAccessLink } from "@/lib/legal/signatureEngine";
import { OS_LGL_009A_FULL_TEXT, VENDOR_FRAMEWORK_VARIABLES, type VendorFrameworkVariableKey } from "@/lib/legal/documents/os-lgl-009a-vendor-supplier-framework-agreement";
import { sendEmail } from "@/lib/shared/email/dispatch";
import { sendVendorAgreementNotification } from "@/lib/notifications/vendorAgreementNotification";

// OS-LGL-009A Vendor & Supplier Framework Agreement issuance bridge
// (2026-09-15) — the Vendor-side counterpart to agreementIssuance.ts's
// issueEmployeeEmploymentAgreement(), reusing every existing piece
// exactly the same way (agreementEngine.ts, signatureEngine.ts, the
// Resend-backed sendEmail(), the same plain-text issued-artifact
// approach — no PDF/document-rendering pipeline exists anywhere in
// this codebase, unchanged by this phase).
//
// Deliberately SIMPLER than the employee flow in one respect: this
// codebase's Vendor draft-creation (createVendorFrameworkDraftAgreement(),
// vendorAgreements.ts) already adds BOTH parties — 'vendor' (the real
// vendor account) and 'ordift' (the real acting admin) — at DRAFT time,
// since neither party is ever ambiguous the way OS-LGL-007's open
// "Employer: Name/Title/Authority" placeholder is. There is therefore
// no employee-flow-equivalent "resolve and attach the employer
// signatory during issuance" step here — both signatories are already
// real, already-attached accounts by the time issuance runs.

const ISSUED_DOCUMENTS_BUCKET = "issued-agreement-documents";

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to issue this agreement." };
  return { ok: true };
}

// Pure — directly testable. Same Schedule A composition discipline as
// composeIssuedAgreementText(): the verbatim master text, never
// spliced into its own placeholders, followed by a clearly separated
// Schedule A block built from VENDOR_FRAMEWORK_VARIABLES' own
// ordering/labels — the same list createVendorFrameworkDraftAgreement()
// validates against, so the issued artifact and the resolved snapshot
// can never silently disagree on which fields exist.
export function composeIssuedVendorFrameworkAgreementText(params: {
  masterFullText: string;
  masterVersion: string;
  agreementReference: string;
  snapshot: Partial<Record<VendorFrameworkVariableKey, string>>;
}): string {
  const divider = "=".repeat(72);
  const scheduleALines = VENDOR_FRAMEWORK_VARIABLES.map((v) => `${v.label}: ${params.snapshot[v.key] ?? "N/A"}`).join("\n");
  return [
    params.masterFullText,
    "",
    divider,
    `ISSUED AGREEMENT REFERENCE: ${params.agreementReference}`,
    `OS-LGL-009 MASTER VERSION: ${params.masterVersion}`,
    divider,
    "",
    "SCHEDULE A — RESOLVED VENDOR-SPECIFIC PARTICULARS (frozen at issuance, never re-resolved)",
    "",
    scheduleALines,
    "",
  ].join("\n");
}

type VendorFrameworkIssuanceStep = "compose_and_hash" | "signature_request" | "deliver_access_links" | "transition_to_sent";

export type IssueVendorFrameworkAgreementResult = { ok: true } | { ok: false; error: string; step: VendorFrameworkIssuanceStep };

// Resumable/idempotent by design — same discipline as
// issueEmployeeEmploymentAgreement(): every sub-step checks whether it
// has already genuinely completed before doing anything, and only
// transitions approved_for_issue -> sent as the LAST step, once every
// earlier step is confirmed complete. A failure at any point leaves
// the agreement genuinely still approved_for_issue.
export async function issueVendorFrameworkAgreement(params: {
  agreementId: string;
  actorUserId: string;
}): Promise<IssueVendorFrameworkAgreementResult> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return { ok: false, error: auth.error, step: "compose_and_hash" };

  const admin = createAdminClient();
  const { data: agreement } = await admin
    .from("agreements")
    .select("id, status, agreement_reference, master_version_id, issued_document_sha256, primary_context_reference")
    .eq("id", params.agreementId)
    .maybeSingle();
  if (!agreement) return { ok: false, error: "Agreement not found.", step: "compose_and_hash" };
  if (agreement.status !== "approved_for_issue") {
    return { ok: false, error: `Agreement must be "approved_for_issue" to be issued (currently "${agreement.status}").`, step: "compose_and_hash" };
  }

  // Step 1: compose the immutable artifact, hash it, store it, and
  // record the hash — skipped entirely if already done.
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

    const composed = composeIssuedVendorFrameworkAgreementText({
      masterFullText: OS_LGL_009A_FULL_TEXT,
      masterVersion: version?.version ?? "unknown",
      agreementReference: agreement.agreement_reference,
      snapshot: snapshotRow.snapshot_data as Partial<Record<VendorFrameworkVariableKey, string>>,
    });
    const documentSha256 = createHash("sha256").update(composed, "utf8").digest("hex");

    const { error: uploadError } = await admin.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .upload(`${agreement.id}.txt`, Buffer.from(composed, "utf8"), { contentType: "text/plain", upsert: false });
    if (uploadError) {
      console.error("[legal] failed to upload issued vendor framework document", uploadError.message);
      return { ok: false, error: "Failed to store the issued agreement document.", step: "compose_and_hash" };
    }

    const hashResult = await recordIssuedDocumentHash({ agreementId: agreement.id, documentSha256, actorUserId: params.actorUserId });
    if (!hashResult.ok) return { ok: false, error: hashResult.error, step: "compose_and_hash" };
  }

  // Step 2: create the signature request — one signatory row per
  // existing agreement_parties row (vendor + ordift, both real
  // accounts already attached at draft-creation time) — skipped if one
  // already exists.
  const { data: existingRequest } = await admin.from("signature_requests").select("id").eq("agreement_id", agreement.id).maybeSingle();
  let signatureRequestId = existingRequest?.id ?? null;
  if (!signatureRequestId) {
    const created = await createSignatureRequest({ agreementId: agreement.id, actorUserId: params.actorUserId });
    if (!created.ok) return { ok: false, error: created.error, step: "signature_request" };
    signatureRequestId = created.signatureRequestId;
  }

  // Step 3: for every signatory who does not yet have an access link,
  // generate one and deliver it by real email to their real account.
  const { data: signatories } = await admin
    .from("signature_signatories")
    .select("id, role, token_hash, agreement_party_id, agreement_parties(profile_id)")
    .eq("signature_request_id", signatureRequestId);
  for (const signatory of signatories ?? []) {
    if (signatory.token_hash) continue;
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
      subject: `${agreement.agreement_reference} — Vendor & Supplier Framework Agreement ready for your review`,
      html: `<p>A Vendor & Supplier Framework Agreement (${agreement.agreement_reference}) is ready for your review and signature.</p><p><a href="${signUrl}">Review and sign →</a></p><p>This link expires ${link.expiresAt}.</p>`,
      text: `A Vendor & Supplier Framework Agreement (${agreement.agreement_reference}) is ready for your review and signature.\n\nReview and sign: ${signUrl}\n\nThis link expires ${link.expiresAt}.`,
      logPrefix: "[legal vendor agreement issuance]",
      emailType: "vendor_agreement_signature_request",
      referenceNumber: agreement.agreement_reference,
    });
    if (!emailResult.ok) return { ok: false, error: `Failed to deliver the access link to the "${signatory.role}" signatory.`, step: "deliver_access_links" };
  }

  // Step 4: only now, with every signatory confirmed to have a
  // delivered access link, transition the agreement itself.
  const { data: finalSignatories } = await admin.from("signature_signatories").select("token_hash").eq("signature_request_id", signatureRequestId);
  const allDelivered = (finalSignatories ?? []).length > 0 && (finalSignatories ?? []).every((s) => s.token_hash);
  if (!allDelivered) return { ok: false, error: "Not every required signatory has a delivered access link yet.", step: "deliver_access_links" };

  const transition = await transitionAgreementStatus({ agreementId: agreement.id, toStatus: "sent", actorUserId: params.actorUserId });
  if (!transition.ok) return { ok: false, error: transition.error, step: "transition_to_sent" };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.vendor_agreement.issued_and_sent",
    entityType: "agreement",
    entityId: agreement.id,
    metadata: { agreementReference: agreement.agreement_reference },
  });

  // Fire-and-forget — the email delivering the actual signing link
  // (step 3, above) is the operative notice; this is a courtesy
  // portal-visibility nudge, never blocks issuance itself.
  if (agreement.primary_context_reference) {
    void sendVendorAgreementNotification({ vendorProfileId: agreement.primary_context_reference, event: "framework_ready_for_signature" });
  }

  return { ok: true };
}

// External signatory review — deliberately NOT duplicated here.
// getIssuedAgreementTextForSignatory() (agreementIssuance.ts) is
// already fully generic (keyed entirely off the token-resolved
// agreementId, the same Storage bucket, the same signatureEngine.ts
// verification) — a Vendor Framework's signatory uses that exact same
// function, re-exported below purely so call sites can import it
// alongside the rest of this module without reaching into
// agreementIssuance.ts directly.
export { getIssuedAgreementTextForSignatory as getIssuedVendorAgreementTextForSignatory } from "./agreementIssuance";
