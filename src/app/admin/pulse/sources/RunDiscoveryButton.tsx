"use client";

import { useActionState } from "react";
import { runPulseDiscoveryAction, type RunDiscoveryState } from "./actions";

// Ordift Pulse — Adaptive Discovery Remediation, Part 3 (2026-09-08).
// Same useActionState Saving…/result pattern already established for
// Pulse (ArticleActions.tsx). useActionState's own `pending` flag
// disables the button for the whole request, which is what actually
// prevents an accidental double invocation here — a second click while
// the first is still in flight is simply inert until the button
// re-enables, the same protection every other action button in this
// Admin Portal already relies on.
export default function RunDiscoveryButton({ sourceId }: { sourceId: string }) {
  const [state, formAction, pending] = useActionState<RunDiscoveryState, FormData>(runPulseDiscoveryAction, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="min-h-9 px-3 rounded-md border border-black/15 font-sans text-caption font-semibold text-ordift-ink hover:border-black/30 disabled:opacity-60"
      >
        {pending ? "Running…" : "Run Discovery"}
      </button>
      {!pending && state?.ok === true && state.result && (
        <p className="mt-1 font-sans text-caption text-green-700 max-w-xs">
          Discovery complete — {state.result.fetched} checked · {state.result.created} new draft{state.result.created === 1 ? "" : "s"} ·{" "}
          {state.result.flaggedDuplicate} duplicate{state.result.flaggedDuplicate === 1 ? "" : "s"} · {state.result.excluded} excluded
          {state.result.staleExcluded > 0 ? ` · ${state.result.staleExcluded} stale` : ""}
        </p>
      )}
      {state?.ok === false && (
        <p className="mt-1 font-sans text-caption text-red-700 max-w-xs">{state.error}</p>
      )}
    </form>
  );
}
