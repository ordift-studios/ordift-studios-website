import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecordId } from "@/lib/shared/recordId";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { resolveEntityAmounts, resolveAmountToCharge } from "@/lib/payments/checkoutService";
import { convertedAmountsMatch } from "@/lib/payments/currency";
import type { PaymentEntityType, PaymentType } from "@/lib/payments/types";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Bank-transfer proof-of-payment submission (Ghana Phase 3, sandbox —
// real Ghana banking details are not populated until go-live per your
// instruction; this route works against whatever bank_accounts rows
// exist, test data only in staging). Two entry points:
//
// 1. First submission for an entity (no existing payments row yet) —
//    creates one, status starts 'pending' then moves to
//    'awaiting_verification' once the proof is attached.
// 2. Resubmission after a rejection — the POST handler below *can*
//    reopen an existing 'rejected' row in place (see its status check),
//    but the client-side "Try Again" flow (checkout page) never routes
//    back into it; it always restarts through PUT, creating a fresh
//    row instead. TD-042 (TECHNICAL_DEBT_REGISTER.md) — this was
//    previously mis-documented here as "reuses the existing row." It
//    doesn't, and that's fine: a fresh row re-validates the exchange
//    rate at resubmission time (below, "rate_changed"), the same
//    guarantee the gateway checkout path gets — reusing the old row
//    would resubmit proof against a now-possibly-stale locked rate
//    instead. Intentionally retained as-is; not a bug.
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

  // TD-030: corroborate the declared Content-Type against the file's
  // actual magic bytes — supplements, doesn't replace, the ALLOWED_TYPES
  // check above. A file whose real content doesn't match any type this
  // route accepts (or that file-type can't identify at all) is rejected
  // here even if its declared Content-Type passed the earlier check.
  const sniffedMime = await detectFileMimeType(buffer);
  if (!sniffedMime || !ALLOWED_TYPES.has(sniffedMime)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

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

  // TD-033: audited via logActivityAsSystem() (service-role client),
  // not logActivity() — activity_log's only insert policy is
  // staff-only, and the actor here is routinely a plain client (see
  // this route's own submitted-on-a-client's-behalf comment above).
  // actorUserId is the server-verified user.id from getCurrentUser()
  // at the top of this handler, never client-supplied; only reached
  // after auth, ownership, and the upload itself all succeeded.
  await logActivityAsSystem({
    actorUserId: user.id,
    action: "payment.bank_transfer_submitted",
    entityType: "payment",
    entityId: payment.id,
  });

  return NextResponse.json({ ok: true, paymentId: payment.id });
}

const ENTITY_TYPES = new Set<PaymentEntityType>(["enquiry", "workshop_registration"]);
const PAYMENT_TYPES = new Set<PaymentType>(["full", "balance", "deposit", "partial"]);

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

  const rateLimit = await checkRateLimit(`bank-transfer-init:${user.id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    entityType?: string;
    entityId?: string;
    paymentType?: string;
    country?: string;
    amountUsd?: number;
    // TD-036 — the converted amount the customer actually saw on the
    // checkout page immediately before clicking "I've Sent This
    // Payment". Required: this is the one legitimate customer-facing
    // caller of this endpoint (CheckoutForm.tsx), and the whole point
    // of the guard below is that it can't be silently omitted.
    quotedConvertedAmount?: number;
  } | null;

  if (
    !body?.entityType ||
    !body.entityId ||
    !body.paymentType ||
    !body.country ||
    !body.amountUsd ||
    !Number.isFinite(body.quotedConvertedAmount)
  ) {
    return NextResponse.json({ ok: false, error: "missing-fields" }, { status: 400 });
  }
  if (!ENTITY_TYPES.has(body.entityType as PaymentEntityType) || !PAYMENT_TYPES.has(body.paymentType as PaymentType)) {
    return NextResponse.json({ ok: false, error: "invalid-fields" }, { status: 400 });
  }

  // Ownership + amount validated server-side exactly like the gateway
  // checkout path (checkoutService.ts) — never trust a client-supplied
  // entityId/amountUsd directly. resolveEntityAmounts uses the
  // session-scoped (RLS-bound) client, so an entity the caller doesn't
  // own resolves to null here, same as it would for gateway checkout.
  const entityType = body.entityType as PaymentEntityType;
  const paymentType = body.paymentType as PaymentType;

  const amounts = await resolveEntityAmounts(entityType, body.entityId);
  if (!amounts) {
    return NextResponse.json({ ok: false, error: "entity-not-found" }, { status: 404 });
  }

  const validatedAmountUsd = resolveAmountToCharge(
    paymentType,
    amounts.amountDueUsd,
    amounts.amountPaidUsd,
    body.amountUsd
  );
  if (validatedAmountUsd == null) {
    return NextResponse.json({ ok: false, error: "invalid-amount" }, { status: 422 });
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
  const convertedAmount = Math.round(validatedAmountUsd * rateToUsd * 100) / 100;

  // TD-036 — server-authoritative compare-and-reconfirm, same
  // guarantee as checkoutService.ts's initiateGatewayCheckout(): the
  // rateRow read above and the comparison/insert below all use this
  // one fresh read, so there is no gap for a rate change to slip
  // through between "decided the quote is still valid" and "created
  // the payment." On a mismatch, nothing below this point runs — no
  // record ID generated, no insert — the caller gets the fresh rate
  // back and must resubmit, which re-runs this identical check.
  if (!convertedAmountsMatch(body.quotedConvertedAmount as number, convertedAmount)) {
    return NextResponse.json(
      { ok: false, error: "rate_changed", rateToUsd, convertedAmount, currencyCode: countryConfig.default_currency_code },
      { status: 409 }
    );
  }

  const recordId = await generateRecordId("PAY");

  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: entityType,
      entity_id: body.entityId,
      user_id: user.id,
      reference_amount_usd: validatedAmountUsd,
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

  // TD-033: see the POST handler above for why logActivityAsSystem()
  // (not logActivity()) is used here. Only reached after auth, field
  // validation, entity ownership, amount resolution, and the insert
  // itself all succeeded — never for a rejected/failed request.
  await logActivityAsSystem({
    actorUserId: user.id,
    action: "payment.bank_transfer_initiated",
    entityType: "payment",
    entityId: payment.id,
  });

  return NextResponse.json({ ok: true, paymentId: payment.id });
}
