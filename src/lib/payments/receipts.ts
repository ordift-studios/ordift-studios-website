import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/shared/email/dispatch";

// Payment receipts — reuses the existing Resend pipeline directly
// (src/lib/shared/email/dispatch.ts), same staging/production gating
// as every other transactional email in this project (logs instead of
// sending unless FORMS_SENDING_ENABLED, so this is sandbox-safe by
// construction). No PDF generation in this first pass — a plain-HTML
// receipt email is the Phase 2 baseline; a downloadable PDF (UX Spec
// §13) is a follow-up, not required for the sandbox flow to be
// reviewable end-to-end.

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export async function sendPaymentReceiptEmail(paymentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select(
      "record_id, user_id, reference_amount_usd, payment_currency, exchange_rate, amount_collected, payment_type, entity_type, entity_id, created_at"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    console.error("[payments] receipt: payment not found", paymentId);
    return;
  }

  let email: string | null = null;
  if (payment.user_id) {
    // Email lives on auth.users, not public.profiles (see migration
    // 0001 — profiles has no email column) — resolved via the admin
    // auth API, the standard Supabase pattern for looking up another
    // user's email server-side.
    const { data: userResult } = await admin.auth.admin.getUserById(payment.user_id);
    email = userResult?.user?.email ?? null;
  }
  if (!email) {
    // Fall back to the payable entity's own contact email (a guest
    // enquiry/registration may have no linked portal account) — same
    // "resolve from the entity if no user_id" pattern already used
    // elsewhere in this codebase for guest submissions.
    const table = payment.entity_type === "enquiry" ? "enquiries" : "workshop_registrations";
    const { data: entity } = await admin.from(table).select("email").eq("id", payment.entity_id).maybeSingle();
    email = entity?.email ?? null;
  }

  if (!email) {
    console.error("[payments] receipt: no email resolved for payment", paymentId);
    return;
  }

  const amountLocal = formatCurrency(Number(payment.amount_collected ?? payment.reference_amount_usd), payment.payment_currency);
  const amountUsd = formatCurrency(Number(payment.reference_amount_usd), "USD");
  const subject = `Payment Receipt — ${payment.record_id}`;
  const text = [
    `Thank you for your payment.`,
    ``,
    `Reference: ${payment.record_id}`,
    `Type: ${payment.payment_type}`,
    `Amount: ${amountLocal} (${amountUsd} at the exchange rate applied at checkout)`,
    `Date: ${new Date(payment.created_at).toLocaleDateString()}`,
    ``,
    `Ordift Studios`,
  ].join("\n");
  const html = `<p>Thank you for your payment.</p>
<p><strong>Reference:</strong> ${payment.record_id}<br/>
<strong>Type:</strong> ${payment.payment_type}<br/>
<strong>Amount:</strong> ${amountLocal} (${amountUsd} at the exchange rate applied at checkout)<br/>
<strong>Date:</strong> ${new Date(payment.created_at).toLocaleDateString()}</p>
<p>Ordift Studios</p>`;

  await sendEmail({
    to: email,
    subject,
    html,
    text,
    logPrefix: "[payments]",
    emailType: "payment_receipt",
    referenceNumber: payment.record_id,
  });
}
