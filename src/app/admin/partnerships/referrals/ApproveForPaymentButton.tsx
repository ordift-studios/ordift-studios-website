"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveReferralCommissionForPaymentAction } from "../actions";

// Referral Payable Bridge (2026-09-07) — the ONLY UI path from an
// Earned referral commission into Payables. Deliberate type-to-confirm
// pattern (same established high-consequence guard-rail as
// DeleteDiscountButton.tsx/DeleteProjectButton.tsx) rather than a
// plain ConfirmSubmitButton — this creates a real financial record, so
// it gets the codebase's strongest confirmation, not its lighter one.
// The server re-validates everything regardless of what this button
// shows; this is purely a human guard-rail on top of that real
// boundary.
export default function ApproveForPaymentButton({ eventId, counterpartName, amount, currency }: { eventId: string; counterpartName: string; amount: number; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"submitted" | "already_existed" | null>(null);

  if (result === "submitted" || result === "already_existed") {
    return <span className="font-sans text-caption text-green-800">{result === "submitted" ? "Submitted to Payables." : "Already submitted to Payables."} <button type="button" onClick={() => router.refresh()} className="underline underline-offset-4">Refresh</button></span>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-ordift-ink text-ordift-ink px-3 py-1.5 font-sans text-caption">
        Approve for Payment
      </button>
    );
  }

  const confirmWord = "APPROVE";

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
      <p className="font-sans text-caption text-amber-900">
        This submits {currency} {amount.toFixed(2)} owed to {counterpartName} into the existing Payables system as a real payment obligation — it does not itself transfer money, but it is a genuine financial record. Type {confirmWord} to confirm.
      </p>
      <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmWord} className="w-full rounded-lg border border-amber-300 px-3 py-1.5 font-sans text-caption" />
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmText !== confirmWord || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await approveReferralCommissionForPaymentAction(eventId, `Referral commission — ${counterpartName}`);
            if (res.ok) {
              setResult(res.alreadyExisted ? "already_existed" : "submitted");
            } else {
              setError(res.error);
              setBusy(false);
            }
          }}
          className="rounded-lg bg-ordift-ink text-white px-3 py-1.5 font-sans text-caption disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Confirm — Submit to Payables"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setConfirmText(""); setError(null); }} className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption text-ordift-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
