"use client";

import { useActionState } from "react";
import { PAYEE_CATEGORIES } from "@/lib/payables/payeeProfiles";
import type { LookupOption } from "@/lib/portal/adminData";
import SubmitButton from "@/components/admin/SubmitButton";
import { createPayeeProfileAction, type CreatePayeeProfileState } from "../actions";

// Mutation feedback fix (2026-09-04) — see the accompanying report:
// a real Production Add Payee submission actually succeeded but gave
// no visible signal either way. useActionState() is this codebase's
// existing richer pattern for exactly this need (see
// transitionPulseArticleAction / TransitionState in
// src/app/admin/pulse/actions.ts) — reused here rather than inventing
// a new one. On success the server action redirects to the new
// payee's own page (guaranteed fresh data, itself the confirmation);
// this component only ever needs to render the FAILURE case, since a
// success never returns state — this form unmounts via navigation
// instead. Uncontrolled inputs (no value=/onChange=) mean whatever the
// administrator typed survives that re-render untouched on error,
// satisfying "preserve entered form data" without extra state.
export default function AddPayeeForm({
  notYetPayees,
  operationalTitles,
}: {
  notYetPayees: { id: string; fullName: string | null; email: string | null }[];
  operationalTitles: LookupOption[];
}) {
  const [state, formAction] = useActionState<CreatePayeeProfileState, FormData>(createPayeeProfileAction, null);

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {state?.ok === false && (
        <div role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Existing account</span>
        <select name="profileId" required defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">Select an account…</option>
          {notYetPayees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName ?? "(no name)"} — {a.email ?? "no email"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Category</span>
        <select name="category" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          {PAYEE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Service classification (optional)</span>
        <select name="operationalTitleId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {operationalTitles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Company name (optional)</span>
        <input name="companyName" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Adding…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          Add Payee
        </SubmitButton>
      </div>
    </form>
  );
}
