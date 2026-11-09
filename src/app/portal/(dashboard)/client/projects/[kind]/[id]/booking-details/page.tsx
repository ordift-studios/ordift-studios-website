import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspaceBookingDetails, isProjectKind } from "@/lib/portal/workspace";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function BookingDetailsTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const details = await getWorkspaceBookingDetails(kind, id, user.id);
  if (!details) return null;

  const hasAnyDetail =
    details.service || details.location || details.scheduleStart || details.instructors.length > 0 || Boolean(details.booking);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
      {details.booking?.state === "confirmed" && (
        <div data-testid="client-booking-confirmed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Confirmed booking · {details.booking.reference}</p>
          <ul className="mt-1 space-y-2">
            {details.booking.sessions.map((s, i) => (
              <li key={i} className="font-sans text-body text-ordift-ink">
                {s.when}
                <span className="block font-sans text-body-small text-ordift-ink-muted">{s.place}{s.note ? ` · ${s.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.booking?.state === "cancelled" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" data-testid="client-booking-cancelled">
          <p className="font-sans text-body-small font-semibold text-amber-950">{details.booking.final ? "Booking Cancelled" : "Booking Cancelled — Rescheduling Pending"}</p>
          <p className="font-sans text-caption text-amber-950 mt-1">{details.booking.final
            ? `Your booking (${details.booking.reference}) has been cancelled and is no longer confirmed. No new date is planned. Your accepted quotation and any payment you have made are unchanged; we will contact you separately about anything that needs deciding.`
            : `Your booking (${details.booking.reference}) is no longer confirmed. Your accepted quotation and any payment you have made are unchanged. We will agree a new date with you; it is confirmed only when you receive a new Booking Confirmed message.`}</p>
        </div>
      )}

      {details.service && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Service</p>
          <p className="font-sans text-body text-ordift-ink mt-1">{details.service}</p>
        </div>
      )}

      {details.location && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Location</p>
          <p className="font-sans text-body text-ordift-ink mt-1">{details.location}</p>
        </div>
      )}

      {details.scheduleStart && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Schedule</p>
          <p className="font-sans text-body text-ordift-ink mt-1">
            {formatDate(details.scheduleStart)}
            {details.scheduleEnd && details.scheduleEnd !== details.scheduleStart
              ? ` – ${formatDate(details.scheduleEnd)}`
              : ""}
          </p>
        </div>
      )}

      {details.instructors.length > 0 && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Instructors</p>
          <p className="font-sans text-body text-ordift-ink mt-1">{details.instructors.join(", ")}</p>
        </div>
      )}

      {!hasAnyDetail && (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          No additional booking details are available yet.
        </p>
      )}
    </div>
  );
}
