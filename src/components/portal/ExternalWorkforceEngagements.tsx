import Link from "next/link";
import type { MyEngagement } from "@/lib/portal/engagementPortalData";

// Phase K.1 (2026-09-05) — the Active/Completed/Cancelled engagement
// list, extracted from the collaborator (contractor) dashboard so
// Vendor and Model can reuse it verbatim rather than re-implementing
// their own flat, history-less list. Every relationship's engagements
// link to the same shared detail page (/portal/collaborator/engagement/[id])
// — that page itself decides which modules (Files, Feedback) to show,
// based on the viewer's actual relationship, not on which index page
// linked them there. Kept relationship-agnostic on purpose: this
// component has no idea whether it's rendering for a contractor,
// vendor, or model — it only ever receives the engagement groups and a
// base path, exactly the shape a future supported relationship (e.g.
// an Instructor paid through a real `engagements` row rather than the
// separate legacy workshop_instructor_engagements table) could reuse
// without any new component.
export default function ExternalWorkforceEngagements({
  engagementBasePath,
  active,
  completed,
  cancelled,
  emptyActiveMessage,
  heading = "Engagements",
  itemFallbackLabel = "Engagement",
}: {
  engagementBasePath: string;
  active: MyEngagement[];
  completed: MyEngagement[];
  cancelled: MyEngagement[];
  emptyActiveMessage: string;
  // Contextual label only (e.g. Model's "Bookings"/"Booking") — never
  // affects which data loads or which modules render; that's decided
  // entirely by modulesForRelationship(), upstream of this component.
  heading?: string;
  itemFallbackLabel?: string;
}) {
  return (
    <>
      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">{heading}</h2>
        {active.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8">
            <p className="font-sans text-body-small text-ordift-ink-muted">{emptyActiveMessage}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((e) => (
              <li key={e.id}>
                <Link
                  href={`${engagementBasePath}/${e.id}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {e.operationalTitleName ?? itemFallbackLabel} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                    Status: {e.status} {e.agreedAmount ? `· ${e.currency ?? ""} ${e.agreedAmount}` : ""}
                    {e.dueDate ? ` · Due ${new Date(e.dueDate).toLocaleDateString()}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Completed work stays reachable as history rather than
          disappearing; kept separate from Cancelled, since a delivered
          engagement isn't equivalent history to one that was called off. */}
      {completed.length > 0 && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Completed</h2>
          <ul className="space-y-3">
            {completed.map((e) => (
              <li key={e.id}>
                <Link
                  href={`${engagementBasePath}/${e.id}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {e.operationalTitleName ?? itemFallbackLabel} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                    Status: Completed {e.agreedAmount ? `· ${e.currency ?? ""} ${e.agreedAmount}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cancelled.length > 0 && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Cancelled</h2>
          <ul className="space-y-3">
            {cancelled.map((e) => (
              <li key={e.id}>
                <Link
                  href={`${engagementBasePath}/${e.id}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {e.operationalTitleName ?? itemFallbackLabel} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">Status: Cancelled</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
