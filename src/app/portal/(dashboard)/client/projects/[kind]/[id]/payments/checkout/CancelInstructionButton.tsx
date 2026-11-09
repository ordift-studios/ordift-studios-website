"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createInFlightLock } from "@/lib/payments/checkoutFormRules";

// Cancels an UNPAID bank-transfer instruction (no proof yet) so it stops holding part of the balance. One request at a time; the instruction stays in the history as closed.
export default function CancelInstructionButton({ paymentId }: { paymentId: string }) {
  const router = useRouter(); const lock = useRef(createInFlightLock()); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!lock.current.tryAcquire()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/payments/bank-transfer/proof", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) { setError(body?.error === "payment-not-open-for-cancellation" ? "That instruction can no longer be cancelled (proof was submitted, or it is already closed)." : "We couldn't cancel it. Please try again."); return; }
      router.refresh();
    } catch { setError("We couldn't cancel it. Please check your connection and try again."); } finally { setBusy(false); lock.current.release(); }
  }
  return (
    <span>
      <button type="button" onClick={cancel} disabled={busy} className="rounded-full border border-ordift-ink/30 px-3 py-1 font-sans text-caption text-ordift-ink hover:border-ordift-ink/60 disabled:opacity-50">{busy ? "Cancelling…" : "Cancel this instruction"}</button>
      {error && <span role="alert" className="ml-2 font-sans text-caption text-red-700">{error}</span>}
    </span>
  );
}
