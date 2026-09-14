import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageSeparationCases, getSeparationCaseById } from "@/lib/organization/separationCases";
import { getFinalSettlementForSeparationCase, listFinalSettlementDeductions } from "@/lib/organization/finalSettlements";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { FinalSettlementWorkspace } from "./FinalSettlementWorkspace";

export const metadata: Metadata = {
  title: "Final Settlement — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 4 (2026-09-14) —
// OS-HR-GH-006 5's real componentized formula. gross_entitlements/
// net_final_settlement are database GENERATED columns (migration 0092,
// repointed to separation_cases by migration 0104) — this page only
// ever displays them, never computes them itself.
export default async function FinalSettlementPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/admin/overview");
  if (!(await canManageSeparationCases(currentUser.id))) redirect("/admin/overview");

  const separationCase = await getSeparationCaseById(caseId);
  if (!separationCase) notFound();

  const usersResult = await listUsersWithRoles();
  const person = usersResult.ok ? usersResult.users.find((u) => u.id === separationCase.profileId) : undefined;

  const settlement = await getFinalSettlementForSeparationCase(caseId);
  const deductions = settlement ? await listFinalSettlementDeductions(settlement.id) : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization · Separation · Final Settlement
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {person?.fullName ?? "Final Settlement"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href={`/admin/organization/separation/${caseId}`} className="underline underline-offset-4">← Separation Case</Link>
        </p>
      </div>

      <FinalSettlementWorkspace settlement={settlement} deductions={deductions} separationCaseId={caseId} profileId={separationCase.profileId} />
    </div>
  );
}
