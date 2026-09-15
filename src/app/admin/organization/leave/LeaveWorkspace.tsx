"use client";

import { useActionState } from "react";
import type { PendingLeaveRequest } from "@/lib/organization/leaveRequests";
import type { LeaveBiddingWindow, LeaveBiddingHalf } from "@/lib/organization/leaveBidding";
import type { PendingLeaveSwap } from "@/lib/organization/leaveSwap";
import { decideLeaveRequestAction, ensureLeaveBalanceAction, configureLeaveBiddingWindowAction, decideLeaveSwapAction, type ActionState } from "./actions";

function DecideRequestForm({
  request,
  leaveTypeName,
  biddingContext,
}: {
  request: PendingLeaveRequest;
  leaveTypeName: string;
  biddingContext?: { drawForwardRequired: boolean; drawForwardAllowed: boolean };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decideLeaveRequestAction, null);
  const isBid = Boolean(request.halfAllocation);
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-3">
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="isBid" value={isBid ? "true" : "false"} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{request.profileFullName ?? "(no name on record)"}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {leaveTypeName} · {request.startDate} → {request.endDate} ({request.daysRequested} day{request.daysRequested === 1 ? "" : "s"})
            {request.halfAllocation ? ` · ${request.halfAllocation} bid` : ""}
          </p>
          {request.reason && <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{request.reason}&rdquo;</p>}
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans text-caption whitespace-nowrap">{request.status.replace(/_/g, " ")}</span>
      </div>

      {biddingContext?.drawForwardRequired && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
          <p className="font-sans text-caption text-amber-800">
            This bid exceeds the requester&apos;s remaining planning allocation for {request.halfAllocation}.
            {biddingContext.drawForwardAllowed ? " Approving it requires explicit draw-forward approval." : " Draw-forward is not configured as permitted for this window — approval will be refused."}
          </p>
          {biddingContext.drawForwardAllowed && (
            <label className="flex items-center gap-2 font-sans text-caption text-ordift-ink">
              <input type="checkbox" name="drawForwardApproved" value="true" />
              Approve draw-forward for this bid
            </label>
          )}
        </div>
      )}

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

function DecideSwapForm({ swap }: { swap: PendingLeaveSwap }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decideLeaveSwapAction, null);
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-3">
      <input type="hidden" name="swapId" value={swap.id} />
      <p className="font-sans text-body-small font-medium text-ordift-ink">
        {swap.initiatorFullName ?? "Employee"} ↔ {swap.counterpartFullName ?? "Employee"}
        {swap.reason ? ` — "${swap.reason}"` : ""}
      </p>
      <p className="font-sans text-caption text-ordift-ink-muted">Both parties have accepted — this is now awaiting your decision.</p>
      <input name="decisionNotes" placeholder="Decision notes (optional)" className="w-full rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Saving…" : "Approve Swap"}
        </button>
        <button type="submit" name="decision" value="rejected" disabled={pending} className="font-sans text-caption text-red-700 underline underline-offset-4 disabled:opacity-50">
          Reject
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

function ConfigureWindowForm({ half, currentYear, existing }: { half: LeaveBiddingHalf; currentYear: number; existing: LeaveBiddingWindow | undefined }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(configureLeaveBiddingWindowAction, null);
  const toLocalInput = (iso: string | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <input type="hidden" name="jurisdiction" value="GH" />
      <input type="hidden" name="leaveYear" value={currentYear} />
      <input type="hidden" name="half" value={half} />
      <p className="font-sans text-body-small font-semibold text-ordift-ink">{half} {currentYear}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="font-sans text-caption text-ordift-ink-muted">Planning allocation (days)</span>
          <input name="planningAllocationDays" type="number" min="0.5" step="0.5" required defaultValue={existing?.planningAllocationDays ?? 10} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        </label>
        <label className="flex items-center gap-2 mt-6 font-sans text-caption text-ordift-ink">
          <input type="checkbox" name="drawForwardAllowed" defaultChecked={existing?.drawForwardAllowed ?? false} />
          Draw-forward permitted this window
        </label>
        <label className="block">
          <span className="font-sans text-caption text-ordift-ink-muted">Opens</span>
          <input name="windowOpensAt" type="datetime-local" required defaultValue={toLocalInput(existing?.windowOpensAt)} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        </label>
        <label className="block">
          <span className="font-sans text-caption text-ordift-ink-muted">Closes</span>
          <input name="windowClosesAt" type="datetime-local" required defaultValue={toLocalInput(existing?.windowClosesAt)} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        </label>
      </div>
      <input name="notes" placeholder="Notes (optional)" defaultValue={existing?.notes ?? ""} className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : existing ? "Update Window" : "Create Window"}
      </button>
      {!pending && state?.ok === true && <span className="ml-2 font-sans text-caption text-green-700">Saved.</span>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function LeaveWorkspace({
  pendingRequests,
  leaveTypeNamesById,
  biddingContextByRequestId,
  pendingSwaps,
  windows,
  currentYear,
  halves,
  staffOptions,
  leaveTypeOptions,
  canManageWindowsAndBalances,
}: {
  pendingRequests: PendingLeaveRequest[];
  leaveTypeNamesById: Record<string, string>;
  biddingContextByRequestId: Record<string, { drawForwardRequired: boolean; drawForwardAllowed: boolean }>;
  pendingSwaps: PendingLeaveSwap[];
  windows: LeaveBiddingWindow[];
  currentYear: number;
  halves: readonly LeaveBiddingHalf[];
  staffOptions: { id: string; name: string }[];
  leaveTypeOptions: { id: string; name: string }[];
  canManageWindowsAndBalances: boolean;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">
          Pending Requests {pendingRequests.length > 0 ? `(${pendingRequests.length})` : ""}
        </h2>
        {pendingRequests.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No leave requests are currently awaiting your decision.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((r) => (
              <DecideRequestForm key={r.id} request={r} leaveTypeName={leaveTypeNamesById[r.leaveTypeId] ?? "Unknown leave type"} biddingContext={biddingContextByRequestId[r.id]} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">
          Pending Swaps {pendingSwaps.length > 0 ? `(${pendingSwaps.length})` : ""}
        </h2>
        {pendingSwaps.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No leave swaps are currently awaiting your decision.</p>
        ) : (
          <div className="space-y-3">
            {pendingSwaps.map((s) => (
              <DecideSwapForm key={s.id} swap={s} />
            ))}
          </div>
        )}
      </section>

      {canManageWindowsAndBalances && (
        <>
          <section className="space-y-3">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Leave Bidding Windows ({currentYear})</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">
              Configurable per jurisdiction/year/half — never hardcoded. Changing these does not retroactively affect
              already-decided requests.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {halves.map((half) => (
                <ConfigureWindowForm key={half} half={half} currentYear={currentYear} existing={windows.find((w) => w.half === half)} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Create a Leave Balance</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">
              A person needs a leave balance for a given type/year before a request against it can be approved.
            </p>
            <EnsureBalanceForm staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} />
          </section>
        </>
      )}
    </div>
  );
}
