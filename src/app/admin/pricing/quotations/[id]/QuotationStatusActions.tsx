"use client";

import { useActionState } from "react";
import { updateQuotationStatusAction, type ActionState } from "../actions";
import SubmitButton from "@/components/admin/SubmitButton";

const NEXT_STATUS: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "sent", label: "Mark Sent" }],
  sent: [
    { status: "accepted", label: "Mark Accepted" },
    { status: "declined", label: "Mark Declined" },
    { status: "expired", label: "Mark Expired" },
  ],
};

export function QuotationStatusActions({ quotationId, status }: { quotationId: string; status: string; hasClient: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateQuotationStatusAction, null);
  const options = NEXT_STATUS[status] ?? [];

  return (
    <div className="space-y-2">
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Status: <strong className="text-ordift-ink">{status}</strong>
      </p>
      {options.length > 0 && (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="quotationId" value={quotationId} />
          {options.map((opt) => (
            <SubmitButton
              key={opt.status}
              name="status"
              value={opt.status}
              pendingLabel="Saving…"
              className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md border border-black/15 text-ordift-ink"
            >
              {opt.label}
            </SubmitButton>
          ))}
        </form>
      )}
      {state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}
