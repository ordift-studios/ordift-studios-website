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
    details.service || details.location || details.scheduleStart || details.instructors.length > 0;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
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
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Participants</p>
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
