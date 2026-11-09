"use client";

import { useState } from "react";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { useSubmitGuard } from "@/components/admin/useSubmitGuard";
import { useRestoringActionState } from "@/components/admin/useRestoringActionState";
import { CHANNEL_LABELS, CLAIM_CHANNELS, DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS } from "@/lib/portal/claims";
import { createInvitationAction, releaseOwnershipAction, revokeInvitationAction, type InvitationState } from "./portalAccessActions";

const input = "min-h-10 w-full rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink";

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setDone(true)).catch(() => setDone(false)); }} className="rounded-md border border-black/20 px-3 py-1 font-sans text-caption hover:border-black/40">{done ? "Copied" : label}</button>;
}

// The link and the code are shown ONCE, here. Only hashes are stored, so they cannot be shown again.
export function CreateInvitationForm({ enquiryId, defaultChannel, hasOpen }: { enquiryId: string; defaultChannel: string; hasOpen: boolean }) {
  const [state, action, pending, formRef] = useRestoringActionState<InvitationState>(createInvitationAction, null);
  const guard = useSubmitGuard(pending);
  return (
    <div className="space-y-4">
      {/* The form stays mounted after it succeeds (the page refreshes and an invitation is then "open"), so the one-time link and code below do not disappear. */}
      {hasOpen && !state?.ok ? <p className="font-sans text-body-small text-ordift-ink">An invitation is open (see below). To issue a new one, revoke it first: a code cannot be shown again.</p> : null}
      <form ref={formRef} action={action} onSubmit={guard} hidden={hasOpen} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="enquiryId" value={enquiryId} />
        <label className="font-sans text-caption text-ordift-ink-muted">How you will give it to the client
          <select name="channel" required defaultValue={CLAIM_CHANNELS.includes(defaultChannel as never) ? defaultChannel : "whatsapp"} className={`${input} mt-1`}>{CLAIM_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select>
        </label>
        <label className="font-sans text-caption text-ordift-ink-muted">Valid for (days, up to {MAX_EXPIRY_DAYS})
          <input name="expiresInDays" type="number" min={1} max={MAX_EXPIRY_DAYS} defaultValue={DEFAULT_EXPIRY_DAYS} className={`${input} mt-1`} />
        </label>
        <label className="font-sans text-caption text-ordift-ink-muted">Internal note (optional)
          <input name="note" maxLength={300} placeholder="e.g. spoke to her on the call at 10:30" className={`${input} mt-1`} />
        </label>
        <div className="sm:col-span-3"><button type="submit" disabled={pending} className="min-h-10 rounded-md bg-ordift-ink px-4 font-sans text-body-small text-white disabled:opacity-60">{pending ? "Creating…" : "Create invitation"}</button></div>
      </form>
      {state && !state.ok && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 font-sans text-caption text-red-800">{state.error}</p>}
      {state?.ok && (
        <div role="status" className="space-y-3 rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="font-sans text-body-small font-semibold text-green-900">Invitation created. Copy it now: the link and the code cannot be shown again.</p>
          {state.reasons.length > 0 && (
            <div className={`rounded-lg p-3 ${state.level === "elevated" ? "border border-amber-300 bg-amber-50" : "bg-white"}`}>
              <p className="font-sans text-caption font-semibold text-amber-950">{state.level === "elevated" ? "Take extra care with this one:" : "Note:"}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 font-sans text-caption text-amber-950">{state.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          <p className="font-sans text-caption text-green-900">{state.advice}</p>
          <div className="space-y-1"><p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">1. The link (send this)</p><p className="break-all rounded bg-white p-2 font-mono text-caption" data-testid="claim-link">{state.link}</p><Copy text={state.invitationText} label="Copy the message with the link" /></div>
          <div className="space-y-1"><p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">2. The 6-digit code (give this separately)</p><p className="inline-block rounded bg-white px-3 py-2 font-mono text-lg tracking-widest" data-testid="claim-code">{state.code}</p> <Copy text={state.codeText} label="Copy the code message" /></div>
          <p className="font-sans text-caption text-green-900">Valid until {new Date(state.expiresAt).toUTCString()}. It works once, locks after 5 wrong codes, and can be revoked below. Nothing was sent by the system.</p>
        </div>
      )}
    </div>
  );
}

export function RevokeInvitationForm({ enquiryId, claimId }: { enquiryId: string; claimId: string }) {
  return (
    <ActionForm action={revokeInvitationAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="claimId" value={claimId} />
      <input name="reason" placeholder="Why (optional)" aria-label="Reason for revoking" className={`${input} max-w-xs`} />
      <SubmitButton pendingLabel="Revoking…">Revoke</SubmitButton>
    </ActionForm>
  );
}

export function ReleaseOwnershipForm({ enquiryId }: { enquiryId: string }) {
  return (
    <ActionForm action={releaseOwnershipAction} className="space-y-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <textarea name="reason" required minLength={10} rows={2} placeholder="Why this project must be released from the client's account (at least a short sentence)" aria-label="Reason for releasing" className={input} />
      <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink"><input type="checkbox" name="confirm" className="mt-1" /> I understand the client will lose access to this project until a new invitation is claimed. This is refused if any payment has been made or is awaiting verification.</label>
      <SubmitButton pendingLabel="Releasing…">Release from the client&apos;s account</SubmitButton>
    </ActionForm>
  );
}
