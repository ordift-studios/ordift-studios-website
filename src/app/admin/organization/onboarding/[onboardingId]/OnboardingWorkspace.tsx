"use client";

import { useActionState } from "react";
import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement, RequirementStatus } from "@/lib/organization/onboardingRequirements";
import type { ActivityLogEntry } from "@/lib/admin/activityLog";
import {
  advanceOnboardingStageAction,
  completeOnboardingFromWorkspaceAction,
  updateOnboardingRequirementAction,
  type ActionState,
} from "./actions";

const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  pending: "Pending",
  satisfied: "Satisfied",
  waived: "Waived",
  not_applicable: "Not applicable",
};

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
          {(Object.keys(REQUIREMENT_STATUS_LABELS) as RequirementStatus[]).map((s) => (
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

export function OnboardingWorkspace({
  onboarding,
  pipelineStages,
  nextStageName,
  isTerminal,
  requirements,
  activity,
}: {
  onboarding: StaffOnboarding;
  pipelineStages: readonly string[];
  nextStageName: string | null;
  isTerminal: boolean;
  requirements: ResolvedRequirement[];
  activity: ActivityLogEntry[];
}) {
  const currentStageRequirements = requirements.filter((r) => r.stage === onboarding.stage);
  const approvals = requirements.filter((r) => r.requirementType === "approval");
  const documentsAndAgreements = requirements.filter((r) =>
    ["document", "agreement", "digital_signature", "physical_document"].includes(r.requirementType)
  );
  const tasks = requirements.filter((r) => r.requirementType === "task");

  return (
    <div className="space-y-6">
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
            {currentStageRequirements.some((r) => r.required && r.status !== "satisfied" && r.status !== "waived" && r.status !== "not_applicable") ? (
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
