"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestCorporateIdentityProvisioningAction, provisionCorporateIdentityMockAction } from "./actions";

// Google Workspace Corporate Email, Milestone 1B (2026-09-10) — the
// Super-Admin provisioning control per Corporate Identity row.
// MOCK PROVIDER ONLY: every path through this component that actually
// mutates anything calls provisionCorporateIdentityMockAction(), which
// is hardcoded (see actions.ts) to inject mockProvisioningProvider —
// there is no prop, flag, or hidden input anywhere in this component
// that could select a different provider. Every screen this component
// renders once a mock result exists says so visibly and repeatedly;
// this is deliberate, per explicit instruction that a mock result must
// never be mistakable for a real Google mailbox.
type Mode = "idle" | "previewRequest" | "requesting" | "previewAttempt" | "attempting";

const MOCK_BANNER = "🧪 MOCK PROVIDER — no real Google Workspace account exists. This is the internal test foundation only.";

export function CorporateIdentityProvisioning({
  identity,
  personLabel,
}: {
  identity: {
    id: string;
    email: string;
    status: string;
    provider: string | null;
    externalMailboxId: string | null;
    provisioningType: string | null;
    provisioningRequestedAt: string | null;
    provisionedAt: string | null;
    provisioningFailureReason: string | null;
  };
  personLabel: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    setMode("requesting");
    setError(null);
    const result = await requestCorporateIdentityProvisioningAction({ identityId: identity.id });
    if (!result.ok) {
      setError(result.error);
      setMode("previewRequest");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  async function handleAttempt() {
    setMode("attempting");
    setError(null);
    const result = await provisionCorporateIdentityMockAction({ identityId: identity.id });
    if (!result.ok) {
      setError(result.error);
      setMode("previewAttempt");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  // Already provisioned (or, once a real provider exists, genuinely
  // active) — read-only. The banner is keyed off provider === "mock"
  // specifically, so a future real "google_workspace" provider's
  // successes render with no such warning, by construction rather than
  // by remembering to remove one.
  if (identity.status === "active") {
    return (
      <div className="text-right">
        {identity.provider === "mock" && <p className="font-sans text-caption font-semibold text-amber-700">{MOCK_BANNER}</p>}
        <p className="font-sans text-caption text-ordift-ink-muted">
          Provisioned via {identity.provider ?? "—"} · external id {identity.externalMailboxId ?? "—"}
        </p>
      </div>
    );
  }

  if (identity.status === "suspended" || identity.status === "deactivated") {
    return <p className="font-sans text-caption text-ordift-ink-muted">No provisioning action available in this state.</p>;
  }

  // reserved -> request
  if (identity.status === "reserved") {
    if (mode === "idle") {
      return (
        <button type="button" onClick={() => setMode("previewRequest")} className="font-sans text-caption underline text-ordift-ink-muted hover:text-ordift-ink">
          Request Provisioning
        </button>
      );
    }
    const requesting = mode === "requesting";
    return (
      <div className="flex flex-col items-end gap-1.5 rounded-md border border-black/10 bg-black/5 px-3 py-2 max-w-sm">
        <p className="font-sans text-caption text-ordift-ink">
          Requesting a <span className="font-semibold">licensed mailbox</span> for <span className="font-semibold">{identity.email}</span> ({personLabel}).
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          This internal reservation is not yet a real mailbox. Requesting only records intent — no external account is created until a separate, explicitly-confirmed provisioning attempt succeeds.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={requesting} aria-busy={requesting} onClick={handleRequest} className="font-sans text-caption font-semibold px-2.5 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-60">
            {requesting ? "Requesting…" : "Confirm request"}
          </button>
          <button type="button" disabled={requesting} onClick={() => setMode("idle")} className="font-sans text-caption text-ordift-ink-muted underline disabled:opacity-60">
            Cancel
          </button>
        </div>
        {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      </div>
    );
  }

  // pending_provisioning / provisioning_failed -> attempt (mock only)
  if (identity.status === "pending_provisioning" || identity.status === "provisioning_failed") {
    const isRetry = identity.status === "provisioning_failed";
    if (mode === "idle") {
      return (
        <div className="text-right space-y-1">
          {isRetry && identity.provisioningFailureReason && (
            <p className="font-sans text-caption text-red-700">Failed: {identity.provisioningFailureReason}</p>
          )}
          {/* Milestone 1C-A: a preserved external id on a failed attempt means
              a real account may already exist (today only reachable via the
              mock's "partial_success" test trigger) — surfaced so a Super
              Admin never treats "retry" as a safe plain re-creation without
              checking first. */}
          {isRetry && identity.externalMailboxId && (
            <p className="font-sans text-caption font-semibold text-amber-700">
              ⚠️ An external account may already exist (id: {identity.externalMailboxId}) — check directly before retrying.
            </p>
          )}
          <button type="button" onClick={() => setMode("previewAttempt")} className="font-sans text-caption underline text-ordift-ink-muted hover:text-ordift-ink">
            {isRetry ? "Retry Provisioning (MOCK)" : "Attempt Provisioning (MOCK)"}
          </button>
        </div>
      );
    }
    const attempting = mode === "attempting";
    return (
      <div className="flex flex-col items-end gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 max-w-sm">
        <p className="font-sans text-caption font-semibold text-amber-800">{MOCK_BANNER}</p>
        <p className="font-sans text-caption text-ordift-ink">
          Would attempt a <span className="font-semibold">licensed mailbox</span> for <span className="font-semibold">{identity.email}</span> via the mock provider only.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={attempting} aria-busy={attempting} onClick={handleAttempt} className="font-sans text-caption font-semibold px-2.5 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-60">
            {attempting ? "Attempting…" : "Confirm mock attempt"}
          </button>
          <button type="button" disabled={attempting} onClick={() => setMode("idle")} className="font-sans text-caption text-ordift-ink-muted underline disabled:opacity-60">
            Cancel
          </button>
        </div>
        {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      </div>
    );
  }

  return null;
}
