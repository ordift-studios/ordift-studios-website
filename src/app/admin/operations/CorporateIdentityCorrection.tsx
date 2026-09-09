"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctCorporateIdentityLocalPartAction } from "./actions";

// Founder/Super-Admin direct typo-correction UI (2026-09-10). Narrow by
// design — this exists to fix a genuine data-entry mistake on a
// still-unprovisioned corporate identity before anything external is
// ever created, not to be a general identity-editing tool. Only
// rendered as an actionable control when status === "reserved"; every
// other status renders an explanatory, non-interactive note instead —
// matching this page's own already-established "explain honestly
// rather than silently hide" convention. Super Admin authorization,
// the reserved-only guard, collision checking, and the audit trail are
// all enforced server-side (correctCorporateIdentityLocalPartAction →
// approveCorporateIdentityLocalPart) — this component's own job is
// only the two-step "preview the change, then explicitly confirm it"
// UX, nothing more.
type Mode = "idle" | "editing" | "confirming" | "submitting";

export function CorporateIdentityCorrection({
  identity,
  personLabel,
}: {
  identity: { id: string; email: string; localPart: string; domain: string; status: string };
  personLabel: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [draftLocalPart, setDraftLocalPart] = useState(identity.localPart);
  const [error, setError] = useState<string | null>(null);

  const draftEmail = `${draftLocalPart.trim().toLowerCase()}@${identity.domain}`;

  async function handleConfirm() {
    setMode("submitting");
    setError(null);
    const result = await correctCorporateIdentityLocalPartAction({
      identityId: identity.id,
      currentLocalPart: identity.localPart,
      newLocalPart: draftLocalPart,
    });
    if (!result.ok) {
      setError(result.error);
      setMode("confirming");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  if (identity.status !== "reserved") {
    return (
      <p className="font-sans text-caption text-ordift-ink-muted">
        {identity.status === "active" || identity.status === "suspended" || identity.status === "deactivated"
          ? "Already provisioned/externally bound — a controlled mailbox/alias migration is required to change this address, not a direct edit."
          : "Provisioning already in progress for this address — a direct correction is no longer available; a controlled mailbox/alias migration would be needed instead."}
      </p>
    );
  }

  if (mode === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          setDraftLocalPart(identity.localPart);
          setError(null);
          setMode("editing");
        }}
        className="font-sans text-caption underline text-ordift-ink-muted hover:text-ordift-ink"
      >
        Correct address
      </button>
    );
  }

  if (mode === "editing") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draftLocalPart}
            onChange={(e) => setDraftLocalPart(e.target.value)}
            aria-label={`New local part for ${personLabel}`}
            className="rounded-md border border-black/15 px-2 py-1 font-sans text-caption w-40"
          />
          <span className="font-sans text-caption text-ordift-ink-muted">@{identity.domain}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!draftLocalPart.trim() || draftLocalPart.trim().toLowerCase() === identity.localPart}
            onClick={() => {
              setError(null);
              setMode("confirming");
            }}
            className="font-sans text-caption font-semibold px-2.5 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
          >
            Review change
          </button>
          <button type="button" onClick={() => setMode("idle")} className="font-sans text-caption text-ordift-ink-muted underline">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // confirming / submitting
  const submitting = mode === "submitting";
  return (
    <div className="flex flex-col items-end gap-1.5 rounded-md border border-black/10 bg-black/5 px-3 py-2">
      <p className="font-sans text-caption text-ordift-ink">
        <span className="text-ordift-ink-muted line-through">{identity.email}</span>
        {" → "}
        <span className="font-semibold">{draftEmail}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          aria-busy={submitting}
          onClick={handleConfirm}
          className="font-sans text-caption font-semibold px-2.5 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-60"
        >
          {submitting ? "Correcting…" : "Confirm correction"}
        </button>
        <button type="button" disabled={submitting} onClick={() => setMode("editing")} className="font-sans text-caption text-ordift-ink-muted underline disabled:opacity-60">
          Back
        </button>
      </div>
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
    </div>
  );
}
