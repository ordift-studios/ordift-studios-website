import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";
import { listSalaryAdvancesForProfile, listStaffBenefitTransactionsForProfile, listLongServiceBenefitAwardsForProfile } from "@/lib/organization/compensation";
import { MyCompensationWorkspace } from "./MyCompensationWorkspace";

export const metadata: Metadata = {
  title: "My Compensation — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service — My Compensation (Phase B5 Step 16,
// 2026-09-14). Every read is always scoped to the CURRENT user's own
// id. requestSalaryAdvance() already supported self-submission at the
// backend (canManageCompensation() is bypassed when actorUserId ===
// profileId) — this is its first real UI.
export default async function MyCompensationPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [terms, advances, benefitTransactions, longServiceAwards] = await Promise.all([
    getCurrentEmploymentTerms(user.id),
    listSalaryAdvancesForProfile(user.id),
    listStaffBenefitTransactionsForProfile(user.id),
    listLongServiceBenefitAwardsForProfile(user.id),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Compensation</h1>
      </div>

      <MyCompensationWorkspace
        basicSalary={terms?.basicSalary ?? null}
        workPattern={terms?.workPattern ?? null}
        advances={advances}
        benefitTransactions={benefitTransactions}
        longServiceAwards={longServiceAwards}
      />
    </div>
  );
}
