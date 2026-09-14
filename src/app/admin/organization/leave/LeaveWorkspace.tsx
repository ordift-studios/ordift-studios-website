"use client";

import { useActionState } from "react";
import type { PendingLeaveRequest } from "@/lib/organization/leaveRequests";
import { decideLeaveRequestAction, ensureLeaveBalanceAction, type ActionState } from "./actions";

function DecideRequestForm({ request, leaveTypeName }: { request: PendingLeaveRequest; leaveTypeName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decideLeaveRequestAction, null);
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-3">
      <input type="hidden" name="requestId" value={request.id} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{request.profileFullName ?? "(no name on record)"}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {leaveTypeName} · {request.startDate} → {request.endDate} ({request.daysRequested} day{request.daysRequested === 1 ? "" : "s"})
            {request.halfAllocation ? ` · ${request.halfAllocation}` : ""}
          </p>
          {request.reason && <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{request.reason}&rdquo;</p>}
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans text-caption whitespace-nowrap">{request.status.replace(/_/g, " ")}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input name="alternativeStartDate" type="date" aria-label="Alternative start date (only if proposing alternative dates)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
        <input name="alternativeEndDate" type="date" aria-label="Alternative end date (only if proposing alternative dates)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      </div>
      <input name="decisionNotes" placeholder="Decision notes (optional)" className="w-full rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Saving…" : "Approve"}
        </button>
        <button type="submit" name="decision" value="alternative_proposed" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
          Propose Alternative Dates
        </button>
        <button type="submit" name="decision" value="declined" disabled={pending} className="font-sans text-caption text-red-700 underline underline-offset-4 disabled:opacity-50">
          Decline
        </button>
      </div>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Decision recorded.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function EnsureBalanceForm({ staffOptions, leaveTypeOptions }: { staffOptions: { id: string; name: string }[]; leaveTypeOptions: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(ensureLeaveBalanceAction, null);
  const currentYear = new Date().getUTCFullYear();
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="profileId" required defaultValue="" aria-label="Staff member" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Staff member…</option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select name="leaveTypeId" required defaultValue="" aria-label="Leave type" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Leave type…</option>
        {leaveTypeOptions.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <input name="leaveYear" type="number" required defaultValue={currentYear} aria-label="Leave year" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="entitlementDays" type="number" step="0.5" min="0" required placeholder="Entitlement days" aria-label="Entitlement days" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create Leave Balance"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Balance created.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function LeaveWorkspace({
  pendingRequests,
  leaveTypeNamesById,
  staffOptions,
  leaveTypeOptions,
}: {
  pendingRequests: PendingLeaveRequest[];
  leaveTypeNamesById: Record<string, string>;
  staffOptions: { id: string; name: string }[];
  leaveTypeOptions: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">
          Pending Requests {pendingRequests.length > 0 ? `(${pendingRequests.length})` : ""}
        </h2>
        {pendingRequests.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No leave requests are currently awaiting a decision.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((r) => (
              <DecideRequestForm key={r.id} request={r} leaveTypeName={leaveTypeNamesById[r.leaveTypeId] ?? "Unknown leave type"} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Create a Leave Balance</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          A person needs a leave balance for a given type/year before a request against it can be approved.
        </p>
        <EnsureBalanceForm staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} />
      </section>
    </div>
  );
}
