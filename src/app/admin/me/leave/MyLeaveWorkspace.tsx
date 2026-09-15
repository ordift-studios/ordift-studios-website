"use client";

import { useActionState, useState } from "react";
import {
  submitOwnLeaveRequestAction,
  cancelOwnLeaveRequestAction,
  proposeOwnLeaveSwapAction,
  respondToOwnLeaveSwapAction,
  cancelOwnLeaveSwapAction,
  type ActionState,
} from "./actions";

export interface LeaveTypeOption {
  id: string;
  name: string;
  requiresCertificate: boolean;
}

export interface LeaveBalanceView {
  leaveTypeId: string;
  leaveTypeName: string;
  entitlementDays: number;
  carriedOverDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface MyLeaveRequestView {
  id: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  halfAllocation: "H1" | "H2" | null;
  status: string;
  reason: string | null;
  alternativeStartDate: string | null;
  alternativeEndDate: string | null;
  decisionNotes: string | null;
}

export interface BiddingWindowView {
  half: "H1" | "H2";
  allocationDays: number;
  committedDays: number;
  remainingDays: number;
  windowOpen: boolean;
  windowOpensAt: string | null;
  windowClosesAt: string | null;
}

export interface SwapEligibleLeaveView {
  leaveRequestId: string;
  profileId: string;
  fullName: string | null;
  startDate: string;
  endDate: string;
  daysRequested: number;
}

export interface MySwapView {
  id: string;
  initiatorProfileId: string;
  counterpartProfileId: string;
  status: string;
  reason: string | null;
  isInitiator: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  alternative_proposed: "bg-ordift-gold-pressed/20 text-ordift-navy-950",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-black/5 text-ordift-ink-muted",
  proposed: "bg-amber-100 text-amber-800",
  accepted: "bg-ordift-gold-pressed/20 text-ordift-navy-950",
  rejected: "bg-red-100 text-red-800",
};

function BalanceCard({ balance }: { balance: LeaveBalanceView }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 space-y-1">
      <p className="font-sans text-caption font-semibold text-ordift-ink">{balance.leaveTypeName}</p>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{balance.remainingDays}</p>
      <p className="font-sans text-caption text-ordift-ink-muted">
        remaining of {balance.entitlementDays + balance.carriedOverDays}
        {balance.carriedOverDays > 0 ? ` (incl. ${balance.carriedOverDays} carried over)` : ""} — {balance.usedDays} used
      </p>
    </div>
  );
}

function BiddingWindowCard({ window }: { window: BiddingWindowView }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="font-sans text-caption font-semibold text-ordift-ink">{window.half} planning allocation</p>
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${window.windowOpen ? "bg-green-100 text-green-800" : "bg-black/5 text-ordift-ink-muted"}`}>
          {window.windowOpen ? "Window open" : "Window closed"}
        </span>
      </div>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{window.remainingDays}</p>
      <p className="font-sans text-caption text-ordift-ink-muted">
        remaining of {window.allocationDays} planning days ({window.committedDays} pending/approved)
      </p>
      {window.windowOpensAt && window.windowClosesAt && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          {new Date(window.windowOpensAt).toLocaleDateString()} → {new Date(window.windowClosesAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function RequestForm({ leaveTypeOptions }: { leaveTypeOptions: LeaveTypeOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitOwnLeaveRequestAction, null);
  const [halfAllocation, setHalfAllocation] = useState("");
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="leaveTypeId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Leave type…</option>
        {leaveTypeOptions.map((t) => (
          <option key={t.id} value={t.id}>{t.name}{t.requiresCertificate ? " (certificate required)" : ""}</option>
        ))}
      </select>
      <select name="halfAllocation" value={halfAllocation} onChange={(e) => setHalfAllocation(e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Full-year allocation</option>
        <option value="H1">H1 planning allocation (bid)</option>
        <option value="H2">H2 planning allocation (bid)</option>
      </select>
      <input name="startDate" type="date" required aria-label="Start date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="endDate" type="date" required aria-label="End date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      {!halfAllocation && (
        <input name="daysRequested" type="number" step="0.5" min="0.5" required placeholder="Days requested" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      )}
      {halfAllocation && (
        <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">
          Working days are calculated automatically from the public-holiday/working-day calendar for a bid.
        </p>
      )}
      <input name="certificateReference" placeholder="Certificate reference (if required)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="reason" placeholder="Reason (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Submitting…" : halfAllocation ? "Submit Leave Bid" : "Submit Leave Request"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">{state.info ?? "Submitted."}</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function CancelRequestButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelOwnLeaveRequestAction, null);
  if (!pending && state?.ok === true) return <span className="font-sans text-caption text-ordift-ink-muted">Cancelled.</span>;
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-medium text-ordift-ink-muted underline disabled:opacity-50">
        {pending ? "Cancelling…" : "Cancel"}
      </button>
      {!pending && state?.ok === false && <span className="ml-2 font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function RequestRow({ request }: { request: MyLeaveRequestView }) {
  const canCancel = request.status === "submitted" || request.status === "under_review";
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">
            {request.leaveTypeName} · {request.startDate} → {request.endDate} ({request.daysRequested} day{request.daysRequested === 1 ? "" : "s"})
            {request.halfAllocation ? ` · ${request.halfAllocation}` : ""}
          </p>
          {request.reason && <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{request.reason}&rdquo;</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[request.status] ?? "bg-black/5 text-ordift-ink-muted"}`}>
            {request.status.replace(/_/g, " ")}
          </span>
          {canCancel && <CancelRequestButton requestId={request.id} />}
        </div>
      </div>
      {request.status === "alternative_proposed" && request.alternativeStartDate && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Alternative dates proposed: {request.alternativeStartDate} → {request.alternativeEndDate}
          {request.decisionNotes ? ` — "${request.decisionNotes}"` : ""}
        </p>
      )}
      {request.status === "declined" && request.decisionNotes && (
        <p className="font-sans text-caption text-ordift-ink-muted">Reason: &ldquo;{request.decisionNotes}&rdquo;</p>
      )}
    </li>
  );
}

function ProposeSwapForm({ ownEligible, colleagueEligible }: { ownEligible: SwapEligibleLeaveView[]; colleagueEligible: SwapEligibleLeaveView[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(proposeOwnLeaveSwapAction, null);
  const [counterpartLeaveId, setCounterpartLeaveId] = useState("");
  const counterpartProfileId = colleagueEligible.find((l) => l.leaveRequestId === counterpartLeaveId)?.profileId ?? "";

  if (ownEligible.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">You have no approved, upcoming leave currently eligible to offer for a swap.</p>;
  }
  if (colleagueEligible.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">No colleague currently has approved, upcoming leave available to swap with.</p>;
  }

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="block sm:col-span-2">
        <span className="font-sans text-caption text-ordift-ink-muted">Your approved leave to offer</span>
        <select name="initiatorLeaveRequestId" required defaultValue="" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="" disabled>Select…</option>
          {ownEligible.map((l) => (
            <option key={l.leaveRequestId} value={l.leaveRequestId}>{l.startDate} → {l.endDate} ({l.daysRequested} day{l.daysRequested === 1 ? "" : "s"})</option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="font-sans text-caption text-ordift-ink-muted">Colleague&apos;s approved leave you want in exchange</span>
        <select name="counterpartLeaveRequestId" required value={counterpartLeaveId} onChange={(e) => setCounterpartLeaveId(e.target.value)} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="" disabled>Select…</option>
          {colleagueEligible.map((l) => (
            <option key={l.leaveRequestId} value={l.leaveRequestId}>{l.fullName ?? "Colleague"} · {l.startDate} → {l.endDate} ({l.daysRequested} day{l.daysRequested === 1 ? "" : "s"})</option>
          ))}
        </select>
      </label>
      <input type="hidden" name="counterpartProfileId" value={counterpartProfileId} />
      <input name="reason" placeholder="Reason (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">
        Both periods must cover the same number of working days. Your colleague must accept, then it requires manager/HR
        approval — nothing changes until then.
      </p>
      <button type="submit" disabled={pending || !counterpartProfileId} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Proposing…" : "Propose Swap"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Proposed.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function SwapRow({ swap }: { swap: MySwapView }) {
  const [respondState, respondAction, respondPending] = useActionState<ActionState, FormData>(respondToOwnLeaveSwapAction, null);
  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(cancelOwnLeaveSwapAction, null);

  const canRespond = !swap.isInitiator && swap.status === "proposed";
  const canCancel = swap.isInitiator && (swap.status === "proposed" || swap.status === "accepted");

  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-sans text-body-small font-medium text-ordift-ink">
          {swap.isInitiator ? "You proposed a swap" : "A colleague proposed a swap with you"}
          {swap.reason ? ` — "${swap.reason}"` : ""}
        </p>
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[swap.status] ?? "bg-black/5 text-ordift-ink-muted"}`}>
          {swap.status.replace(/_/g, " ")}
        </span>
      </div>
      {canRespond && (
        <div className="flex items-center gap-2">
          <form action={respondAction}>
            <input type="hidden" name="swapId" value={swap.id} />
            <input type="hidden" name="response" value="accepted" />
            <button type="submit" disabled={respondPending} className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">Accept</button>
          </form>
          <form action={respondAction}>
            <input type="hidden" name="swapId" value={swap.id} />
            <input type="hidden" name="response" value="declined" />
            <button type="submit" disabled={respondPending} className="font-sans text-caption font-medium px-3 py-1 rounded-md border border-black/15">Decline</button>
          </form>
        </div>
      )}
      {!respondPending && respondState?.ok === false && <p className="font-sans text-caption text-red-700">{respondState.error}</p>}
      {canCancel && (
        <form action={cancelAction}>
          <input type="hidden" name="swapId" value={swap.id} />
          <button type="submit" disabled={cancelPending} className="font-sans text-caption font-medium text-ordift-ink-muted underline disabled:opacity-50">
            {cancelPending ? "Cancelling…" : "Cancel proposal"}
          </button>
        </form>
      )}
      {!cancelPending && cancelState?.ok === false && <p className="font-sans text-caption text-red-700">{cancelState.error}</p>}
      {swap.status === "accepted" && <p className="font-sans text-caption text-ordift-ink-muted">Awaiting manager/HR approval.</p>}
    </li>
  );
}

export function MyLeaveWorkspace({
  balances,
  requests,
  leaveTypeOptions,
  biddingWindows,
  ownSwapEligibleLeave,
  swapEligibleColleagueLeave,
  swaps,
}: {
  balances: LeaveBalanceView[];
  requests: MyLeaveRequestView[];
  leaveTypeOptions: LeaveTypeOption[];
  biddingWindows: BiddingWindowView[];
  ownSwapEligibleLeave: SwapEligibleLeaveView[];
  swapEligibleColleagueLeave: SwapEligibleLeaveView[];
  swaps: MySwapView[];
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">My Balances</h2>
        {balances.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {balances.map((b) => (
              <BalanceCard key={b.leaveTypeId} balance={b} />
            ))}
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No leave balance has been set up for you yet — contact HR.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Leave Bidding — Annual Leave Planning</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {biddingWindows.map((w) => (
            <BiddingWindowCard key={w.half} window={w} />
          ))}
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">
          H1/H2 are planning allocations for pacing requests through the year — your real annual entitlement (above) is
          the only thing that is ever actually deducted, and only once a request is approved.
        </p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Request Leave</h2>
        <RequestForm leaveTypeOptions={leaveTypeOptions} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">My Requests {requests.length > 0 ? `(${requests.length})` : ""}</h2>
        {requests.length > 0 ? (
          <ul className="space-y-3">
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No leave requests yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Leave Swap</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Propose exchanging your approved leave dates with a colleague&apos;s. This never creates extra leave or moves
          entitlement between you — each of you keeps consuming your own balance, only the dates change, and only once
          your colleague accepts and a manager/HR approves.
        </p>
        <ProposeSwapForm ownEligible={ownSwapEligibleLeave} colleagueEligible={swapEligibleColleagueLeave} />
      </section>

      {swaps.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Swaps</h2>
          <ul className="space-y-3">
            {swaps.map((s) => (
              <SwapRow key={s.id} swap={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
