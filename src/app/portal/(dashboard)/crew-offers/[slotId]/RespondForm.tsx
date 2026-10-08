"use client";

import { useState } from "react";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { respondToOfferAction } from "../actions";

const control = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink w-full";

// Two explicit choices. Accepting needs a confirming tick (the pay and
// date are shown right above); declining only needs an optional reason.
export default function RespondForm({ slotId }: { slotId: string }) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  return (
    <ActionForm action={respondToOfferAction} className="space-y-3">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="response" value={mode} />
      <div role="group" aria-label="Your response" className="flex gap-2">
        <button type="button" onClick={() => setMode("accept")} aria-pressed={mode === "accept"} className={`rounded-lg px-4 py-2 font-sans text-body-small border ${mode === "accept" ? "bg-ordift-ink text-white border-ordift-ink" : "border-black/20 text-ordift-ink"}`}>Accept</button>
        <button type="button" onClick={() => setMode("decline")} aria-pressed={mode === "decline"} className={`rounded-lg px-4 py-2 font-sans text-body-small border ${mode === "decline" ? "bg-ordift-ink text-white border-ordift-ink" : "border-black/20 text-ordift-ink"}`}>Decline</button>
      </div>
      {mode === "accept" && (
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
          <input type="checkbox" name="confirm" className="mt-1 w-4 h-4" />
          I accept this job on the date and compensation shown above.
        </label>
      )}
      <label className="block font-sans text-caption text-ordift-ink-muted">{mode === "accept" ? "Note for Ordift (optional)" : "Reason (optional)"}
        <textarea name="note" rows={2} maxLength={500} className={`${control} mt-1`} />
      </label>
      <SubmitButton pendingLabel="Sending…" className="rounded-lg bg-ordift-ink text-white px-5 py-2.5 font-sans text-body-small">{mode === "accept" ? "Accept job" : "Decline job"}</SubmitButton>
    </ActionForm>
  );
}
