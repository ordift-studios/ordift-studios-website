"use client";

import { useActionState } from "react";
import {
  createFinalSettlementAction,
  updateFinalSettlementComponentsAction,
  addFinalSettlementDeductionAction,
  advanceFinalSettlementStatusAction,
  type ActionState,
} from "./actions";

export interface FinalSettlementView {
  id: string;
  status: string;
  salaryThroughFinalWorkingDay: number;
  outstandingEarningsOvertime: number;
  annualLeaveSettlement: number;
  approvedReimbursements: number;
  noticePilonAmount: number;
  otherLawfulEntitlements: number;
  deductionsTotal: number;
  grossEntitlements: number;
  netFinalSettlement: number;
}

export interface DeductionView {
  id: string;
  classification: string;
  basis: string;
  amount: number;
  supportingRecordReference: string | null;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ComponentsForm({ settlement, separationCaseId }: { settlement: FinalSettlementView; separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateFinalSettlementComponentsAction, null);
  const fields: { key: keyof FinalSettlementView; label: string }[] = [
    { key: "salaryThroughFinalWorkingDay", label: "Salary through final working day" },
    { key: "outstandingEarningsOvertime", label: "Outstanding earnings/overtime" },
    { key: "annualLeaveSettlement", label: "Eligible annual-leave settlement" },
    { key: "approvedReimbursements", label: "Approved reimbursements" },
    { key: "noticePilonAmount", label: "Notice/PILON amount" },
    { key: "otherLawfulEntitlements", label: "Other lawful/statutory entitlements" },
  ];
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="finalSettlementId" value={settlement.id} />
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="font-sans text-caption text-ordift-ink-muted">{f.label}</span>
            <input
              name={f.key}
              type="number"
              step="0.01"
              min="0"
              defaultValue={settlement[f.key] as number}
              disabled={settlement.status !== "draft"}
              className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small disabled:bg-ordift-offwhite disabled:text-ordift-ink-muted"
            />
          </label>
        ))}
      </div>
      {settlement.status === "draft" && (
        <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save Components"}
        </button>
      )}
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Saved.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function DeductionForm({ settlement, separationCaseId, profileId }: { settlement: FinalSettlementView; separationCaseId: string; profileId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addFinalSettlementDeductionAction, null);
  if (settlement.status !== "draft") return null;
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="finalSettlementId" value={settlement.id} />
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input name="classification" required placeholder="Classification (e.g. Unreturned equipment)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="basis" required placeholder="Lawful basis" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="supportingRecordReference" placeholder="Supporting record reference (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Adding…" : "Add Deduction"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Added.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function StatusControl({ settlement, separationCaseId }: { settlement: FinalSettlementView; separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(advanceFinalSettlementStatusAction, null);
  const nextStatus: Record<string, string> = { draft: "submitted", pending_approval: "approved", approved: "paid" };
  const next = nextStatus[settlement.status];
  if (!next) return null;
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="finalSettlementId" value={settlement.id} />
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input type="hidden" name="toStatus" value={next} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Saving…" : `Advance to ${next.replace(/_/g, " ")}`}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function CreateSettlementForm({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createFinalSettlementAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create Final Settlement"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 mt-2">{state.error}</p>}
    </form>
  );
}

export function FinalSettlementWorkspace({
  settlement,
  deductions,
  separationCaseId,
  profileId,
}: {
  settlement: FinalSettlementView | null;
  deductions: DeductionView[];
  separationCaseId: string;
  profileId: string;
}) {
  if (!settlement) {
    return (
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <p className="font-sans text-body-small text-ordift-ink-muted">No final settlement exists yet for this separation case.</p>
        <CreateSettlementForm separationCaseId={separationCaseId} />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Components</h2>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans text-caption">{settlement.status.replace(/_/g, " ")}</span>
        </div>
        <ComponentsForm settlement={settlement} separationCaseId={separationCaseId} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Deductions {deductions.length > 0 ? `(${deductions.length})` : ""}</h2>
        {deductions.length > 0 && (
          <ul className="divide-y divide-black/5">
            {deductions.map((d) => (
              <li key={d.id} className="py-2">
                <p className="font-sans text-body-small text-ordift-ink">{d.classification} — {money(d.amount)}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">{d.basis}{d.supportingRecordReference ? ` · ${d.supportingRecordReference}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        <DeductionForm settlement={settlement} separationCaseId={separationCaseId} profileId={profileId} />
      </section>

      <section className="rounded-xl border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Net Final Settlement</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Gross entitlements {money(settlement.grossEntitlements)} − deductions {money(settlement.deductionsTotal)}
        </p>
        <p className="font-serif font-medium text-section-heading text-ordift-ink">{money(settlement.netFinalSettlement)}</p>
        <StatusControl settlement={settlement} separationCaseId={separationCaseId} />
      </section>
    </div>
  );
}
