"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import type { DecisionRow } from "@/lib/bookings/financialDecisions";
import { decideFinancialActionAction, recordFinancialExecutionAction, requestFinancialActionAction } from "./bookingActions";

// Shown after a FINAL cancellation (and wherever a money record already exists). Admin and Super Admin may RECORD a request (kind, amount, reason, evidence reference); only a DIFFERENT Super Admin authorises or declines it;
// a Super Admin then records that it was carried out, with the external reference. This card never moves money or edits any balance, payment or quotation: the ledger changes only through the finance process.
const KIND: Record<string, string> = { refund: "Refund", write_off: "Write-off of the unpaid balance", no_adjustment: "No adjustment needed" };
const TONE: Record<string, string> = { requested: "bg-amber-50 text-amber-900", authorised: "bg-green-50 text-green-900", declined: "bg-black/5 text-ordift-ink" };
const field = "w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-caption text-ordift-ink";
const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);

export default function CancellationMoneyCard({ enquiryId, rows, money, level, viewerId, finalCancelled }: { enquiryId: string; rows: DecisionRow[]; money: { paidUsd: number; outstandingUsd: number } | null; level: "super_admin" | "admin"; viewerId: string; finalCancelled: boolean }) {
  if (!finalCancelled && rows.length === 0) return null;
  return (
    <div className="border-t border-black/10 pt-4 space-y-3" data-testid="cancellation-money">
      <p className="font-sans text-body-small font-medium text-ordift-ink">Cancellation: money decisions</p>
      <p className="font-sans text-caption text-ordift-ink-muted">A final cancellation changes no payment, balance or quotation. Any refund, write-off or "no adjustment" is recorded here with its reason and evidence, authorised by a DIFFERENT Super Admin, and carried out through the finance process; this screen never moves money.{money ? ` Verified paid: $${money.paidUsd.toFixed(2)} · unpaid balance: $${money.outstandingUsd.toFixed(2)}.` : ""}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-black/10 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{KIND[r.kind]}{r.amount_usd !== null ? ` · ${usd(r.amount_usd)}` : ""}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 font-sans text-caption font-medium ${TONE[r.status]}`}>{r.status}{r.executed_at ? " · carried out" : ""}</span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">Requested by {r.requestedLabel ?? "someone"} on {r.requested_at.slice(0, 10)}: {r.reason}</p>
            <p className="font-sans text-caption text-ordift-ink-muted">Evidence: {r.evidence_ref}</p>
            {r.decided_at ? <p className="font-sans text-caption text-ordift-ink-muted">{r.status === "authorised" ? "Authorised" : "Declined"} by {r.decidedLabel ?? "a Super Admin"} on {r.decided_at.slice(0, 10)}: {r.decision_note}</p> : null}
            {r.executed_at ? <p className="font-sans text-caption text-ordift-ink-muted">Carried out: reference {r.executed_reference} (recorded by {r.executedLabel ?? "a Super Admin"} on {r.executed_at.slice(0, 10)})</p> : null}
            {r.status === "requested" && level === "super_admin" && r.requested_by !== viewerId ? (
              <ActionForm action={decideFinancialActionAction} className="space-y-2 border-t border-black/5 pt-2">
                <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="decisionId" value={r.id} />
                <label className="font-sans text-caption text-ordift-ink-muted block">Reason for your decision (kept on the record)<textarea name="note" rows={2} className={field} /></label>
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="authorised" pendingLabel="Saving…" className="min-h-9 px-4 rounded-full border border-green-300 text-green-900 font-sans text-caption">Authorise</SubmitButton>
                  <SubmitButton name="decision" value="declined" pendingLabel="Saving…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">Decline</SubmitButton>
                </div>
              </ActionForm>
            ) : null}
            {r.status === "requested" && (level !== "super_admin" || r.requested_by === viewerId) ? <p className="font-sans text-caption text-amber-950">Waiting for a different Super Admin to authorise or decline it.</p> : null}
            {r.status === "authorised" && !r.executed_at && level === "super_admin" ? (
              <ActionForm action={recordFinancialExecutionAction} className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-2">
                <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="decisionId" value={r.id} />
                <label className="font-sans text-caption text-ordift-ink-muted">Reference of the refund or write-off once carried out<input name="reference" className={`${field} mt-1`} autoComplete="off" /></label>
                <SubmitButton pendingLabel="Recording…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">Record that it was carried out</SubmitButton>
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      {finalCancelled ? (
        <ActionForm action={requestFinancialActionAction} className="space-y-2 rounded-lg border border-black/10 p-3">
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <p className="font-sans text-caption font-medium text-ordift-ink">Record a cancellation outcome</p>
          <label className="font-sans text-caption text-ordift-ink-muted block">What is being requested<select name="kind" className={field} defaultValue="no_adjustment"><option value="no_adjustment">No adjustment needed</option><option value="refund">A refund of money already paid</option><option value="write_off">Write off the unpaid balance</option></select></label>
          <label className="font-sans text-caption text-ordift-ink-muted block">Amount in USD (refund or write-off only)<input name="amountUsd" inputMode="decimal" className={field} autoComplete="off" /></label>
          <label className="font-sans text-caption text-ordift-ink-muted block">Reason (at least a sentence)<textarea name="reason" rows={2} className={field} /></label>
          <label className="font-sans text-caption text-ordift-ink-muted block">Supporting evidence reference (a letter, message or document reference; no e-mail address, phone or account number)<input name="evidence" className={field} autoComplete="off" /></label>
          <SubmitButton pendingLabel="Recording…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">Record the request</SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
