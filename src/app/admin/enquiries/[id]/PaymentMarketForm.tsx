"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { setPaymentMarketAction } from "./marketActions";

export default function PaymentMarketForm({ enquiryId, current }: { enquiryId: string; current: string | null }) {
  return (
    <ActionForm action={setPaymentMarketAction} className="space-y-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <label htmlFor="payment-country" className="font-sans text-caption text-ordift-ink-muted block">Client payment market</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="payment-country" name="paymentCountry" defaultValue={current ?? ""} className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small text-ordift-ink">
          <option value="">Default (Ghana — Paystack)</option>
          <option value="GH">Ghana</option>
          <option value="QA">Qatar — Direct Bank Transfer</option>
        </select>
        <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted max-w-md">
          <input type="checkbox" name="acknowledgeOpenGatewayAttempt" className="mt-0.5" />
          <span>If a card/Paystack attempt is still open, I understand switching the market does not cancel it.</span>
        </label>
        <SubmitButton pendingLabel="Saving…" className="min-h-9 rounded-lg border border-black/20 px-3 font-sans text-body-small text-ordift-ink hover:bg-black/5">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
