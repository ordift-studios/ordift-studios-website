"use client";

import { useActionState } from "react";
import { requestOwnSalaryAdvanceAction, type ActionState } from "./actions";

export interface MySalaryAdvanceView {
  id: string;
  requestedAmount: number;
  capAmount: number;
  exceedsCap: boolean;
  status: string;
  createdAt: string;
}

export interface MyBenefitTransactionView {
  id: string;
  transactionType: string;
  benefitDescription: string;
  amount: number;
  transactionDate: string;
}

export interface MyLongServiceAwardView {
  id: string;
  milestoneYears: number;
  awardAmount: number;
  awardedAt: string;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function RequestAdvanceForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestOwnSalaryAdvanceAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input name="requestedAmount" type="number" step="0.01" min="0.01" required placeholder="Requested amount" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Submitting…" : "Request Salary Advance"}
      </button>
      {!pending && state?.ok === true && <p className="basis-full font-sans text-caption text-green-700">Submitted.</p>}
      {!pending && state?.ok === false && <p className="basis-full font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function MyCompensationWorkspace({
  basicSalary,
  workPattern,
  advances,
  benefitTransactions,
  longServiceAwards,
}: {
  basicSalary: number | null;
  workPattern: string | null;
  advances: MySalaryAdvanceView[];
  benefitTransactions: MyBenefitTransactionView[];
  longServiceAwards: MyLongServiceAwardView[];
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Current Terms</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Basic salary: {basicSalary !== null ? money(basicSalary) : "Not on record"}</p>
        <p className="font-sans text-body-small text-ordift-ink-muted">Work pattern: {workPattern ?? "Not on record"}</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Salary Advances</h2>
        {advances.length > 0 ? (
          <ul className="space-y-1">
            {advances.map((a) => (
              <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                · {money(a.requestedAmount)} (cap {money(a.capAmount)}{a.exceedsCap ? ", exceeds cap" : ""}) — {a.status} · {new Date(a.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No salary advances on record.</p>
        )}
        <RequestAdvanceForm />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Staff Benefit Transactions</h2>
        {benefitTransactions.length > 0 ? (
          <ul className="space-y-1">
            {benefitTransactions.map((t) => (
              <li key={t.id} className="font-sans text-caption text-ordift-ink-muted">
                · {t.transactionType} — {t.benefitDescription} ({money(t.amount)}) — {new Date(t.transactionDate).toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No staff-benefit transactions on record.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Long-Service Benefits</h2>
        {longServiceAwards.length > 0 ? (
          <ul className="space-y-1">
            {longServiceAwards.map((a) => (
              <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                · {a.milestoneYears}-year milestone — {money(a.awardAmount)} — {new Date(a.awardedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No long-service benefit awarded yet.</p>
        )}
      </section>
    </div>
  );
}
