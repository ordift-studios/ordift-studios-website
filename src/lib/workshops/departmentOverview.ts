import type { Workshop } from "@/lib/content/types";
import { getWorkshopFinancialOverview, getWorkshopOperationalWarnings, type WorkshopWarning } from "@/lib/workshops/financialOverview";

// Workshops Department Operational Interface (2026-09-16) — an
// aggregated, department-wide view over the SAME per-workshop
// functions the individual workshop dashboard already uses
// (getWorkshopFinancialOverview, getWorkshopOperationalWarnings) —
// never a second financial/warnings computation. This module only
// sums and sorts what those functions already return, for every
// workshop getAllWorkshopsAdmin() already lists.

export type WorkshopDepartmentSummary = {
  totalWorkshops: number;
  upcomingWorkshopsCount: number;
  totalRegisteredCount: number;
  totalGrossRevenueUsd: number;
  totalOutstandingUsd: number;
  totalInstructorObligationsUsd: number;
};

export type WorkshopWarningWithContext = WorkshopWarning & { workshopId: string; workshopTitle: string };

export type UpcomingWorkshopSession = { id: string; title: string; startDate: string; status: string; registeredCount: number; capacity: number };

const UPCOMING_WINDOW_DAYS = 30;

export async function getWorkshopsDepartmentOverview(workshops: Workshop[]): Promise<{
  summary: WorkshopDepartmentSummary;
  warnings: WorkshopWarningWithContext[];
  upcomingSessions: UpcomingWorkshopSession[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date(Date.now() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const perWorkshop = await Promise.all(
    workshops.map(async (w) => {
      const [financial, warnings] = await Promise.all([
        getWorkshopFinancialOverview(w.id),
        getWorkshopOperationalWarnings(w.id, { capacity: w.capacity, requiresPayment: w.requiresPayment }),
      ]);
      return { workshop: w, financial, warnings };
    })
  );

  const summary: WorkshopDepartmentSummary = {
    totalWorkshops: workshops.length,
    upcomingWorkshopsCount: workshops.filter((w) => w.startDate !== null && w.startDate >= today).length,
    totalRegisteredCount: perWorkshop.reduce((sum, p) => sum + p.financial.registeredCount, 0),
    totalGrossRevenueUsd: perWorkshop.reduce((sum, p) => sum + p.financial.grossRegistrationRevenueUsd, 0),
    totalOutstandingUsd: perWorkshop.reduce((sum, p) => sum + p.financial.outstandingAmountUsd, 0),
    totalInstructorObligationsUsd: perWorkshop.reduce((sum, p) => sum + p.financial.instructorObligationsTotalUsd, 0),
  };

  const warnings: WorkshopWarningWithContext[] = perWorkshop.flatMap((p) =>
    p.warnings.map((w) => ({ ...w, workshopId: p.workshop.id, workshopTitle: p.workshop.title }))
  );

  const upcomingSessions: UpcomingWorkshopSession[] = perWorkshop
    .filter((p) => p.workshop.startDate !== null && p.workshop.startDate >= today && p.workshop.startDate <= windowEnd)
    .map((p) => ({
      id: p.workshop.id,
      title: p.workshop.title,
      startDate: p.workshop.startDate as string,
      status: p.workshop.status,
      registeredCount: p.financial.registeredCount,
      capacity: p.workshop.capacity,
    }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  return { summary, warnings, upcomingSessions };
}
