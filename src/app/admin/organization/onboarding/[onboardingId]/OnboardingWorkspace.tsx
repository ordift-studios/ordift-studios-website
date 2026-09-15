"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement, RequirementStatus, OnboardingRequirementOverrideRow } from "@/lib/organization/onboardingRequirements";
import type { ActivityLogEntry } from "@/lib/admin/activityLog";
import type { RecruitmentRequisition } from "@/lib/recruitment/requisitions";
import type { CurrentEmploymentContext } from "@/lib/organization/employmentTermsHistory";
import type { EmploymentAgreementSummary } from "@/lib/legal/employeeAgreements";
import { isExceptionalAgreementStatus, isFullyExecuted } from "@/lib/legal/agreementLifecycle";
import {
  advanceOnboardingStageAction,
  completeOnboardingFromWorkspaceAction,
  updateOnboardingRequirementAction,
  linkOnboardingToRequisitionAction,
  authorizeOnboardingRequirementOverrideAction,
  type ActionState,
} from "./actions";

// authorizedByName is resolved server-side (page.tsx) from the same
// person projection every other name on this page already uses —
// never a second independent profile lookup here.
export type ResolvedOnboardingRequirementOverride = OnboardingRequirementOverrideRow & { authorizedByName: string | null };

const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  pending: "Pending",
  satisfied: "Satisfied",
  waived: "Waived",
  not_applicable: "Not applicable",
  deferred: "Deferred — progression authorized",
};

// Never includes "deferred" — that status is reachable only through
// the dedicated AgreementExecutionOverrideControl below (requires a
// reason and writes a permanent audit record), never through this
// generic per-requirement dropdown.
const MANUALLY_SELECTABLE_STATUSES: readonly RequirementStatus[] = ["pending", "satisfied", "waived", "not_applicable"];

const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  task: "Task",
  document: "Document",
  agreement: "Agreement",
  digital_signature: "Digital Signature",
  physical_document: "Physical Document",
  approval: "Approval",
  external_handoff: "External Handoff",
};

function StatusPill({ status }: { status: RequirementStatus }) {
  const styles: Record<RequirementStatus, string> = {
    pending: "bg-amber-100 text-amber-800",
    satisfied: "bg-green-100 text-green-800",
    waived: "bg-ordift-offwhite text-ordift-ink-muted",
    not_applicable: "bg-ordift-offwhite text-ordift-ink-muted",
    deferred: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${styles[status]}`}>
      {REQUIREMENT_STATUS_LABELS[status]}
    </span>
  );
}

// One requirement's own isolated success/error state — same reasoning
// as Grant Role/Temporary Password (src/app/admin/users/UsersManager.tsx):
// each row's action must never be confused with another row's, or with
// the page-level Advance/Complete actions.
function RequirementRow({ onboardingId, pipeline, requirement }: { onboardingId: string; pipeline: string; requirement: ResolvedRequirement }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateOnboardingRequirementAction, null);
  const showsPhysical = requirement.requirementType === "physical_document" || requirement.requiresPhysicalExecution === true;
  // TD-071, B1 (E.5 Stage 2K) — when the requirement's own DEFINITION
  // configures digital and/or physical execution, "Satisfied"/"Pending"
  // are computed server-side from that evidence, not from this
  // dropdown directly (see applyConfiguredEvidenceStatus() /
  // updateOnboardingRequirement()'s own enforcement) — only
  // "Waived"/"Not applicable" are real manual choices here. The select
  // still shows all four so a waiver/exemption stays reachable; the
  // note below makes the computed behavior explicit rather than silent.
  const hasConfiguredEvidence = requirement.requiresDigitalExecution === true || requirement.requiresPhysicalExecution === true;

  // A "deferred" requirement is never edited through this generic
  // form — MANUALLY_SELECTABLE_STATUSES deliberately excludes it, so
  // rendering the normal <select> here would show a mismatched
  // defaultValue (no "Deferred" option exists in it) and risk an
  // unrelated Save silently reverting the deferral back to "Pending".
  // The dedicated AgreementExecutionOverrideControl (Documents &
  // Agreements section) is the only place this status is set or
  // discussed in detail; this is just a compact, honest read-only
  // acknowledgement here.
  if (requirement.status === "deferred") {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-sans text-body-small font-medium text-ordift-ink">{requirement.label}</p>
            <p className="font-sans text-caption text-ordift-ink-muted">
              {REQUIREMENT_TYPE_LABELS[requirement.requirementType]} · Stage: {requirement.stage} · Required
            </p>
          </div>
          <StatusPill status={requirement.status} />
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Administratively deferred — the underlying requirement remains genuinely outstanding. See the override
          details below.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <input type="hidden" name="pipeline" value={pipeline} />
      <input type="hidden" name="requirementKey" value={requirement.requirementKey} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{requirement.label}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {REQUIREMENT_TYPE_LABELS[requirement.requirementType]} · Stage: {requirement.stage} ·{" "}
            {requirement.required ? "Required" : "Optional"}
            {requirement.isDerived && !requirement.row ? " · live-derived" : ""}
          </p>
        </div>
        <StatusPill status={requirement.status} />
      </div>
      {hasConfiguredEvidence && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Satisfied/Pending is computed automatically from the evidence below — Waived/Not applicable remain available as a manual decision.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={requirement.status} className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
          {MANUALLY_SELECTABLE_STATUSES.map((s) => (
            <option key={s} value={s}>{REQUIREMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {requirement.requiresDigitalExecution && (
          <label className="font-sans text-caption text-ordift-ink-muted flex items-center gap-1">
            Digital execution:
            <select name="digitalExecutionStatus" defaultValue={requirement.row?.digitalExecutionStatus ?? ""} className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="">Not set</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        )}
        {showsPhysical && (
          <label className="font-sans text-caption text-ordift-ink-muted flex items-center gap-1">
            <input type="checkbox" name="physicalOriginalReceived" defaultChecked={requirement.row?.physicalOriginalReceived ?? false} />
            Physical original received
          </label>
        )}
        <label className="font-sans text-caption text-ordift-ink-muted flex items-center gap-1">
          <input type="checkbox" name="verifiedNow" />
          Mark verified now (by me)
        </label>
        <input
          type="text"
          name="notes"
          placeholder="Notes"
          defaultValue={requirement.row?.notes ?? ""}
          className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-32"
        />
        <button
          type="submit"
          disabled={pending}
          className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Saved.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
      {requirement.row?.verifiedAt && (
        <p className="font-sans text-caption text-ordift-ink-muted">Verified {new Date(requirement.row.verifiedAt).toLocaleString()}</p>
      )}
    </form>
  );
}

function AdvanceStageControl({ onboardingId, nextStage }: { onboardingId: string; nextStage: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(advanceOnboardingStageAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <input type="hidden" name="toStage" value={nextStage} />
      <button
        type="submit"
        disabled={pending}
        className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
      >
        {pending ? "Advancing…" : `Advance to "${nextStage}"`}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Stage advanced.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function CompleteControl({ onboardingId }: { onboardingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(completeOnboardingFromWorkspaceAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <button
        type="submit"
        disabled={pending}
        className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50"
      >
        {pending ? "Completing…" : "Mark Onboarding Complete"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Onboarding completed.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

// Reconciliation control (E.5 Stage 2M, Part 4/6) — only rendered when
// this onboarding predates the origin architecture and has no
// requisition_id yet. Never usable to create a NEW onboarding, and
// never usable once a requisition is already linked.
function LinkRequisitionControl({ onboardingId, candidates }: { onboardingId: string; candidates: RecruitmentRequisition[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkOnboardingToRequisitionAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="onboardingId" value={onboardingId} />
      <select name="requisitionId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Approved requisition to link…</option>
        {candidates.map((r) => (
          <option key={r.id} value={r.id}>
            {r.hireOrigin === "founder_direct_hire" ? "Founder Direct Hire" : "Standard Recruitment"}
            {r.requestedPositionName ? ` · ${r.requestedPositionName}` : ""}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Linking…" : "Link Requisition"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Linked.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

// Controlled onboarding requirement override (2026-09-15) — a
// deliberately SEPARATE control from RequirementRow's generic
// Satisfied/Waived/Not-applicable dropdown, because this is not a
// claim that the requirement is satisfied or doesn't apply: it is an
// authorized, temporary permission to let onboarding progress while
// the employee's own signature genuinely remains outstanding. Requires
// a reason and an explicit confirm step before committing, and — once
// authorized — always keeps the outstanding requirement visible
// (never silently promoted to "Satisfied").
function AgreementExecutionOverrideControl({
  onboardingId,
  pipeline,
  requirementKey,
  agreementId,
  overrides,
}: {
  onboardingId: string;
  pipeline: string;
  requirementKey: string;
  agreementId: string;
  overrides: ResolvedOnboardingRequirementOverride[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(authorizeOnboardingRequirementOverrideAction, null);
  const [confirming, setConfirming] = useState(false);
  const activeOverride = overrides.find((o) => !o.resolvedAt) ?? null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <p className="font-sans text-body-small font-medium text-ordift-ink">Employee agreement: Signature pending</p>

      {activeOverride ? (
        <div className="space-y-1">
          <p className="font-sans text-caption text-ordift-ink">
            Onboarding gate: <span className="font-medium">Administratively deferred / progression authorized</span>
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Authorized by: {activeOverride.authorizedByName ?? "Unknown"} · {new Date(activeOverride.authorizedAt).toLocaleString()}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">Reason: {activeOverride.reason}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Follow-up required: {activeOverride.followUpRequired ? "Yes" : "No"}
          </p>
        </div>
      ) : !confirming ? (
        <>
          <p className="font-sans text-caption text-ordift-ink-muted">
            The employee has not yet signed this agreement and is presently unable to. An authorized administrator
            may permit onboarding to continue while their signature remains outstanding.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white"
          >
            Authorize Onboarding to Proceed — Signature Still Required
          </button>
        </>
      ) : (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="onboardingId" value={onboardingId} />
          <input type="hidden" name="pipeline" value={pipeline} />
          <input type="hidden" name="requirementKey" value={requirementKey} />
          <input type="hidden" name="agreementId" value={agreementId} />
          <p className="font-sans text-caption font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            This does not sign, accept, or execute the employment agreement on behalf of the employee. It only
            permits onboarding progression while employee execution remains outstanding.
          </p>
          <label className="block font-sans text-caption font-medium text-ordift-ink">
            Reason
            <textarea
              name="reason"
              required
              rows={3}
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1 font-sans text-caption"
              defaultValue="Employee presently unable to complete agreement execution process. Founder/Super Admin authorizes onboarding progression while employee execution remains outstanding. Employee execution remains required when practicable."
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
            >
              {pending ? "Authorizing…" : "Confirm — Authorize Onboarding to Proceed"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="font-sans text-caption font-medium px-3 py-1.5 rounded-md border border-black/15"
            >
              Cancel
            </button>
          </div>
          {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        </form>
      )}

      {overrides.some((o) => o.resolvedAt) && (
        <div className="pt-2 border-t border-blue-200 space-y-1">
          <p className="font-sans text-caption font-medium text-ordift-ink-muted">Override history</p>
          {overrides
            .filter((o) => o.resolvedAt)
            .map((o) => (
              <p key={o.id} className="font-sans text-caption text-ordift-ink-muted">
                · Authorized by {o.authorizedByName ?? "Unknown"} on {new Date(o.authorizedAt).toLocaleDateString()} — resolved{" "}
                {o.resolvedAt ? new Date(o.resolvedAt).toLocaleDateString() : ""}: {o.resolutionNote}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

export function OnboardingWorkspace({
  onboarding,
  pipelineStages,
  nextStageName,
  isTerminal,
  requirements,
  activity,
  requisition,
  employmentContext,
  agreementSummary,
  hiringManagerName,
  reconciliationCandidates,
  requirementOverrides,
}: {
  onboarding: StaffOnboarding;
  pipelineStages: readonly string[];
  nextStageName: string | null;
  isTerminal: boolean;
  requirements: ResolvedRequirement[];
  activity: ActivityLogEntry[];
  requisition: RecruitmentRequisition | null;
  employmentContext: CurrentEmploymentContext;
  agreementSummary: EmploymentAgreementSummary | null;
  hiringManagerName: string | null;
  reconciliationCandidates: RecruitmentRequisition[];
  requirementOverrides: ResolvedOnboardingRequirementOverride[];
}) {
  const currentStageRequirements = requirements.filter((r) => r.stage === onboarding.stage);
  const approvals = requirements.filter((r) => r.requirementType === "approval");
  const documentsAndAgreements = requirements.filter((r) =>
    ["document", "agreement", "digital_signature", "physical_document"].includes(r.requirementType)
  );
  const tasks = requirements.filter((r) => r.requirementType === "task");

  // The agreement is "genuinely pending" for override purposes once
  // it's actually been issued/sent (not a mere Founder-review draft)
  // and hasn't already reached a real terminal/exceptional state — an
  // override is never offered once the employee has genuinely signed,
  // or if the agreement was cancelled/superseded/expired for reasons
  // unrelated to a missing signature.
  const employmentAgreementRequirement = requirements.find((r) => r.requirementKey === "employment_agreement_executed");
  const agreementGenuinelyPending =
    agreementSummary !== null &&
    agreementSummary.isIssued &&
    !isFullyExecuted(agreementSummary.status) &&
    !isExceptionalAgreementStatus(agreementSummary.status);
  const showAgreementExecutionOverride =
    agreementGenuinelyPending &&
    employmentAgreementRequirement !== undefined &&
    (employmentAgreementRequirement.status === "pending" || employmentAgreementRequirement.status === "deferred");
  const employmentAgreementOverrides = requirementOverrides.filter((o) => o.requirementKey === "employment_agreement_executed");

  return (
    <div className="space-y-6">
      {/* Employment / Hire Definition summary (E.5 Stage 2M, Part 7) —
          deliberately compact: at a glance, who is being hired, by
          which entity, where, under what employment context, for what
          role, and through which approved hiring path. Unresolved
          fields show "Not yet set", never a guessed value. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Employment / Hire Definition</h2>
        {requisition ? (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              Hire Origin: <span className="text-ordift-ink">{requisition.hireOrigin === "founder_direct_hire" ? "Founder Direct Hire" : "Standard Recruitment"}</span>
            </p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Employing Entity: <span className="text-ordift-ink">{employmentContext.employingEntityName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Employment Jurisdiction: <span className="text-ordift-ink">{employmentContext.employmentJurisdictionName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Work Location: <span className="text-ordift-ink">{employmentContext.workLocation ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Position: <span className="text-ordift-ink">{requisition.requestedPositionName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Department: <span className="text-ordift-ink">{requisition.departmentName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Grade: <span className="text-ordift-ink">{requisition.gradeName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Engagement Type: <span className="text-ordift-ink">{requisition.engagementTypeName ?? "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Hiring/Reporting Manager: <span className="text-ordift-ink">{requisition.hiringManagerId ? (hiringManagerName ?? "Unnamed") : "Not yet set"}</span></p>
            <p className="font-sans text-body-small text-ordift-ink-muted">Intended Start Date: <span className="text-ordift-ink">{employmentContext.startDate ?? "Not yet set"}</span></p>
          </div>
          {employmentContext.resolvedFromCurrentTerms && (
            <p className="font-sans text-caption text-ordift-ink-muted">
              Employing Entity / Jurisdiction / Work Location / Start Date reflect this person&apos;s current
              employment record, which may have been recorded after the original hire requisition.
            </p>
          )}
          </>
        ) : (
          <>
            <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No approved hire definition is linked yet — this onboarding record predates the origin architecture
              (E.5 Stage 2M). Reconcile it with an approved requisition below.
            </p>
            {reconciliationCandidates.length > 0 ? (
              <LinkRequisitionControl onboardingId={onboarding.id} candidates={reconciliationCandidates} />
            ) : (
              <p className="font-sans text-caption text-ordift-ink-muted">
                No approved, unlinked requisition exists yet for this person — create and approve a Founder Direct
                Hire requisition in Operations first, then return here to link it.
              </p>
            )}
          </>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Pipeline &amp; Stage</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Pipeline: <span className="font-medium text-ordift-ink">{onboarding.pipeline}</span> · Status:{" "}
          <span className="font-medium text-ordift-ink">{onboarding.status}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {pipelineStages.map((s) => (
            <span
              key={s}
              className={`px-2 py-0.5 rounded-full font-sans text-caption ${
                s === onboarding.stage
                  ? "bg-ordift-navy-950 text-white"
                  : pipelineStages.indexOf(s) < pipelineStages.indexOf(onboarding.stage)
                    ? "bg-green-100 text-green-800"
                    : "bg-ordift-offwhite text-ordift-ink-muted"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
        {onboarding.status === "in_progress" && !isTerminal && nextStageName && (
          <>
            {currentStageRequirements.some((r) => r.required && r.status !== "satisfied" && r.status !== "waived" && r.status !== "not_applicable" && r.status !== "deferred") ? (
              <p className="font-sans text-caption text-amber-700">
                Required items for the current stage remain outstanding below — resolve them before advancing.
              </p>
            ) : (
              <AdvanceStageControl onboardingId={onboarding.id} nextStage={nextStageName} />
            )}
          </>
        )}
        {onboarding.status === "in_progress" && isTerminal && <CompleteControl onboardingId={onboarding.id} />}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Current-Stage Requirements</h2>
        {currentStageRequirements.length === 0 ? (
          <p className="font-sans text-caption text-ordift-ink-muted">No requirements are defined for this stage.</p>
        ) : (
          <div className="space-y-2">
            {currentStageRequirements.map((r) => (
              <RequirementRow key={r.requirementKey} onboardingId={onboarding.id} pipeline={onboarding.pipeline} requirement={r} />
            ))}
          </div>
        )}
      </section>

      {tasks.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Tasks</h2>
          <div className="space-y-2">
            {tasks.map((r) => (
              <RequirementRow key={r.requirementKey} onboardingId={onboarding.id} pipeline={onboarding.pipeline} requirement={r} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Documents &amp; Agreements</h2>
        {/* Employment Agreement generation status (2026-09-15) —
            truthfully distinct from the "employment_agreement_executed"
            requirement's own Pending/Satisfied pill above: a generated
            DRAFT is not yet "satisfied" (that only derives true once
            genuinely fully_executed/active/completed), but the Founder
            still needs to know a draft exists and where to review it,
            rather than only discovering it on the Full Profile page. */}
        {agreementSummary && (
          <div className="rounded-lg border border-black/10 bg-ordift-offwhite p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-sans text-body-small text-ordift-ink">
              Employment Agreement ({agreementSummary.agreementReference}):{" "}
              <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${agreementSummary.isIssued ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                {agreementSummary.isIssued ? agreementSummary.status.replace(/_/g, " ").toUpperCase() : "DRAFT AVAILABLE FOR FOUNDER REVIEW"}
              </span>
            </p>
            <Link href={`/admin/organization/agreements/${agreementSummary.agreementId}`} className="font-sans text-caption font-semibold text-ordift-gold-pressed underline underline-offset-4">
              View Draft / Review Agreement →
            </Link>
          </div>
        )}
        {agreementSummary?.isStale && (
          <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            The currently resolved Schedule A values no longer match this draft&apos;s frozen snapshot — a corrected
            replacement can be generated from the Full Profile&apos;s Agreement Readiness section.
          </p>
        )}
        {showAgreementExecutionOverride && agreementSummary && (
          <AgreementExecutionOverrideControl
            onboardingId={onboarding.id}
            pipeline={onboarding.pipeline}
            requirementKey="employment_agreement_executed"
            agreementId={agreementSummary.agreementId}
            overrides={employmentAgreementOverrides}
          />
        )}
        {documentsAndAgreements.length === 0 ? (
          <p className="font-sans text-caption text-ordift-ink-muted">No document/agreement requirements defined for this pipeline yet.</p>
        ) : (
          <div className="space-y-2">
            {documentsAndAgreements.map((r) => (
              <RequirementRow key={r.requirementKey} onboardingId={onboarding.id} pipeline={onboarding.pipeline} requirement={r} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Approvals</h2>
        {approvals.length === 0 ? (
          <p className="font-sans text-caption text-ordift-ink-muted">No approval requirements defined for this pipeline yet.</p>
        ) : (
          <div className="space-y-2">
            {approvals.map((r) => (
              <RequirementRow key={r.requirementKey} onboardingId={onboarding.id} pipeline={onboarding.pipeline} requirement={r} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Activity / History</h2>
        {activity.length === 0 ? (
          <p className="font-sans text-caption text-ordift-ink-muted">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {activity.map((a) => (
              <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                · {new Date(a.createdAt).toLocaleString()} — {a.action} — {a.actorLabel}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
