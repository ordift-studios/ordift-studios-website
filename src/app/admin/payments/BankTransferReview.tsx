import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVerificationHistory } from "@/lib/payments/bankTransferVerification";
import { bankTransferStatusLabel, maskAccountIdentifier, type ReceivingAccountSnapshot } from "@/lib/payments/bankTransferRules";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import VerificationForm from "./VerificationForm";
import { finishBankTransferPostingAction } from "./verificationActions";

const dt = "font-sans text-caption uppercase tracking-wide text-ordift-ink-muted";
const dd = "font-sans text-body-small text-ordift-ink mt-1";

type PaymentRow = {
  id: string; record_id: string | null; status: string; entity_type: string; entity_id: string; payment_currency: string; converted_amount: number | string; reference_amount_usd: number | string;
  exchange_rate: number | string; exchange_rate_source: string; exchange_rate_locked_at: string; proof_of_payment_asset_path: string | null; client_bank_reference: string | null;
  client_transfer_date: string | null; client_visible_note: string | null; review_notes: string | null; receiving_account_snapshot: ReceivingAccountSnapshot | null; submitted_at: string | null;
  amount_collected: number | string | null; settlement_currency: string | null; gateway_reference: string | null;
};

const money = (n: number | string | null | undefined, c?: string) => (n == null ? "—" : `${c ? `${c} ` : ""}${Number(n).toFixed(2)}`);

// Everything a verifier needs on one screen: who/what it's for, what the client was told to pay and
// where, the evidence, and the full decision history — plus the decision form while it is open.
export default async function BankTransferReview({ payment, canVerify }: { payment: PaymentRow; canVerify: boolean }) {
  // Evidence, receiving-account details and the decision form are for Super Admin and explicitly
  // authorised Finance personnel only — a general admin sees the status and nothing else here.
  if (!canVerify) {
    return (
      <section className="rounded-xl border border-black/10 bg-ordift-offwhite p-6 mb-8">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-2">Bank transfer — {bankTransferStatusLabel(payment.status, "admin")}</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Only a Super Admin or authorised Finance personnel can review bank-transfer evidence and verify these payments.</p>
      </section>
    );
  }
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const table = payment.entity_type === "enquiry" ? "enquiries" : "workshop_registrations";
  const [{ data: receivable }, history, { data: claim }] = await Promise.all([
    admin.from(table).select("amount_due, amount_paid, payment_status").eq("id", payment.entity_id).maybeSingle(),
    listVerificationHistory(payment.id),
    admin.from("payment_completion_claims").select("completed_at").eq("payment_id", payment.id).eq("outcome", "completed").maybeSingle(),
  ]);
  type QuotationRef = { id: string; quotation_reference: string; status: string; total: number | string; currency: string };
  let quotation: QuotationRef | null = null as QuotationRef | null;
  if (payment.entity_type === "enquiry") {
    const { data } = await admin.from("client_quotations").select("id, quotation_reference, status, total, currency").eq("enquiry_id", payment.entity_id).eq("status", "accepted").maybeSingle();
    quotation = data as QuotationRef | null;
  }
  const due = receivable?.amount_due != null ? Number(receivable.amount_due) : null;
  const paid = Number(receivable?.amount_paid ?? 0);
  const outstanding = due == null ? null : Math.max(0, Math.round((due - paid) * 100) / 100);
  const snap = payment.receiving_account_snapshot;
  const needsPosting = payment.status === "completed" && !claim?.completed_at;

  return (
    <div className="space-y-8 mb-8">
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Bank transfer — {bankTransferStatusLabel(payment.status, "admin")}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className={dt}>Client was asked to transfer</dt>
            <dd className={dd}><strong>{money(payment.converted_amount, payment.payment_currency)}</strong> (USD {money(payment.reference_amount_usd)})</dd>
          </div>
          <div>
            <dt className={dt}>Rate used</dt>
            <dd className={dd}>1 USD = {Number(payment.exchange_rate).toFixed(4)} {payment.payment_currency} · source: {payment.exchange_rate_source} · locked <LocalTime iso={payment.exchange_rate_locked_at} /></dd>
          </div>
          <div>
            <dt className={dt}>Payment reference the client must quote</dt>
            <dd className={`${dd} font-mono`}>{payment.record_id}</dd>
          </div>
          <div>
            <dt className={dt}>Receivable</dt>
            <dd className={dd}>
              {quotation ? <Link href={`/admin/pricing/quotations/${quotation.id}`} className="text-ordift-gold-pressed underline underline-offset-4">{quotation.quotation_reference}</Link> : "No accepted quotation"}
              {" · "}due USD {money(due)} · paid USD {money(paid)} · <strong>outstanding USD {money(outstanding)}</strong>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={dt}>Designated receiving account (as issued to the client)</dt>
            <dd className={dd}>
              {snap ? (
                <>
                  {snap.bankName} — {snap.beneficiaryName} ({snap.classification === "personal" ? "PERSONAL account" : "corporate account"}) · {snap.currencyCode}
                  <br />
                  <span className="font-mono">{snap.iban ? `IBAN ${snap.iban}` : `Account ${snap.accountNumber}`}</span>
                </>
              ) : "No receiving account was recorded on this payment."}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Client&apos;s evidence</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <dt className={dt}>Proof of payment</dt>
            <dd className={dd}>
              {payment.proof_of_payment_asset_path ? (
                <a href={`/admin/payments/${payment.id}/proof`} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">Open file (secure link)</a>
              ) : "Not uploaded yet"}
            </dd>
          </div>
          <div><dt className={dt}>Client&apos;s bank reference</dt><dd className={dd}>{payment.client_bank_reference ?? "—"}</dd></div>
          <div><dt className={dt}>Client&apos;s stated transfer date</dt><dd className={dd}>{payment.client_transfer_date ?? "—"}</dd></div>
          <div className="sm:col-span-3"><dt className={dt}>Submitted</dt><dd className={dd}>{payment.submitted_at ? <LocalTime iso={payment.submitted_at} /> : "—"}</dd></div>
        </dl>
        <p className="mt-3 font-sans text-caption text-ordift-ink-muted">A receipt can be forged, edited or mistaken. It is never accepted as proof of payment — only the receiving account is.</p>
      </section>

      {canVerify && payment.status === "awaiting_verification" && (
        <section className="rounded-xl border border-ordift-gold/40 bg-white p-6">
          <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Verify this payment</h2>
          <VerificationForm paymentId={payment.id} expectedAmount={Number(payment.converted_amount)} expectedCurrency={payment.payment_currency} expectedUsd={Number(payment.reference_amount_usd)} exchangeRate={Number(payment.exchange_rate)} today={today} />
        </section>
      )}
      {payment.status === "additional_info_required" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 font-sans text-body-small text-amber-900">Waiting for the client to respond to: “{payment.client_visible_note}”. It returns to this queue when they resubmit.</p>}
      {payment.status === "pending" && <p className="rounded-lg border border-black/10 bg-ordift-offwhite p-4 font-sans text-body-small text-ordift-ink-muted">The client has been given the transfer instructions but has not submitted proof yet. Nothing to verify.</p>}

      {payment.status === "completed" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-lg text-ordift-ink mb-2">Posted</h2>
          <p className="font-sans text-body-small text-ordift-ink">Received {money(payment.amount_collected, payment.settlement_currency ?? undefined)} · credited USD {money(payment.reference_amount_usd)} · bank reference {payment.gateway_reference ?? "—"}</p>
          {needsPosting && canVerify && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-sans text-body-small text-amber-900 mb-3">This payment is verified, but posting it to the receivable didn&apos;t finish. It is safe to repeat.</p>
              <ActionForm action={finishBankTransferPostingAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <SubmitButton pendingLabel="Posting…" className="min-h-10 rounded-lg border border-black/20 px-4 font-sans text-body-small font-medium text-ordift-ink hover:bg-black/5">Finish posting</SubmitButton>
              </ActionForm>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Verification history</h2>
        {history.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No decisions recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-black/10 p-3 font-sans text-body-small text-ordift-ink">
                <strong>{h.decision === "approved" ? "Verified" : h.decision === "rejected" ? "Rejected" : "More information requested"}</strong> by {h.decidedByLabel ?? "—"} · <LocalTime iso={h.decidedAt} />
                {h.decision === "approved" && (
                  <div className="mt-1 text-ordift-ink-muted">
                    Received {money(h.receivedAmount, h.receivedCurrency ?? undefined)} on {h.receivedDate} · bank ref {h.bankReference} · credited USD {money(h.creditedReferenceUsd)}{h.excessReceived ? ` · excess ${money(h.excessReceived)} recorded for manual handling` : ""}
                  </div>
                )}
                {h.internalNotes && <div className="mt-1 text-ordift-ink-muted">Internal: {h.internalNotes}</div>}
                {h.clientMessage && <div className="mt-1 text-ordift-ink-muted">To client: {h.clientMessage}</div>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 font-sans text-caption text-ordift-ink-muted">Account shown to the client: {snap ? `${snap.bankName} · ${maskAccountIdentifier(snap.iban ?? snap.accountNumber)}` : "—"}</p>
      </section>
    </div>
  );
}
