"use client";

import { useActionState, useState } from "react";
import { updatePulseSourceAction, type UpdateSourceState } from "../actions";
import type { PulseSourceAdminDetail } from "@/lib/content/sanity/pulseAdmin";
import type { PulseEditorialTrustLevel, PulsePermissionClassification, PulseSourceClassification } from "@/lib/content/types";
import { RIGHTS_STATUS_DISCLAIMER } from "@/lib/pulse/adminLabels";

const PERMISSION_OPTIONS: { value: PulsePermissionClassification; label: string }[] = [
  { value: "unknown", label: "Unknown — Not Yet Reviewed" },
  { value: "amber", label: "Amber — Permission Unclear" },
  { value: "blue", label: "Blue — Discovery/Linking Only" },
  { value: "green", label: "Green — Syndication Permitted" },
  { value: "red", label: "Red — Disallowed" },
];

const CLASSIFICATION_OPTIONS: { value: PulseSourceClassification; label: string }[] = [
  { value: "editorial_discovery", label: "Editorial / Discovery — third-party publication" },
  { value: "official_primary", label: "Official / Primary — the brand's own newsroom" },
];

const TRUST_OPTIONS: { value: PulseEditorialTrustLevel; label: string }[] = [
  { value: "unverified", label: "Unverified" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
  { value: "flagged", label: "Flagged" },
];

// Same useActionState Saving…/Saved/error pattern used across this
// Admin Platform. Auto-Publish Eligible is disabled in the UI whenever
// the selected Permission isn't Green (2026-08-24 direction: the two
// classifications stay independent, but auto-publish specifically may
// only ever key off Green) — the server action enforces the same rule
// again regardless of what the client sends, so this is a UX
// convenience, not the actual safeguard.
export function SourceEditForm({ source }: { source: PulseSourceAdminDetail }) {
  const [state, formAction, pending] = useActionState<UpdateSourceState, FormData>(updatePulseSourceAction, null);
  const [permission, setPermission] = useState<PulsePermissionClassification>(source.permissionClassification);
  const canAutoPublish = permission === "green";

  return (
    <form action={formAction} className="max-w-xl space-y-5 bg-white rounded-lg border border-ordift-ink/10 p-6">
      <input type="hidden" name="sourceId" value={source.id} />

      <label className="flex items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={source.isActive} disabled={pending} className="h-4 w-4" />
        <span className="font-sans text-body-small text-ordift-ink">Active — eligible to be included in a discovery run</span>
      </label>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Source Classification</label>
        <select
          name="sourceClassification"
          defaultValue={source.sourceClassification}
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        >
          {CLASSIFICATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">
          Decides how every discovered draft from this source is routed — Official/Primary becomes an independently Ordift-written article; Editorial/Discovery becomes a curated discovery brief. Set once here, never per article.
        </p>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Permission Classification</label>
        <p className="mb-1 font-sans text-caption italic text-ordift-ink-muted">{RIGHTS_STATUS_DISCLAIMER}</p>
        <select
          name="permissionClassification"
          value={permission}
          onChange={(e) => setPermission(e.target.value as PulsePermissionClassification)}
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        >
          {PERMISSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Editorial Trust Level</label>
        <select
          name="editorialTrustLevel"
          defaultValue={source.editorialTrustLevel}
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        >
          {TRUST_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="imageUsePermitted" defaultChecked={source.imageUsePermitted} disabled={pending} className="h-4 w-4" />
        <span className="font-sans text-body-small text-ordift-ink">External image use permitted</span>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="commercialUsePermitted" defaultChecked={source.commercialUsePermitted} disabled={pending} className="h-4 w-4" />
        <span className="font-sans text-body-small text-ordift-ink">Commercial use permitted</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="autoPublishEligible"
          defaultChecked={source.autoPublishEligible}
          disabled={pending || !canAutoPublish}
          className="h-4 w-4"
        />
        <span className="font-sans text-body-small text-ordift-ink">
          Auto-Publish Eligible {!canAutoPublish && <span className="text-ordift-ink-muted">(requires Green)</span>}
        </span>
      </label>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Attribution Requirement</label>
        <textarea
          name="attributionRequirement"
          defaultValue={source.attributionRequirement ?? ""}
          disabled={pending}
          rows={2}
          className="w-full rounded-md border border-black/15 px-3 py-2 font-sans text-body-small bg-white"
        />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Last Policy Review Date</label>
        <input
          type="date"
          name="lastPolicyReviewDate"
          defaultValue={source.lastPolicyReviewDate ?? ""}
          disabled={pending}
          className="min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Policy / Rights URL</label>
        <input
          type="url"
          name="termsUrl"
          defaultValue={source.termsUrl ?? ""}
          placeholder="https://…/terms or /press/media-usage"
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        />
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">The specific copyright/terms/press-usage page this classification is based on — the evidence, not a copy of it.</p>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Rights Summary / Notes</label>
        <textarea
          name="licenseNotes"
          defaultValue={source.licenseNotes ?? ""}
          disabled={pending}
          rows={3}
          placeholder="A short, factual summary in your own words — never a long quote from the source's policy."
          className="w-full rounded-md border border-black/15 px-3 py-2 font-sans text-body-small bg-white"
        />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Freshness Window Override (days)</label>
        <input
          type="number"
          min={1}
          name="freshnessWindowDaysOverride"
          defaultValue={source.freshnessWindowDaysOverride ?? ""}
          placeholder="Leave blank to use the source-type default"
          disabled={pending}
          className="min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Source"}
        </button>
        {!pending && state?.ok === true && <span className="font-sans text-body-small text-green-700">Saved</span>}
        {state?.ok === false && <span className="font-sans text-body-small text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
