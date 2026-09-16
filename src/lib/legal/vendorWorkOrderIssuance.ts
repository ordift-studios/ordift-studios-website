import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { recordIssuedDocumentHash, transitionAgreementStatus } from "@/lib/legal/agreementEngine";
import { createSignatureRequest, generateSignatoryAccessLink } from "@/lib/legal/signatureEngine";
import { VENDOR_WORK_ORDER_DETAIL_FIELDS, type VendorWorkOrderDetails } from "@/lib/legal/vendorAgreements";
import { sendEmail } from "@/lib/shared/email/dispatch";
import { sendVendorAgreementNotification } from "@/lib/notifications/vendorAgreementNotification";

// OS-LGL-009B Work Order issuance (2026-09-16, backlog Phase 1 Item 4)
// — mirrors vendorAgreementIssuance.ts's own Framework issuance bridge
// exactly (same resumable-step discipline, same signature engine, same
// plain-text Storage bucket). Deliberately does NOT repeat the master
// legal text (OS_LGL_009A_FULL_TEXT) — the Framework's own clause on
// Work Orders already governs how they incorporate the Framework by
// reference; this composes only a factual Schedule B from the Work
// Order's own real details, referencing the parent Framework's
// agreement reference, never re-stating or forking legal prose.

const ISSUED_DOCUMENTS_BUCKET = "issued-agreement-documents";

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to issue this Work Order." };
  return { ok: true };
}

// Pure — directly testable. "N/A" for any absent field, same discipline
// as composeIssuedVendorFrameworkAgreementText()'s own Schedule A.
export function composeIssuedVendorWorkOrderText(params: {
  workOrderReference: string;
  frameworkReference: string;
  details: Partial<VendorWorkOrderDetails>;
}): string {
  const divider = "=".repeat(72);
  const scheduleBLines = VENDOR_WORK_ORDER_DETAIL_FIELDS.map((f) => `${f.label}: ${params.details[f.key] ?? "N/A"}`).join("\n");
  return [
    `OS-LGL-009B — VENDOR & SUPPLIER WORK ORDER`,
    `WORK ORDER REFERENCE: ${params.workOrderReference}`,
    `ISSUED UNDER FRAMEWORK AGREEMENT: ${params.frameworkReference}`,
    "",
    "This Work Order is issued under, and incorporates by reference, the Vendor & Supplier Framework Agreement identified above. Its terms govern this Work Order except where a term below expressly varies it.",
    "",
    divider,
    "SCHEDULE B — WORK ORDER PARTICULARS (frozen at issuance, never re-resolved)",
    divider,
    "",
    scheduleBLines,
    "",
  ].join("\n");
}

type VendorWorkOrderIssuanceStep = "compose_and_hash" | "signature_request" | "deliver_access_links" | "transition_to_sent";

export type IssueVendorWorkOrderResult = { ok: true } | { ok: false; error: string; step: VendorWorkOrderIssuanceStep };

// Resumable/idempotent — same discipline as issueVendorFrameworkAgreement().
// No separate "assign signatory" step: createVendorWorkOrderDraftAgreement()
// already attaches both real parties (vendor + ordift) at draft time.
export async function issueVendorWorkOrder(params: { agreementId: string; actorUserId: string }): Promise<IssueVendorWorkOrderResult> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return { ok: false, error: auth.error, step: "compose_and_hash" };

  const admin = createAdminClient();
  const { data: agreement } = await admin
    .from("agreements")
    .select("id, status, agreement_reference, issued_document_sha256, primary_context_reference")
    .eq("id", params.agreementId)
    .maybeSingle();
  if (!agreement) return { ok: false, error: "Work Order not found.", step: "compose_and_hash" };
  if (agreement.status !== "approved_for_issue") {
    return { ok: false, error: `Work Order must be "approved_for_issue" to be issued (currently "${agreement.status}").`, step: "compose_and_hash" };
  }

  if (!agreement.issued_document_sha256) {
    const { data: framework } = await admin.from("agreements").select("agreement_reference").eq("id", agreement.primary_context_reference).maybeSingle();
    if (!framework) return { ok: false, error: "Parent Framework agreement not found.", step: "compose_and_hash" };

    const { data: snapshotRow } = await admin
      .from("agreement_snapshots")
      .select("snapshot_data")
      .eq("agreement_id", agreement.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const composed = composeIssuedVendorWorkOrderText({
      workOrderReference: agreement.agreement_reference,
      frameworkReference: framework.agreement_reference,
      details: (snapshotRow?.snapshot_data as Partial<VendorWorkOrderDetails>) ?? {},
    });
    const documentSha256 = createHash("sha256").update(composed, "utf8").digest("hex");

    const { error: uploadError } = await admin.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .upload(`${agreement.id}.txt`, Buffer.from(composed, "utf8"), { contentType: "text/plain", upsert: false });
    if (uploadError) {
      console.error("[legal] failed to upload issued vendor work order document", uploadError.message);
      return { ok: false, error: "Failed to store the issued Work Order document.", step: "compose_and_hash" };
    }

    const hashResult = await recordIssuedDocumentHash({ agreementId: agreement.id, documentSha256, actorUserId: params.actorUserId });
    if (!hashResult.ok) return { ok: false, error: hashResult.error, step: "compose_and_hash" };
  }

  const { data: existingRequest } = await admin.from("signature_requests").select("id").eq("agreement_id", agreement.id).maybeSingle();
  let signatureRequestId = existingRequest?.id ?? null;
  if (!signatureRequestId) {
    const created = await createSignatureRequest({ agreementId: agreement.id, actorUserId: params.actorUserId });
    if (!created.ok) return { ok: false, error: created.error, step: "signature_request" };
    signatureRequestId = created.signatureRequestId;
  }

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
      subject: `${agreement.agreement_reference} — Vendor Work Order ready for your review`,
      html: `<p>A Vendor Work Order (${agreement.agreement_reference}) is ready for your review and signature.</p><p><a href="${signUrl}">Review and sign →</a></p><p>This link expires ${link.expiresAt}.</p>`,
      text: `A Vendor Work Order (${agreement.agreement_reference}) is ready for your review and signature.\n\nReview and sign: ${signUrl}\n\nThis link expires ${link.expiresAt}.`,
      logPrefix: "[legal vendor work order issuance]",
      emailType: "vendor_work_order_signature_request",
      referenceNumber: agreement.agreement_reference,
    });
    if (!emailResult.ok) return { ok: false, error: `Failed to deliver the access link to the "${signatory.role}" signatory.`, step: "deliver_access_links" };
  }

  const { data: finalSignatories } = await admin.from("signature_signatories").select("token_hash").eq("signature_request_id", signatureRequestId);
  const allDelivered = (finalSignatories ?? []).length > 0 && (finalSignatories ?? []).every((s) => s.token_hash);
  if (!allDelivered) return { ok: false, error: "Not every required signatory has a delivered access link yet.", step: "deliver_access_links" };

  const transition = await transitionAgreementStatus({ agreementId: agreement.id, toStatus: "sent", actorUserId: params.actorUserId });
  if (!transition.ok) return { ok: false, error: transition.error, step: "transition_to_sent" };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.vendor_work_order.issued_and_sent",
    entityType: "agreement",
    entityId: agreement.id,
    metadata: { agreementReference: agreement.agreement_reference },
  });

  // Fire-and-forget, same discipline as issueVendorFrameworkAgreement()
  // — agreement.primary_context_reference on a Work Order is the
  // parent FRAMEWORK's agreement id, so its own primary_context_reference
  // (vendor_profile) is the real recipient.
  const { data: framework } = await admin.from("agreements").select("primary_context_reference").eq("id", agreement.primary_context_reference).maybeSingle();
  if (framework?.primary_context_reference) {
    void sendVendorAgreementNotification({ vendorProfileId: framework.primary_context_reference, event: "work_order_ready_for_signature" });
  }

  return { ok: true };
}

export { getIssuedAgreementTextForSignatory as getIssuedVendorWorkOrderTextForSignatory } from "./agreementIssuance";
