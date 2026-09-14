"use client";

import { useActionState } from "react";
import { submitOwnLeaveRequestAction, type ActionState } from "./actions";

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

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  alternative_proposed: "bg-ordift-gold-pressed/20 text-ordift-navy-950",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-black/5 text-ordift-ink-muted",
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

function RequestForm({ leaveTypeOptions }: { leaveTypeOptions: LeaveTypeOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitOwnLeaveRequestAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="leaveTypeId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Leave type…</option>
        {leaveTypeOptions.map((t) => (
          <option key={t.id} value={t.id}>{t.name}{t.requiresCertificate ? " (certificate required)" : ""}</option>
        ))}
      </select>
      <select name="halfAllocation" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Full-year allocation</option>
        <option value="H1">H1 planning allocation</option>
        <option value="H2">H2 planning allocation</option>
      </select>
      <input name="startDate" type="date" required aria-label="Start date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="endDate" type="date" required aria-label="End date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="daysRequested" type="number" step="0.5" min="0.5" required placeholder="Days requested" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="certificateReference" placeholder="Certificate reference (if required)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="reason" placeholder="Reason (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Submitting…" : "Submit Leave Request"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Submitted.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function RequestRow({ request }: { request: MyLeaveRequestView }) {
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
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[request.status] ?? "bg-black/5 text-ordift-ink-muted"}`}>
          {request.status.replace(/_/g, " ")}
        </span>
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

export function MyLeaveWorkspace({
  balances,
  requests,
  leaveTypeOptions,
}: {
  balances: LeaveBalanceView[];
  requests: MyLeaveRequestView[];
  leaveTypeOptions: LeaveTypeOption[];
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
    </div>
  );
}
