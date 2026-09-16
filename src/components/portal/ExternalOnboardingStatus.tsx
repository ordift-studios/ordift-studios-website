import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement } from "@/lib/organization/onboardingRequirements";

// External Party Dashboards (2026-09-16 Universal Onboarding Engine) —
// the shared, read-only onboarding/requirements status view for
// Contractor/Freelancer, Instructor, and Model/Talent self-service
// portals. Vendor keeps its own richer VendorOnboardingStatus (document
// upload + Framework Agreement lifecycle actions, genuinely more than
// status display) — this component is deliberately the smaller,
// generic core every other classification reuses rather than each
// hand-rolling its own requirements list. Every requirement shown here
// (label + status) comes straight from listResolvedRequirements() —
// the SAME evidence-only derive() results the admin side sees, never a
// second, friendlier-looking fiction.

const STAGE_LABELS: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  invited: "Invited",
  profile: "Profile",
  payment_setup: "Payment Setup",
  engagement_assigned: "Engagement Assigned",
  active: "Onboarding Complete",
};

const STATUS_STYLES: Record<string, string> = {
  satisfied: "bg-green-100 text-green-800",
  waived: "bg-black/5 text-ordift-ink-muted",
  not_applicable: "bg-black/5 text-ordift-ink-muted",
  deferred: "bg-amber-100 text-amber-800",
  pending: "bg-red-50 text-red-700",
};

export function ExternalOnboardingStatus({
  onboarding,
  resolvedRequirements,
}: {
  onboarding: StaffOnboarding | null;
  resolvedRequirements: ResolvedRequirement[];
}) {
  if (!onboarding) {
    return (
      <section className="bg-white border border-black/10 rounded-2xl p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Onboarding</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Onboarding has not started yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Onboarding</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Stage: {STAGE_LABELS[onboarding.stage] ?? onboarding.stage} · Status: {onboarding.status.replace(/_/g, " ")}
        </p>
      </div>
      {resolvedRequirements.length > 0 && (
        <ul className="space-y-2">
          {resolvedRequirements.map((r) => (
            <li key={r.requirementKey} className="flex items-center justify-between gap-3">
              <span className="font-sans text-body-small text-ordift-ink">{r.label}</span>
              <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[r.status] ?? "bg-black/5"}`}>
                {r.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
