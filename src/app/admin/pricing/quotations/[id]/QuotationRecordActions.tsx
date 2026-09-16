"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { reviseQuotationAction, deleteQuotationAction, type ReviseQuotationState, type SimpleActionState } from "../actions";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";

// Task 1 — Client Quotation record management (2026-09-16). Revise
// creates a new versioned draft and navigates to it; Delete is
// draft-only (enforced server-side) and confirmation-gated.

export function ReviseQuotationButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ReviseQuotationState, FormData>(reviseQuotationAction, null);

  useEffect(() => {
    if (state?.ok === true) router.push(`/admin/pricing/quotations/${state.quotationId}/edit`);
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="quotationId" value={quotationId} />
      <ConfirmSubmitButton
        confirmMessage="Create a new revision of this quotation? The current issued version will be marked superseded — its history is preserved, never overwritten."
        pendingLabel="Revising…"
        className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink"
      >
        Revise
      </ConfirmSubmitButton>
      {state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

export function DeleteQuotationButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<SimpleActionState, FormData>(deleteQuotationAction, null);

  useEffect(() => {
    if (state?.ok === true) router.push("/admin/pricing/quotations");
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="quotationId" value={quotationId} />
      <ConfirmSubmitButton
        confirmMessage="Delete this draft quotation permanently? This cannot be undone. Only a draft can be deleted — an issued quotation's history is always preserved instead."
        pendingLabel="Deleting…"
        className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-red-300 text-red-700"
      >
        Delete
      </ConfirmSubmitButton>
      {state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}
