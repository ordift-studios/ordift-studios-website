"use client";

import { useActionState } from "react";
import { updatePublicProfileAction, type PublicProfileFormState } from "./actions";
import type { PublicProfileDetails } from "@/lib/team/types";

// Save-feedback pattern (2026-08-24 fix) — same useActionState shape as
// StartHandlingButton.tsx/PublishDeliverableForm.tsx elsewhere in the
// Admin app: Save Public Profile -> Saving… (button + every field
// disabled, so a second/third click can't fire a duplicate request) ->
// either "Public Profile Saved" (auto-clears after a few seconds,
// staying on this page so nothing entered is ever lost) or a specific,
// human-readable error banner that leaves the form exactly as typed
// for an immediate retry.
export default function PublicProfileForm({ profileId, details }: { profileId: string; details: PublicProfileDetails }) {
  const [state, formAction, pending] = useActionState<PublicProfileFormState, FormData>(updatePublicProfileAction, null);

  return (
    <form action={formAction} className="bg-white rounded-lg border border-ordift-ink/10 p-6 space-y-4">
      <input type="hidden" name="profileId" value={profileId} />
      <h2 className="font-serif font-medium text-card-title text-ordift-ink">Public Profile</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">
        Only fields with real content, and only where the specific Meet the Team entry allows them (see Admin →
        Team), are ever shown publicly. Nothing here appears on the website until this person is also added to
        Meet the Team.
      </p>

      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Public Display Name / Nickname *</span>
          <input
            name="displayName"
            defaultValue={details.displayName}
            required
            placeholder="e.g. Sarah, or a public handle — not necessarily the legal name on file"
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>

        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Short Public Bio</span>
          <textarea
            name="bio"
            rows={3}
            defaultValue={details.bio ?? ""}
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>

        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Specialty / Area of Expertise</span>
          <input
            name="specialty"
            defaultValue={details.specialty ?? ""}
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>

        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Social Handle / Public Profile URL</span>
          <input
            name="socialHandle"
            defaultValue={details.socialHandle ?? ""}
            placeholder="@handle or a full URL"
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>

        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Favorite Quote</span>
          <textarea
            name="favoriteQuote"
            rows={2}
            defaultValue={details.favoriteQuote ?? ""}
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>

        <label className="block">
          <span className="font-sans text-body-small text-ordift-ink-muted">Something You May Not Know About Me</span>
          <textarea
            name="funFact"
            rows={2}
            defaultValue={details.funFact ?? ""}
            className="mt-1 w-full rounded-md border border-ordift-ink/20 px-3 py-2 font-sans text-body-small"
          />
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-full bg-ordift-navy-950 text-white font-sans text-button font-semibold px-6 py-2.5 hover:bg-ordift-navy-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save Public Profile"}
        </button>
        {!pending && state?.ok === true && (
          <p role="status" aria-live="polite" className="font-sans text-body-small text-green-700">
            Public Profile Saved
          </p>
        )}
      </div>

      {state?.ok === false && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
