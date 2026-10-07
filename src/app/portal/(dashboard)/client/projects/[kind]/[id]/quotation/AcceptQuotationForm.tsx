"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { acceptQuotationAction } from "./actions";

export default function AcceptQuotationForm({ enquiryId }: { enquiryId: string }) {
  return (
    <ActionForm action={acceptQuotationAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
        <input type="checkbox" name="confirm" className="mt-1 w-4 h-4" />
        I accept this quotation on the terms shown above.
      </label>
      <SubmitButton pendingLabel="Recording…" className="rounded-lg bg-ordift-ink text-white px-5 py-2.5 font-sans text-body-small">Accept quotation</SubmitButton>
    </ActionForm>
  );
}
