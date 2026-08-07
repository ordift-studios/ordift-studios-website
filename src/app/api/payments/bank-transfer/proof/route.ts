import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecordId } from "@/lib/shared/recordId";

// Bank-transfer proof-of-payment submission (Ghana Phase 3, sandbox —
// real Ghana banking details are not populated until go-live per your
// instruction; this route works against whatever bank_accounts rows
// exist, test data only in staging). Two entry points:
//
// 1. First submission for an entity (no existing payments row yet) —
//    creates one, status starts 'pending' then moves to
//    'awaiting_verification' once the proof is attached.
// 2. Resubmission after a rejection (UX Spec §10) — reuses the
//    existing payment row rather than creating a new one, matching
//    the "resubmit against the same attempt" design decision.
//
// Storage: private 'payment-proofs' bucket (migration 0024), object
// path `{paymentId}/{filename}` — matches the RLS policy's
// storage.foldername() ownership check exactly.

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  const paymentId = formData.get("paymentId"); // existing pending bank-transfer payment, created client-side before this call
  const referenceNote = formData.get("referenceNote");

  if (!(file instanceof File) || typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json({ ok: false, error: "missing-file-or-payment" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

  const admin = createAdminClient();

  // Ownership check server-side (never trust the client-supplied
  // paymentId belongs to this user without verifying) — staff may
  // also submit on a client's behalf.
  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, status, payment_method")
    .eq("id", paymentId)
    .maybeSingle();

  const isOwner = payment?.user_id === user.id;
  if (!payment || payment.payment_method !== "bank_transfer" || (!isOwner && !isStaffOrAdmin(user))) {
    return NextResponse.json({ ok: false, error: "not-found-or-unauthorized" }, { status: 404 });
  }
  if (payment.status !== "pending" && payment.status !== "rejected") {
    return NextResponse.json({ ok: false, error: "payment-not-open-for-submission" }, { status: 409 });
  }

  const extension = file.name.split(".").pop() ?? "bin";
  const objectPath = `${payment.id}/${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("payment-proofs")
    .upload(objectPath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[payments] proof upload failed", uploadError.message);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }

  await admin
    .from("payments")
    .update({
      proof_of_payment_asset_path: objectPath,
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      status: "awaiting_verification",
      review_notes: typeof referenceNote === "string" && referenceNote ? referenceNote : null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", payment.id);

  return NextResponse.json({ ok: true, paymentId: payment.id });
}

// Companion helper (called from a client-side "Bank Transfer" checkout
// step before the proof-upload form is shown) — creates the initial
// 'pending' bank_transfer payment row so the upload route above always
// has an existing row to attach to. Kept in this file rather than
// checkoutService.ts since it's bank-transfer-specific, not shared
// with the gateway checkout path.
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    entityType?: string;
    entityId?: string;
    paymentType?: string;
    country?: string;
    amountUsd?: number;
  } | null;

  if (!body?.entityType || !body.entityId || !body.paymentType || !body.country || !body.amountUsd) {
    return NextResponse.json({ ok: false, error: "missing-fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: countryConfig } = await admin
    .from("payment_country_config")
    .select("default_currency_code")
    .eq("country", body.country)
    .eq("is_active", true)
    .maybeSingle();

  if (!countryConfig) {
    return NextResponse.json({ ok: false, error: "no-active-payment-config-for-country" }, { status: 422 });
  }

  // Reads current_exchange_rates (a view over the append-only
  // exchange_rates history, always the most recent row per currency)
  // rather than the raw table — see src/lib/payments/currency.ts's
  // getCurrentRate() for the same pattern; duplicated here rather than
  // imported since this route runs with the admin client, not the
  // session client currency.ts expects.
  const { data: rateRow } = await admin
    .from("current_exchange_rates")
    .select("rate_to_usd")
    .eq("currency_code", countryConfig.default_currency_code)
    .maybeSingle();

  if (!rateRow) {
    return NextResponse.json({ ok: false, error: "no-exchange-rate-set" }, { status: 422 });
  }

  const rateToUsd = Number(rateRow.rate_to_usd);
  const convertedAmount = Math.round(body.amountUsd * rateToUsd * 100) / 100;
  const recordId = await generateRecordId("PAY");

  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: body.entityType,
      entity_id: body.entityId,
      user_id: user.id,
      reference_amount_usd: body.amountUsd,
      payment_currency: countryConfig.default_currency_code,
      exchange_rate: rateToUsd,
      exchange_rate_source: "ordift",
      exchange_rate_locked_at: new Date().toISOString(),
      converted_amount: convertedAmount,
      payment_type: body.paymentType,
      payment_method: "bank_transfer",
      status: "pending",
      provider: "bank_transfer",
    })
    .select("id")
    .single();

  if (error || !payment) {
    console.error("[payments] failed to create bank-transfer payment row", error?.message);
    return NextResponse.json({ ok: false, error: "failed-to-create-payment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paymentId: payment.id });
}
