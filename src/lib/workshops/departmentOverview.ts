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

export type PerWorkshopSummary = { id: string; registeredCount: number; warningLabels: string[] };

const UPCOMING_WINDOW_DAYS = 30;

export async function getWorkshopsDepartmentOverview(workshops: Workshop[]): Promise<{
  summary: WorkshopDepartmentSummary;
  warnings: WorkshopWarningWithContext[];
  upcomingSessions: UpcomingWorkshopSession[];
  perWorkshop: PerWorkshopSummary[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date(Date.now() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const perWorkshopComputed = await Promise.all(
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
    totalRegisteredCount: perWorkshopComputed.reduce((sum, p) => sum + p.financial.registeredCount, 0),
    totalGrossRevenueUsd: perWorkshopComputed.reduce((sum, p) => sum + p.financial.grossRegistrationRevenueUsd, 0),
    totalOutstandingUsd: perWorkshopComputed.reduce((sum, p) => sum + p.financial.outstandingAmountUsd, 0),
    totalInstructorObligationsUsd: perWorkshopComputed.reduce((sum, p) => sum + p.financial.instructorObligationsTotalUsd, 0),
  };

  const warnings: WorkshopWarningWithContext[] = perWorkshopComputed.flatMap((p) =>
    p.warnings.map((w) => ({ ...w, workshopId: p.workshop.id, workshopTitle: p.workshop.title }))
  );

  const upcomingSessions: UpcomingWorkshopSession[] = perWorkshopComputed
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

  const perWorkshop: PerWorkshopSummary[] = perWorkshopComputed.map((p) => ({
    id: p.workshop.id,
    registeredCount: p.financial.registeredCount,
    warningLabels: p.warnings.map((w) => w.label),
  }));

  return { summary, warnings, upcomingSessions, perWorkshop };
}
