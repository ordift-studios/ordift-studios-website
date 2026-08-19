import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canAccessPaymentsAdmin, PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { hasCapability } from "@/lib/workflow/engine";
import { createClient } from "@/lib/supabase/server";
import { reconcilePaymentAction, retryReceiptJobAction } from "../actions";

export const metadata: Metadata = {
  title: "Payment Details — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// TD-043 Part B — a single-payment read-only detail view, filling the
// gap that Portfolio ([id]/page.tsx) and Profile ([id]/page.tsx)
// already have but Payments never did. Reuses the exact same
// admin-access gate as the list page (canAccessPaymentsAdmin) — no
// new or weaker permission model. Reconcile Now lives here now,
// relocated from the Recent Payments list row.

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): { label: string; tone: string } {
  switch (status) {
    case "completed":
      return { label: "Paid", tone: "text-green-700 bg-green-50 border-green-200" };
    case "failed":
      return { label: "Failed", tone: "text-red-700 bg-red-50 border-red-200" };
    case "rejected":
      return { label: "Rejected", tone: "text-red-700 bg-red-50 border-red-200" };
    case "refunded":
      return { label: "Refunded", tone: "text-ordift-ink-muted bg-black/5 border-black/10" };
    case "awaiting_verification":
      return { label: "Awaiting Verification", tone: "text-amber-800 bg-amber-50 border-amber-200" };
    case "pending":
    default:
      return { label: "Pending", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  }
}

export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !canAccessPaymentsAdmin(user)) redirect("/portal");
  const canReconcile = hasCapability(user, PAYMENT_CAPABILITIES, "reconcile_payment");

  const supabase = await createClient();
  const { data: payment } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();

  if (!payment) notFound();

  // Associated entity (enquiry or workshop registration) — read-only
  // display context only, no write path touched here.
  const entityTable = payment.entity_type === "enquiry" ? "enquiries" : "workshop_registrations";
  const entitySelect =
    payment.entity_type === "enquiry"
      ? "id, reference_number, full_name, email, service"
      : "id, registration_reference, full_name, email, workshop_title";
  const { data: entity } = await supabase.from(entityTable).select(entitySelect).eq("id", payment.entity_id).maybeSingle();

  const status = statusLabel(payment.status);
  const eligibleForReconcile = canReconcile && payment.payment_method === "gateway" && payment.status === "pending";

  // TD-043 completion-idempotency remediation — the durable receipt
  // outbox record for this payment, if any (only 'completed' payments
  // ever get one; a gateway payment that's never reached completed
  // simply has no row here yet).
  const { data: receiptJob } =
    payment.status === "completed"
      ? await supabase
          .from("payment_receipt_jobs")
          .select("status, attempt_count, last_attempted_at, last_error, provider_result")
          .eq("payment_id", payment.id)
          .eq("outcome", "completed")
          .maybeSingle()
      : { data: null };
  const eligibleForReceiptRetry = canReconcile && receiptJob && receiptJob.status !== "sent" && receiptJob.status !== "processing";

  const entityReference =
    entity && "reference_number" in entity ? entity.reference_number : entity && "registration_reference" in entity ? entity.registration_reference : null;
  const entityLabel = entity && "service" in entity ? entity.service : entity && "workshop_title" in entity ? entity.workshop_title : null;

  return (
    <div className="max-w-2xl">
      <Link href="/admin/payments" className="font-sans text-body-small text-ordift-ink-muted hover:text-ordift-ink mb-4 inline-block">
        ← Back to Payments
      </Link>

      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin — Payment
        </p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">{payment.record_id ?? payment.id}</h1>
        <span className={`inline-block mt-3 rounded-full border px-3 py-1 font-sans text-caption font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 mb-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Payment Type</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">{payment.payment_type}</dd>
          </div>
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Method</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">
              {payment.payment_method === "gateway" ? payment.provider : "Bank Transfer"}
            </dd>
          </div>
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Amount (USD)</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">{Number(payment.reference_amount_usd).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Converted Amount</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">
              {payment.payment_currency} {Number(payment.converted_amount).toFixed(2)}
            </dd>
          </div>
          {payment.payment_method === "gateway" && (
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Gateway Reference</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1 break-all">{payment.gateway_reference ?? "—"}</dd>
            </div>
          )}
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Exchange Rate</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">{Number(payment.exchange_rate).toFixed(4)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Associated {payment.entity_type === "enquiry" ? "Enquiry" : "Workshop Registration"}</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">
              {entity ? (
                <>
                  {entityReference} — {entity.full_name} ({entity.email}){entityLabel ? ` · ${entityLabel}` : ""}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Created</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">{formatDateTime(payment.created_at)}</dd>
          </div>
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Last Updated</dt>
            <dd className="font-sans text-body-small text-ordift-ink mt-1">{formatDateTime(payment.updated_at)}</dd>
          </div>
          {payment.submitted_at && (
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Submitted</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1">{formatDateTime(payment.submitted_at)}</dd>
            </div>
          )}
          {payment.reviewed_at && (
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Reviewed</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1">{formatDateTime(payment.reviewed_at)}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* TD-043 — Reconcile Now, relocated here from the Recent Payments
          list row. Only ever visible for a gateway payment genuinely
          still pending; the form posts to the same, unmodified
          reconcilePaymentAction, which calls only
          reconcilePendingGatewayPayment() — no path here or in the
          action can set a status directly. */}
      {eligibleForReconcile && (
        <section className="rounded-xl border border-black/10 bg-ordift-offwhite p-6 mb-8">
          <h2 className="font-serif font-medium text-lg text-ordift-ink mb-2">Reconcile with Paystack</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted mb-4">
            This payment is still showing as Pending. Reconcile Now checks Paystack&apos;s own record for this transaction —
            it never sets a status directly; the result you see afterward is exactly what Paystack reports.
          </p>
          <form action={reconcilePaymentAction}>
            <input type="hidden" name="paymentId" value={payment.id} />
            <button
              type="submit"
              className="min-h-10 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover"
            >
              Reconcile Now
            </button>
          </form>
        </section>
      )}

      {/* TD-043 completion-idempotency remediation — the durable
          receipt outbox job for this payment, if one exists. Retry
          only ever touches this job row and re-runs the email send —
          it never re-runs the financial payment, never creates
          another payment, and refuses to fire for a job already
          confirmed 'sent'. */}
      {receiptJob && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-lg text-ordift-ink mb-2">Receipt Delivery</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Status</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1 capitalize">{receiptJob.status}</dd>
            </div>
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Attempts</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1">{receiptJob.attempt_count}</dd>
            </div>
            <div>
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Last Attempted</dt>
              <dd className="font-sans text-body-small text-ordift-ink mt-1">{formatDateTime(receiptJob.last_attempted_at)}</dd>
            </div>
            {receiptJob.last_error && (
              <div className="col-span-2">
                <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Last Error</dt>
                <dd className="font-sans text-body-small text-red-700 mt-1 break-all">{receiptJob.last_error}</dd>
              </div>
            )}
          </dl>
          {eligibleForReceiptRetry ? (
            <form action={retryReceiptJobAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <button
                type="submit"
                className="min-h-10 rounded-lg border border-black/20 px-4 font-sans text-body-small font-medium text-ordift-ink hover:bg-black/5"
              >
                Retry Receipt
              </button>
            </form>
          ) : receiptJob.status === "sent" ? (
            <p className="font-sans text-caption text-ordift-ink-muted">Confirmed sent — not re-dispatched from here.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
