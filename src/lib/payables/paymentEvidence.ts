import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Universal Payables System (2026-09-03), Part D — against
// public.payment_evidence + the private "payout-evidence" Storage
// bucket (0049_universal_payables.sql). Outbound counterpart to
// payments.proof_of_payment_asset_path / the payment-proofs bucket
// (0024, inbound). Object path convention matches payment-proofs
// exactly: {payment_obligation_id}/{filename} — the storage RLS
// policies rely on this.

const EVIDENCE_BUCKET = "payout-evidence";
const SIGNED_URL_TTL_SECONDS = 300;

export type PaymentEvidence = {
  id: string;
  paymentObligationId: string;
  evidenceType: string;
  hasFile: boolean;
  reference: string | null;
  notes: string | null;
  uploadedAt: string;
};

const SELECT = "id, payment_obligation_id, evidence_type, storage_path, reference, notes, uploaded_at";

function mapEvidence(r: {
  id: string;
  payment_obligation_id: string;
  evidence_type: string;
  storage_path: string | null;
  reference: string | null;
  notes: string | null;
  uploaded_at: string;
}): PaymentEvidence {
  return {
    id: r.id,
    paymentObligationId: r.payment_obligation_id,
    evidenceType: r.evidence_type,
    hasFile: Boolean(r.storage_path),
    reference: r.reference,
    notes: r.notes,
    uploadedAt: r.uploaded_at,
  };
}

export async function listPaymentEvidence(paymentObligationId: string): Promise<PaymentEvidence[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_evidence").select(SELECT).eq("payment_obligation_id", paymentObligationId).order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[payables] failed to load payment_evidence", error.message);
    return [];
  }
  return (data ?? []).map(mapEvidence);
}

// Reference-only (no file) — a bank confirmation number, a mobile-money
// transaction id, etc. is a legitimate, complete evidence record on
// its own; a file is optional, never required, matching the "optional/
// required evidence according to the final design" instruction.
export async function addPaymentEvidenceReference(params: {
  paymentObligationId: string;
  evidenceType: string;
  reference?: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.paymentObligationRecordPayment);
  if (!auth.ok) return { ok: false, error: "Not authorized to record payment evidence." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_evidence")
    .insert({
      payment_obligation_id: params.paymentObligationId,
      evidence_type: params.evidenceType,
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      uploaded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payables] failed to record payment_evidence", error?.message);
    return { ok: false, error: "Failed to record evidence." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_evidence.added",
    entityType: "payment_obligation",
    entityId: params.paymentObligationId,
    metadata: { evidenceType: params.evidenceType, hasReference: Boolean(params.reference) },
  });

  return { ok: true, id: data.id };
}

// File variant — uploads to the private bucket first, then records the
// row with storage_path set. Mirrors the recruitment-applications
// upload pattern (src/lib/recruitment/adminData.ts) and the
// payment-proofs bucket's object-path convention (0024).
export async function addPaymentEvidenceFile(params: {
  paymentObligationId: string;
  evidenceType: string;
  file: File;
  reference?: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.paymentObligationRecordPayment);
  if (!auth.ok) return { ok: false, error: "Not authorized to record payment evidence." };

  const admin = createAdminClient();
  const extension = params.file.name.includes(".") ? params.file.name.split(".").pop() : "bin";
  const path = `${params.paymentObligationId}/${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(EVIDENCE_BUCKET).upload(path, buffer, { contentType: params.file.type });
  if (uploadError) {
    console.error("[payables] failed to upload payment evidence file", uploadError.message);
    return { ok: false, error: "Failed to upload the file." };
  }

  const { data, error } = await admin
    .from("payment_evidence")
    .insert({
      payment_obligation_id: params.paymentObligationId,
      evidence_type: params.evidenceType,
      storage_path: path,
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      uploaded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payables] failed to record payment_evidence row", error?.message);
    return { ok: false, error: "File uploaded but the evidence record failed to save." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_evidence.added",
    entityType: "payment_obligation",
    entityId: params.paymentObligationId,
    metadata: { evidenceType: params.evidenceType, hasFile: true },
  });

  return { ok: true, id: data.id };
}

export async function getPaymentEvidenceSignedUrl(evidenceId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("payment_evidence").select("storage_path").eq("id", evidenceId).maybeSingle();
  if (!row?.storage_path) return null;

  const { data, error } = await admin.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[payables] failed to sign payment evidence URL", error?.message);
    return null;
  }
  return data.signedUrl;
}
