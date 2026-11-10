import type { BookingPanelData, CurrentBooking } from "@/lib/bookings/panel";
import { isoToZonedLocal } from "@/lib/bookings/form";
import BookingConfirmForm, { type SegmentDraft } from "./BookingConfirmForm";
import BookingCancelForm from "./BookingCancelForm";
import BookingNotificationsCard from "./BookingNotificationsCard";
import CancellationMoneyCard from "./CancellationMoneyCard";

// The "Booking" panel on the enquiry page. The data arrives already PROJECTED for the viewer (src/lib/bookings/panel.ts + rules.projectPanel):
//   Super Admin: everything, plus the confirm / change / cancel controls.   Admin: operational blockers and the schedule, never amounts or the confirmation record.
//   Staff: only conflicts on their OWN assignment.   Everyone else: the page renders nothing.
// This component decides nothing about permission; it only draws what it was given.

const card = "rounded-xl border border-black/10 bg-white p-6 space-y-4";
const fmt = (iso: string, tz: string) => `${isoToZonedLocal(iso, tz).replace("T", " ")} (${tz})`;

function Schedule({ b }: { b: CurrentBooking }) {
  return (
    <ul className="space-y-1 font-sans text-body-small text-ordift-ink">
      {b.segments.map((s, i) => <li key={i}>Session {i + 1}: {fmt(s.startsAt, s.timezone)} to {isoToZonedLocal(s.endsAt, s.timezone).replace("T", " ")} · {s.kind === "online" ? `Online (${s.platform})` : s.kind === "studio" ? `Studio (${s.location})` : s.location}{s.note ? ` · ${s.note}` : ""}</li>)}
    </ul>
  );
}
const Conflicts = ({ list }: { list: { kind: string; firm: boolean; label: string; from: string; to: string }[] }) => list.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No scheduling conflicts.</p> : (
  <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink">{list.map((c) => <li key={`${c.kind}${c.label}${c.from}`}>{c.firm ? "Firm" : "In progress"}: {c.label} ({c.kind.replace("_", " ")}) · {c.from.slice(0, 10)} to {c.to.slice(0, 10)}</li>)}</ul>
);

export default function BookingPanel({ data, earlierCheck = null }: { data: BookingPanelData; earlierCheck?: { label: string; at: string } | null }) {
  const a = data.assessment as (null | { level: string; blockers?: string[]; conflicts?: { kind: string; firm: boolean; label: string; from: string; to: string }[]; agreement?: { required: boolean; reasons: string[] } });
  if (data.notReady) return <section className={card}><h2 className="font-serif font-medium text-body text-ordift-ink">Booking</h2><p className="font-sans text-body-small text-ordift-ink-muted">{data.notReady}</p></section>;
  if (!a) return null;

  if (data.level === "staff") {
    return <section className={card}><h2 className="font-serif font-medium text-body text-ordift-ink">Your assignment: scheduling conflicts</h2><Conflicts list={a.conflicts ?? []} /></section>;
  }

  const live = data.current && data.current.kind !== "cancelled" ? data.current : null;
  return (
    <section className={card} aria-labelledby="booking-heading">
      <div>
        <h2 id="booking-heading" className="font-serif font-medium text-body text-ordift-ink">Booking</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">{live ? `Confirmed (version ${live.version})${live.assignedLabel ? ` · ${live.assignedLabel}` : ""}` : data.current?.kind === "cancelled" ? `Booking Cancelled — Rescheduling Pending (version ${data.current.version}): ${data.current.reason ?? ""}` : "Not booked yet"}</p>
      </div>

      {earlierCheck ? <p className="font-sans text-caption text-ordift-ink-muted">Earlier availability check before quoting: {earlierCheck.label} ({new Date(earlierCheck.at).toISOString().slice(0, 10)}). It was not a reservation. Scheduling conflicts are checked again now, and this check decides nothing.</p> : null}

      {live ? <Schedule b={live} /> : null}

      <div>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-1">Blockers right now</p>
        {(a.blockers ?? []).length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None.</p>
          : <ul className="list-disc pl-5 space-y-1 font-sans text-body-small text-ordift-ink">{(a.blockers ?? []).map((b) => <li key={b}>{b}</li>)}</ul>}
        {data.entityBlockers.length > 0 ? <ul className="list-disc pl-5 mt-1 font-sans text-body-small text-amber-900">{data.entityBlockers.map((b) => <li key={b}>{b}</li>)}</ul> : null}
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">{a.agreement?.required ? `Agreement required (${a.agreement.reasons.join(", ")})${data.agreementReference ? ` · executed agreement ${data.agreementReference} found` : " · none executed yet"}` : "No agreement required"}</p>
      </div>

      <div><p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-1">Scheduling conflicts</p><Conflicts list={a.conflicts ?? []} /></div>

      {data.level === "super_admin" || data.level === "admin" ? <BookingNotificationsCard enquiryId={data.enquiry.id} jobs={data.notifications} currentConfirmationId={data.current?.id ?? null} level={data.level} /> : null}

      {data.level === "super_admin" || data.level === "admin" ? <CancellationMoneyCard enquiryId={data.enquiry.id} rows={data.financial} money={data.money} level={data.level} viewerId={data.viewerId} finalCancelled={data.current?.kind === "cancelled" && data.current.cancellationOutcome === "final"} /> : null}

      {data.level === "admin" ? <p className="font-sans text-caption text-ordift-ink-muted">Only a Super Admin can confirm, change or cancel a booking.</p> : null}

      {data.level === "super_admin" && data.canConfirm && data.quotation && data.settings ? (
        <>
          <div className="border-t border-black/10 pt-4 space-y-2">
            <p className="font-sans text-body-small font-medium text-ordift-ink">{live ? "Change this booking" : "Confirm this booking"}</p>
            <p className="font-sans text-caption text-ordift-ink-muted">Accepted quotation {data.quotation.reference} · payment condition: {data.quotation.paymentCondition === "none" ? "no upfront payment" : data.quotation.paymentCondition === "deposit" ? `${data.quotation.depositPercent}% deposit` : "full payment before confirmation"}{data.quotation.termsText ? ` · written terms: “${data.quotation.termsText}”` : " · no written payment terms"}</p>
            <BookingConfirmForm
              key={live?.id ?? "new"} enquiryId={data.enquiry.id} quotationId={data.quotation.id} reference={data.enquiry.reference} expectedVersion={data.current?.version ?? 0} isChange={Boolean(live)}
              assignable={data.assignable} escalatorOptions={data.settings.escalators}
              initial={{ assignedProfileId: live?.assignedProfileId ?? null, basis: "", segments: (live?.segments ?? []).map((s): SegmentDraft => ({ start: isoToZonedLocal(s.startsAt, s.timezone), end: isoToZonedLocal(s.endsAt, s.timezone), tz: s.timezone, kind: s.kind, location: s.location ?? "", platform: s.platform ?? "", note: s.note ?? "" })) }}
            />
          </div>
          {live ? <div className="border-t border-black/10 pt-4 space-y-2"><p className="font-sans text-body-small font-medium text-ordift-ink">Cancel this booking</p><BookingCancelForm enquiryId={data.enquiry.id} reference={data.enquiry.reference} expectedVersion={live.version} /></div> : null}
        </>
      ) : null}
    </section>
  );
}
