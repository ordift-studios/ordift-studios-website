"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createEmployeeEmploymentAgreementDraftAction, type CreateAgreementDraftActionState } from "./actions";

// Fixes the authenticated Founder QA finding (2026-09-15): pressing
// "Create Draft Employment Agreement" gave no visible feedback at all
// — the backend succeeded silently, leaving the Founder unable to tell
// whether the click registered, was in progress, succeeded, or failed,
// or whether pressing again would create a duplicate. useActionState
// gives this form a real pending/success/error lifecycle; the button
// disables itself for the whole request (React's own built-in
// protection against a double submission from the same form), and the
// server action underneath (createEmployeeEmploymentAgreementDraftIdempotent)
// independently guards against a genuine duplicate draft if this ever
// fires twice regardless (e.g. two separate tabs).
export function CreateAgreementDraftForm({ profileId, onboardingId }: { profileId: string; onboardingId: string }) {
  const [state, formAction, pending] = useActionState<CreateAgreementDraftActionState, FormData>(createEmployeeEmploymentAgreementDraftAction, null);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="onboardingId" value={onboardingId} />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
        >
          {pending ? "Creating Draft…" : "Create Draft Employment Agreement"}
        </button>
      </form>
      <div role="status" aria-live="polite">
        {!pending && state?.ok === true && (
          <p className="font-sans text-caption text-green-700">
            {state.alreadyExisted
              ? `A current draft already exists (${state.agreementReference}) — nothing new was created.`
              : "Employment agreement draft created successfully."}{" "}
            This is a DRAFT for Founder review only — it has not been issued, approved, signed or executed.{" "}
            <Link href={`/admin/organization/agreements/${state.agreementId}`} className="font-semibold text-ordift-gold-pressed underline underline-offset-4">
              View Draft / Review Agreement →
            </Link>
          </p>
        )}
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
      </div>
    </div>
  );
}
