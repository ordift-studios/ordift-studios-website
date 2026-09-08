"use client";

import { useActionState, useState } from "react";
import { createPulseSourceAction, type CreateSourceState } from "../actions";
import type { PulseSourceClassification } from "@/lib/content/types";

// Manual Source Addition, Part N (2026-09-08) — "I should NOT need
// Claude/code changes each time Ordift decides to monitor another
// company." rss/manual are the only two sourceTypes with a real
// automated fetcher today (see ingestion.ts's selectAdapter()) — the
// others are still genuinely useful to register (attribution/rights
// metadata, a manually-curated entry point) but Run Discovery will
// truthfully refuse them until a matching adapter exists. Told to the
// admin here, up front, rather than only discovered later at
// discovery time.
const SOURCE_TYPE_OPTIONS: { value: string; label: string; automated: boolean }[] = [
  { value: "rss", label: "RSS Feed", automated: true },
  { value: "manual", label: "Manual (editor-submitted)", automated: true },
  { value: "api", label: "API", automated: false },
  { value: "press-release", label: "Press Release", automated: false },
  { value: "partner", label: "Partner (direct relationship)", automated: false },
];

const CLASSIFICATION_OPTIONS: { value: PulseSourceClassification; label: string }[] = [
  { value: "editorial_discovery", label: "Editorial / Discovery — third-party publication" },
  { value: "official_primary", label: "Official / Primary — the brand's own newsroom" },
];

export function NewSourceForm() {
  const [state, formAction, pending] = useActionState<CreateSourceState, FormData>(createPulseSourceAction, null);
  const [sourceType, setSourceType] = useState("rss");
  const selected = SOURCE_TYPE_OPTIONS.find((o) => o.value === sourceType);

  return (
    <form action={formAction} className="max-w-xl space-y-5 bg-white rounded-lg border border-ordift-ink/10 p-6">
      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Name</label>
        <input name="name" type="text" required disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white" />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Source Type</label>
        <select
          name="sourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        >
          {SOURCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {selected && !selected.automated && (
          <p className="mt-1 font-sans text-caption text-amber-700">
            No automated adapter exists yet for this type — the source can be registered (for attribution/rights record-keeping) but Run Discovery will refuse until a matching adapter is built.
          </p>
        )}
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Source Classification</label>
        <select name="sourceClassification" defaultValue="editorial_discovery" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white">
          {CLASSIFICATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Website</label>
        <input name="url" type="url" placeholder="https://…" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white" />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Feed / API Endpoint URL</label>
        <input name="feedUrl" type="url" placeholder="https://…/feed" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white" />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Policy / Rights URL</label>
        <input name="termsUrl" type="url" placeholder="https://…/terms" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white" />
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted italic">
        A new source is always created Inactive with Rights status Unknown — review its policy and deliberately switch it on afterward, on its own detail page.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60">
          {pending ? "Creating…" : "Add Source"}
        </button>
        {state?.ok === false && <span className="font-sans text-body-small text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
