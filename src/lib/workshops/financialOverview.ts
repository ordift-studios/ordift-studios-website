import { createAdminClient } from "@/lib/supabase/admin";

// Workshop Management V1, Phase B, Part 11 (2026-08-25) — derived
// entirely from existing registration/payment-obligation data, never
// invented figures. Deliberately not a general-ledger/accounting
// system — a simple summary only. payment_obligations amounts are
// reported as "obligations", explicitly never described as completed
// payouts (no PayoutProvider implementation exists to have completed
// one).

export type WorkshopFinancialOverview = {
  registeredCount: number;
  waitlistedCount: number;
  complimentaryCount: number;
  paidCount: number;
  grossRegistrationRevenueUsd: number;
  outstandingAmountUsd: number;
  instructorObligationsCount: number;
  instructorObligationsTotalUsd: number;
};

export async function getWorkshopFinancialOverview(workshopId: string): Promise<WorkshopFinancialOverview> {
  const admin = createAdminClient();

  const [{ data: registrations }, { data: obligations }] = await Promise.all([
    admin
      .from("workshop_registrations")
      .select("registration_status, payment_status, amount_due, amount_paid")
      .eq("workshop_id", workshopId),
    admin.from("workshop_instructor_engagements").select("payment_obligation_id").eq("workshop_id", workshopId),
  ]);

  const rows = registrations ?? [];
  const registeredCount = rows.filter((r) => r.registration_status === "Registered").length;
  const waitlistedCount = rows.filter((r) => r.registration_status === "Waitlisted").length;
  const complimentaryCount = rows.filter((r) => r.payment_status === "Not Required").length;
  const paidCount = rows.filter((r) => r.payment_status === "Paid").length;
  const grossRegistrationRevenueUsd = rows.reduce((sum, r) => sum + Number(r.amount_paid ?? 0), 0);
  const outstandingAmountUsd = rows.reduce((sum, r) => {
    const due = Number(r.amount_due ?? 0);
    const paid = Number(r.amount_paid ?? 0);
    return sum + Math.max(due - paid, 0);
  }, 0);

  const obligationIds = (obligations ?? []).map((o) => o.payment_obligation_id).filter((id): id is string => Boolean(id));
  let instructorObligationsTotalUsd = 0;
  if (obligationIds.length > 0) {
    const { data: obligationRows } = await admin.from("payment_obligations").select("amount").in("id", obligationIds);
    instructorObligationsTotalUsd = (obligationRows ?? []).reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
  }

  return {
    registeredCount,
    waitlistedCount,
    complimentaryCount,
    paidCount,
    grossRegistrationRevenueUsd: Math.round(grossRegistrationRevenueUsd * 100) / 100,
    outstandingAmountUsd: Math.round(outstandingAmountUsd * 100) / 100,
    instructorObligationsCount: obligationIds.length,
    instructorObligationsTotalUsd: Math.round(instructorObligationsTotalUsd * 100) / 100,
  };
}
