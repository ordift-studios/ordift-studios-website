import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { listTalentOnboardingCandidates } from "@/lib/talent/talentOverview";
import { listTalentCategories } from "@/lib/talent/talentProfiles";
import { REPRESENTATION_STATUSES } from "@/lib/talent/talentRepresentation";
import { NewTalentForm } from "./NewTalentForm";

export const metadata: Metadata = { title: "Add Talent — Ordift Studios Admin", robots: { index: false, follow: false } };

// Admin onboarding, "Add Talent" (2026-09-09) — the smallest addition
// to the existing Talent Management architecture, not a redesign: this
// screen only creates the model_profiles row (via createTalentProfile,
// talentProfiles.ts) for a person who already holds the `model`
// account role, granted separately via the existing Users & Roles
// area. The public Sanity talentProfile document (name/slug/hero
// image/gallery) remains a deliberately separate, later, Studio-
// authored step — see /admin/talent/[id]/page.tsx's own note on that
// boundary. This page does not touch Sanity at all.
export default async function AdminAddTalentPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  // Same real capability check as the "+ Add Talent" button's
  // visibility on /admin/talent — redirects an unauthorized viewer
  // away from an otherwise-empty form rather than letting them reach
  // it and only fail on submit. The server action re-checks this
  // independently regardless.
  const canAdministerTalent = (await authorizeWithSuperAdminOverride(user.id, TALENT_CAPABILITIES.profileAdminister)).ok;
  if (!canAdministerTalent) redirect("/admin/talent");

  const [candidates, categories] = await Promise.all([listTalentOnboardingCandidates(), listTalentCategories()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/talent" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Talent Management
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">Add Talent</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1 max-w-xl">
          Creates a talent record for a person who already holds the Model role — the public portfolio (imagery, gallery, reel) is added afterward, separately,
          in Sanity Studio. The record is created as Draft and is never publicly visible until a deliberate later publish step.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink">
            No eligible people found. A person must already hold the <strong>Model</strong> account role before they can be onboarded here — grant it via{" "}
            <Link href="/admin/users" className="underline">
              Users &amp; Roles
            </Link>
            , then return to this page.
          </p>
        </div>
      ) : (
        <NewTalentForm candidates={candidates} categories={categories} representationStatuses={[...REPRESENTATION_STATUSES]} />
      )}
    </div>
  );
}
