"use client";

import { useActionState } from "react";
import type { SeparationCase, NoticePolicySource, FinalSettlementStatus } from "@/lib/organization/separationCases";
import type { ResolvedSeparationRequirement } from "@/lib/organization/separationRequirements";
import type { RequirementStatus } from "@/lib/organization/onboardingRequirements";
import type { ActivityLogEntry } from "@/lib/admin/activityLog";
import {
  acknowledgeSeparationCaseAction,
  confirmLastWorkingDateAction,
  resolveNoticePolicyAction,
  updateFinalSettlementStatusAction,
  cancelSeparationCaseAction,
  finalizeSeparationClearanceAction,
  updateSeparationRequirementAction,
  type ActionState,
} from "./actions";

// Duplicated as literal arrays (not imported) deliberately — this is a
// client component, and separationCases.ts also exports real
// server-only functions (logActivity() -> next/headers); importing
// even a plain const from that module would pull its whole server-only
// dependency graph into the client bundle. Values must stay in sync
// with NOTICE_POLICY_SOURCES/FINAL_SETTLEMENT_STATUSES in
// separationCases.ts by hand — small, stable, rarely-changed lists.
const NOTICE_POLICY_SOURCE_OPTIONS: readonly NoticePolicySource[] = ["contract", "company_policy", "statutory_override", "unresolved"];
const FINAL_SETTLEMENT_STATUS_OPTIONS: readonly FinalSettlementStatus[] = ["not_started", "handoff_requested", "in_progress", "completed"];

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
  return <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${styles[status]}`}>{REQUIREMENT_STATUS_LABELS[status]}</span>;
}

// One clearance item's own isolated success/error state — same
// reasoning as the Onboarding Workspace's RequirementRow.
function ClearanceItemRow({ separationCaseId, profileId, requirement }: { separationCaseId: string; profileId: string; requirement: ResolvedSeparationRequirement }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSeparationRequirementAction, null);
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="requirementKey" value={requirement.requirementKey} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{requirement.label}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {REQUIREMENT_TYPE_LABELS[requirement.requirementType]} · Area: {requirement.stage} ·{" "}
            {requirement.required ? "Required" : "Optional"}
            {requirement.isDerived && !requirement.row ? " · live-derived" : ""}
          </p>
        </div>
        <StatusPill status={requirement.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={requirement.status} className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
          {(Object.keys(REQUIREMENT_STATUS_LABELS) as RequirementStatus[]).map((s) => (
            <option key={s} value={s}>{REQUIREMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <label className="font-sans text-caption text-ordift-ink-muted flex items-center gap-1">
          <input type="checkbox" name="verifiedNow" />
          Mark verified now (by me)
        </label>
        <input type="text" name="notes" placeholder="Notes" defaultValue={requirement.row?.notes ?? ""} className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-32" />
        <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
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

function AcknowledgeControl({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acknowledgeSeparationCaseAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Acknowledging…" : "Record Company Acknowledgement"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Acknowledged.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function ConfirmLastWorkingDateControl({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(confirmLastWorkingDateAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input type="date" name="date" required className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Confirming…" : "Confirm Last Working Date"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Confirmed.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function NoticePolicyControl({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveNoticePolicyAction, null);
  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <select name="source" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
        <option value="" disabled>Notice policy source…</option>
        {NOTICE_POLICY_SOURCE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </select>
      <input name="reference" placeholder="Reference (contract clause / policy pointer)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
      <input name="requiredDays" type="number" min="0" placeholder="Required days (if resolved)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
      <button type="submit" disabled={pending} className="col-span-2 font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Record Notice Resolution"}
      </button>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Recorded.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function FinalSettlementControl({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateFinalSettlementStatusAction, null);
  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <select name="status" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
        <option value="" disabled>Final settlement status…</option>
        {FINAL_SETTLEMENT_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </select>
      <input name="reference" placeholder="Reference (pointer only, e.g. a future Payables record)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
      <button type="submit" disabled={pending} className="col-span-2 font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Update Final Settlement Status"}
      </button>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Updated.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function FinalizeClearanceControl({ separationCaseId, profileId }: { separationCaseId: string; profileId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(finalizeSeparationClearanceAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Recording…" : "Record Final Clearance"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Final clearance recorded.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function CancelCaseControl({ separationCaseId }: { separationCaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelSeparationCaseAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="separationCaseId" value={separationCaseId} />
      <input name="reason" placeholder="Cancellation reason (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <button type="submit" disabled={pending} className="font-sans text-caption text-red-700 underline underline-offset-4 disabled:opacity-50">
        {pending ? "Cancelling…" : "Cancel Case"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Cancelled.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

export function SeparationWorkspace({
  separationCase,
  requirements,
  activity,
}: {
  separationCase: SeparationCase;
  requirements: ResolvedSeparationRequirement[];
  activity: ActivityLogEntry[];
}) {
  const requiredUnsatisfiedCount = requirements.filter(
    (r) => r.required && r.status !== "satisfied" && r.status !== "waived" && r.status !== "not_applicable"
  ).length;
  const isOpen = separationCase.status === "open";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Case Status</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Category: <span className="font-medium text-ordift-ink">{separationCase.category.replace(/_/g, " ")}</span> · Reason:{" "}
          <span className="font-medium text-ordift-ink">{separationCase.reasonType.replace(/_/g, " ")}</span> · Status:{" "}
          <span className="font-medium text-ordift-ink">{separationCase.status}</span>
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Initiated by: {separationCase.initiatedByRole} · Submitted: {new Date(separationCase.submittedAt).toLocaleDateString()}
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Proposed last working date: {separationCase.proposedLastWorkingDate ?? "—"} · Confirmed:{" "}
          {separationCase.confirmedLastWorkingDate ?? "Not yet confirmed"}
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Company acknowledgement: {separationCase.companyAcknowledgedAt ? new Date(separationCase.companyAcknowledgedAt).toLocaleString() : "Not yet recorded"}
        </p>
        {isOpen && (
          <div className="flex flex-wrap gap-4 pt-2">
            {!separationCase.companyAcknowledgedAt && <AcknowledgeControl separationCaseId={separationCase.id} />}
            <ConfirmLastWorkingDateControl separationCaseId={separationCase.id} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Notice Policy</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          {separationCase.noticePolicySource
            ? `Source: ${separationCase.noticePolicySource.replace(/_/g, " ")}${separationCase.noticeReference ? ` — ${separationCase.noticeReference}` : ""}${separationCase.noticeRequiredDays !== null ? ` (${separationCase.noticeRequiredDays} days)` : ""}`
            : "Not yet resolved — no jurisdiction-specific notice formula is implemented; this is recorded once a policy/contract/statutory rule is determined."}
        </p>
        {isOpen && <NoticePolicyControl separationCaseId={separationCase.id} />}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Clearance Requirements</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          {requiredUnsatisfiedCount === 0
            ? "All required clearance items are satisfied, waived, or not applicable."
            : `${requiredUnsatisfiedCount} required item(s) outstanding.`}
        </p>
        <div className="space-y-2">
          {requirements.map((r) => (
            <ClearanceItemRow key={r.requirementKey} separationCaseId={separationCase.id} profileId={separationCase.profileId} requirement={r} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Final Settlement (Finance handoff — status only)</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Status: {separationCase.finalSettlementStatus.replace(/_/g, " ")}
          {separationCase.finalSettlementReference ? ` · Reference: ${separationCase.finalSettlementReference}` : ""}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          No amount is calculated or paid here — Finance remains independently controlled via Payables.
        </p>
        {isOpen && <FinalSettlementControl separationCaseId={separationCase.id} />}
      </section>

      {isOpen && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Final Clearance</h2>
          {requiredUnsatisfiedCount > 0 ? (
            <p className="font-sans text-caption text-amber-700">Required clearance items remain outstanding above — resolve them before recording final clearance.</p>
          ) : (
            <FinalizeClearanceControl separationCaseId={separationCase.id} profileId={separationCase.profileId} />
          )}
          <div className="pt-2 border-t border-black/10">
            <CancelCaseControl separationCaseId={separationCase.id} />
          </div>
        </section>
      )}

      {!isOpen && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted">
            This case is <span className="font-medium text-ordift-ink">{separationCase.status}</span>
            {separationCase.finalClearanceAt ? ` — final clearance recorded ${new Date(separationCase.finalClearanceAt).toLocaleString()}.` : "."}
          </p>
        </section>
      )}

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
