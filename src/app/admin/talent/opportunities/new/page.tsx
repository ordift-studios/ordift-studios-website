import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { listTalentCategories } from "@/lib/talent/talentProfiles";
import { NewOpportunityForm } from "./NewOpportunityForm";

export const metadata: Metadata = { title: "New Opportunity — Ordift Studios Admin", robots: { index: false, follow: false } };

// Opportunities Admin (2026-09-09) — same page-gate + real-capability-
// redirect pattern as /admin/talent/new: an unauthorized viewer is
// bounced away from an otherwise-empty form rather than reaching it
// and only failing on submit. createOpportunityAction re-checks this
// independently regardless.
export default async function NewOpportunityPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const canAdministerOpportunities = (await authorizeWithSuperAdminOverride(user.id, TALENT_CAPABILITIES.opportunityAdminister)).ok;
  if (!canAdministerOpportunities) redirect("/admin/talent/opportunities");

  const categories = await listTalentCategories();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/talent/opportunities" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Opportunities
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">New Opportunity</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1 max-w-xl">
          Created as an internal record only — never publicly listed. Adding candidates afterward never books or engages
          them.
        </p>
      </div>

      <NewOpportunityForm categories={categories} />
    </div>
  );
}
