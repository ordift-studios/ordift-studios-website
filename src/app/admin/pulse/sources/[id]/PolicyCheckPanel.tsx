"use client";

import { useActionState } from "react";
import { checkPulseSourcePolicyAction, adoptPulseSourcePolicyCandidateAction, type CheckPolicyState, type AdoptPolicyCandidateState } from "../actions";
import type { PulseSourceAdminDetail } from "@/lib/content/sanity/pulseAdmin";
import { POLICY_CHECK_RECOMMENDATION_LABEL, POLICY_CHECK_DISCLAIMER, POLICY_CHECK_CATEGORY_LABEL } from "@/lib/pulse/adminLabels";

// Rights Intelligence, "Check Policy" (2026-09-08) — a separate form
// from SourceEditForm.tsx on purpose, so clicking "Check Policy" never
// submits (or is blocked by validation on) the decision-fields form
// beside it. Purely additive evidence display — this component has NO
// write access to permissionClassification/isActive/imageUsePermitted/
// commercialUsePermitted/autoPublishEligible/editorialTrustLevel/
// attributionRequirement itself; it only ever renders what
// checkPulseSourcePolicyAction returns or what the source document
// already carries from a previous check.
export function PolicyCheckPanel({ source }: { source: PulseSourceAdminDetail }) {
  const [state, formAction, pending] = useActionState<CheckPolicyState, FormData>(checkPulseSourcePolicyAction, null);
  // Official-Domain Policy Discovery Fallback (2026-09-08) — its own,
  // separate useActionState/form so adopting a candidate can never be
  // confused with (or accidentally trigger) re-running Check Policy
  // itself, and so a rejected adoption (re-validated independently by
  // adoptPulseSourcePolicyCandidate at submit time) shows its own error
  // without disturbing the evidence display above it.
  const [adoptState, adoptFormAction, adoptPending] = useActionState<AdoptPolicyCandidateState, FormData>(adoptPulseSourcePolicyCandidateAction, null);

  // Prefer the freshest action result once one exists; otherwise fall
  // back to whatever was already persisted on the source (so a page
  // reload still shows the last real check, not a blank panel).
  const display =
    state?.ok && state.result?.ok
      ? { checkedAt: state.result.checkedAt, checkedUrl: state.result.checkedUrl, recommendation: state.result.recommendation, evidence: state.result.evidence, trustSuggestion: state.result.trustSuggestion }
      : source.policyCheckedAt
        ? {
            checkedAt: source.policyCheckedAt,
            checkedUrl: source.policyCheckedUrl,
            recommendation: source.policyCheckRecommendation,
            evidence: source.policyCheckEvidence,
            trustSuggestion: source.policyCheckTrustSuggestion,
          }
        : null;

  return (
    <div className="max-w-xl space-y-4 bg-white rounded-lg border border-ordift-ink/10 p-6">
      <div>
        <h2 className="font-sans text-body font-semibold text-ordift-ink">Check Policy</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">
          Fetches the Policy/Rights URL below and looks for contextual permissive or restrictive language about press/media assets — evidence only, never a decision. {POLICY_CHECK_DISCLAIMER}
        </p>
      </div>

      <form action={formAction}>
        <input type="hidden" name="sourceId" value={source.id} />
        <button
          type="submit"
          disabled={pending || !source.termsUrl}
          aria-busy={pending}
          className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check Policy"}
        </button>
        {!source.termsUrl && <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Add a Policy/Rights URL and Save before checking.</p>}
        {state?.ok === false && <p className="mt-2 font-sans text-body-small text-red-700">{state.error}</p>}
      </form>

      {display && (
        <div className="border-t border-black/10 pt-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Recommendation</span>
            <span className="font-sans text-body-small font-semibold text-ordift-ink">
              {display.recommendation ? POLICY_CHECK_RECOMMENDATION_LABEL[display.recommendation] : "—"}
            </span>
          </div>

          <div className="font-sans text-caption text-ordift-ink-muted">
            Checked {display.checkedAt ? new Date(display.checkedAt).toLocaleString("en-GB") : "—"}
            {display.checkedUrl && (
              <>
                {" · "}
                <a href={display.checkedUrl} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">
                  URL checked
                </a>
              </>
            )}
          </div>

          {display.evidence && display.evidence.length > 0 && (
            <ul className="space-y-2">
              {display.evidence.map((item, i) => (
                <li key={i} className="rounded-md bg-black/[0.03] px-3 py-2">
                  <span className="block font-sans text-caption font-semibold uppercase tracking-[0.05em] text-ordift-ink-muted">
                    {POLICY_CHECK_CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                  <span className="block font-sans text-body-small text-ordift-ink mt-0.5">{item.snippet}</span>
                  {item.url && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                        View candidate page
                      </a>
                      <form action={adoptFormAction}>
                        <input type="hidden" name="sourceId" value={source.id} />
                        <input type="hidden" name="candidateUrl" value={item.url} />
                        <button
                          type="submit"
                          disabled={adoptPending}
                          aria-busy={adoptPending}
                          className="min-h-8 px-3 rounded-md border border-ordift-ink/20 font-sans text-caption font-semibold text-ordift-ink hover:border-ordift-ink/40 disabled:opacity-60"
                        >
                          {adoptPending ? "Saving…" : "Use this policy URL"}
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {display.trustSuggestion && (
            <p className="font-sans text-caption text-ordift-ink-muted italic">Trust suggestion (non-binding): {display.trustSuggestion}</p>
          )}
        </div>
      )}

      {adoptState?.ok === true && (
        <p className="font-sans text-body-small text-green-700">
          Policy/Rights URL updated. Click Check Policy again to evaluate the newly adopted page.
        </p>
      )}
      {adoptState?.ok === false && <p className="font-sans text-body-small text-red-700">{adoptState.error}</p>}
    </div>
  );
}
