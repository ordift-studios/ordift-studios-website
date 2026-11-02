"use client";

import { useState } from "react";
import { checkTicketPath, type TicketCheckResult } from "@/app/admin/security/ticketCheckActions";

// Two buttons for the Founder and executive administrators: check that this sign-in is accepted by the database, and that the recent second factor is recognised. Nothing is changed by either.
export function TicketCheck() {
  const [result, setResult] = useState<(TicketCheckResult & { kind: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(kind: "ordinary" | "second_factor") {
    setBusy(true); setResult(null);
    const r = await checkTicketPath(kind);
    setResult({ ...r, kind }); setBusy(false);
  }
  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3" aria-labelledby="ticket-check-heading">
      <h2 id="ticket-check-heading" className="font-serif font-medium text-body text-ordift-ink">Check that confirmation works</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">These checks ask the database to recognise your sign-in. They change nothing and expire in 90 seconds.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void run("ordinary")} className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption disabled:opacity-40">Check my sign-in</button>
        <button type="button" disabled={busy} onClick={() => void run("second_factor")} className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption disabled:opacity-40">Check my second factor</button>
      </div>
      {result && <p role="status" className={`font-sans text-caption ${result.ok ? "text-green-800" : "text-red-800"}`}>{result.message}</p>}
    </section>
  );
}
