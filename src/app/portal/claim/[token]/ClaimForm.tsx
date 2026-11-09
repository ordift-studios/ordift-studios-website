"use client";

import { useActionState } from "react";
import { useSubmitGuard } from "@/components/admin/useSubmitGuard";
import { claimProjectAction, type ClaimFormState } from "./actions";

const initial: ClaimFormState = { error: null };

export default function ClaimForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(claimProjectAction, initial);
  const guard = useSubmitGuard(pending);
  return (
    <form action={action} onSubmit={guard} className="max-w-md space-y-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="claim-code" className="mb-1 block font-sans text-caption text-ordift-ink-muted">6-digit code</label>
        <input id="claim-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 \-]{6,8}" maxLength={8} required placeholder="123456" className="min-h-11 w-full rounded-lg border border-black/15 px-3 font-mono text-lg tracking-widest text-ordift-ink" />
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">The code was given to you separately by ORDIFT STUDIOS (by voice, in person or in a separate message). Never share it.</p>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 font-sans text-body-small text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ordift-gold px-6 font-sans text-button font-semibold text-ordift-navy-950 disabled:opacity-60">{pending ? "Checking…" : "Link this project to my account"}</button>
    </form>
  );
}
