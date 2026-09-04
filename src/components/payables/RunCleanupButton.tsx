"use client";

import { useState, useTransition } from "react";
import { runProjectFilePurgeAction } from "@/app/admin/payables/actions";

// Phase H.1/H.2 (2026-09-04) — manual trigger for the media purge job
// (Section 19). No automatic scheduling is wired yet (no pg_cron/
// Vercel Cron infrastructure exists in this project) — see the Phase
// H.1/H.2 report. Idempotent: safe to click more than once.
export default function RunCleanupButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Run media cleanup now? This permanently deletes any file that has passed its backup grace period. Final approved deliverables and retained files are never affected.")) return;
          startTransition(async () => {
            const result = await runProjectFilePurgeAction();
            setMessage(result.message);
          });
        }}
        className="rounded-lg border border-black/15 px-3 py-2 font-sans text-caption hover:border-black/30 disabled:opacity-50"
      >
        {pending ? "Running…" : "Run Media Cleanup"}
      </button>
      {message && <p className="font-sans text-caption text-ordift-ink-muted mt-2">{message}</p>}
    </div>
  );
}
