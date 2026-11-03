"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAssurance, listFactors, stepUp } from "@/lib/auth/mfaClient";
import { stepUpState, type StepUpState } from "@/lib/auth/stepUp";

// Second-factor prompt shown above irreversible administrator actions (erasure, purge, retention policy). Irreversible actions need a recent second factor whatever the ticket switch says (migration 0185 revision 4), so the prompt no longer depends on it; the screens that include it are themselves switched off.
// The code is typed here and goes straight to the authentication service from the browser: it is never sent to this site's servers, never logged, and cleared as soon as it is used.
// variant "irreversible" (default) keeps the warning shown above erasure, purge and policy actions. variant "identity" is the neutral wording used on the Two-step confirmation page, where the person is only confirming who they are.
export type StepUpVariant = "irreversible" | "identity";
export function StepUp({ variant = "irreversible" }: { variant?: StepUpVariant }) {
  return <StepUpPrompt variant={variant} />;
}

function StepUpPrompt({ variant }: { variant: StepUpVariant }) {
  const [state, setState] = useState<StepUpState | "checking">("checking");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const client = createClient();
    const [a, f] = await Promise.all([getAssurance(client), listFactors(client)]);
    setState(stepUpState(a, f.ok && f.verified.length > 0, Math.floor(Date.now() / 1000)));
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void check(), 0);                         // not a synchronous state update inside the effect
    const t = setInterval(() => void check(), 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [check]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    const r = await stepUp(createClient(), code);
    setCode("");                                   // never keep the code once it has been used
    setBusy(false);
    if (!r.ok) { setMessage(r.error); return; }
    await check();
  }

  if (state === "checking") return <p className="font-sans text-caption text-ordift-ink-muted" role="status">Checking your second-factor status…</p>;
  if (state === "ok") return <p className="font-sans text-caption text-green-800" role="status">Second factor confirmed. It stays valid for about 14 minutes.</p>;
  if (state === "needs_enrolment" && variant === "identity")
    return <p className="rounded-lg bg-black/[0.04] p-3 font-sans text-caption text-ordift-ink" role="status">No authenticator app is set up for your account yet. Add one in the section above.</p>;
  if (state === "needs_enrolment")
    return <p className="rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900" role="alert">This action needs a second factor, and none is set up for your account. <a className="underline" href="/admin/security">Set up an authenticator app</a>, then come back.</p>;
  return (
    <form onSubmit={submit} className={`space-y-1 rounded-lg p-3 ${variant === "identity" ? "bg-black/[0.04]" : "bg-amber-50"}`} aria-label={variant === "identity" ? "Confirm your identity with your authenticator app" : "Confirm your second factor"}>
      <label htmlFor="stepup-code" className={`block font-sans text-caption ${variant === "identity" ? "text-ordift-ink" : "text-amber-900"}`}>{variant === "identity" ? "Confirm it's you. Enter the 6-digit code from your authenticator app." : "This action cannot be undone. Enter the 6-digit code from your authenticator app to continue."}</label>
      <div className="flex gap-2">
        <input id="stepup-code" name="stepup-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} className="w-32 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <button type="submit" disabled={busy} className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption">Confirm</button>
      </div>
      {message && <p role="alert" className="font-sans text-caption text-red-800">{message}</p>}
    </form>
  );
}
