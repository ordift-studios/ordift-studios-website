"use client";

import { useActionState } from "react";
import type { CurrencyOption } from "@/lib/payments/currency";
import SubmitButton from "@/components/admin/SubmitButton";

// Payable Safety Hardening (2026-09-04), Part B — engagement
// correction UI. Only ever rendered by the parent page when
// `engagement.paymentObligationId` is null (see the payee detail page)
// — the server-side lock in updateEngagement() is the real boundary;
// hiding this form once a payable exists is just keeping the UI
// honest about what will happen if submitted anyway.

type UpdateEngagementState = { ok: boolean; error?: string } | null;

type EngagementType = { id: string; name: string };
type OperationalTitle = { id: string; name: string };

export default function EditEngagementForm({
  engagement,
  currencies,
  engagementTypes,
  operationalTitles,
  updateAction,
}: {
  engagement: {
    id: string;
    engagementTypeId: string | null;
    operationalTitleId: string | null;
    roleNote: string | null;
    currency: string | null;
    agreedAmount: number | null;
    dueDate: string | null;
    notes: string | null;
    payeeProfileId: string | null;
  };
  currencies: CurrencyOption[];
  engagementTypes: EngagementType[];
  operationalTitles: OperationalTitle[];
  updateAction: (prevState: UpdateEngagementState, formData: FormData) => Promise<UpdateEngagementState>;
}) {
  const [state, formAction] = useActionState<UpdateEngagementState, FormData>(updateAction, null);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-body-small text-green-800">Engagement updated.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="engagementId" value={engagement.id} />
      {engagement.payeeProfileId && <input type="hidden" name="payeeProfileId" value={engagement.payeeProfileId} />}

      {state?.ok === false && (
        <div role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Engagement type</span>
        <select name="engagementTypeId" defaultValue={engagement.engagementTypeId ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {engagementTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Service / role</span>
        <select name="operationalTitleId" defaultValue={engagement.operationalTitleId ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {operationalTitles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Role note (optional)</span>
        <input name="roleNote" defaultValue={engagement.roleNote ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Agreed amount (optional)</span>
        <input
          name="agreedAmount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={engagement.agreedAmount ?? ""}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
        <select name="currency" defaultValue={engagement.currency ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Due date (optional)</span>
        <input name="dueDate" type="date" defaultValue={engagement.dueDate ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} defaultValue={engagement.notes ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          Save Changes
        </SubmitButton>
      </div>
    </form>
  );
}
