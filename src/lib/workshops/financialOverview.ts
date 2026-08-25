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

// Workshop Management V1, Phase C (2026-08-25) — the Workshop Management
// dashboard's "actionable warnings" (Part 2 of the Phase C spec).
// Every warning is derived from real rows already written by real
// events — nothing here is a placeholder or invented figure. Kept as a
// short, flat label list (not a rich object) since the only two
// surfaces that consume it (the list page and the per-workshop
// dashboard) both just render badges.
export type WorkshopWarning = { key: string; label: string };

export async function getWorkshopOperationalWarnings(
  workshopId: string,
  workshop: { capacity: number; requiresPayment: boolean }
): Promise<WorkshopWarning[]> {
  const admin = createAdminClient();
  const warnings: WorkshopWarning[] = [];

  const [{ data: registrations }, { count: ticketTypeCount }, { data: engagements }] = await Promise.all([
    admin.from("workshop_registrations").select("id, registration_status, payment_status").eq("workshop_id", workshopId),
    admin.from("ticket_types").select("id", { count: "exact", head: true }).eq("workshop_id", workshopId),
    admin
      .from("workshop_instructor_engagements")
      .select("agreed_compensation_amount, payment_obligation_id")
      .eq("workshop_id", workshopId),
  ]);

  const rows = registrations ?? [];
  const registeredCount = rows.filter((r) => r.registration_status === "Registered").length;
  const unpaidCount = rows.filter((r) => r.payment_status === "Pending").length;

  if (unpaidCount > 0) {
    warnings.push({ key: "unpaid", label: `${unpaidCount} unpaid registration${unpaidCount === 1 ? "" : "s"}` });
  }
  if (registeredCount >= workshop.capacity) {
    warnings.push({ key: "at-capacity", label: "At or over overall capacity" });
  }
  if (workshop.requiresPayment && (ticketTypeCount ?? 0) === 0) {
    warnings.push({ key: "no-ticket-types", label: "Requires payment but no ticket types configured" });
  }

  const incompleteEngagements = (engagements ?? []).filter((e) => e.agreed_compensation_amount != null && !e.payment_obligation_id).length;
  if (incompleteEngagements > 0) {
    warnings.push({ key: "engagements-incomplete", label: `${incompleteEngagements} instructor engagement(s) awaiting a payment obligation` });
  }

  const registrationIds = rows.map((r) => r.id);
  if (registrationIds.length > 0) {
    const { count: pendingTravelCount } = await admin
      .from("workshop_travel_assistance_requests")
      .select("id", { count: "exact", head: true })
      .in("registration_id", registrationIds)
      .eq("status", "requested");
    if ((pendingTravelCount ?? 0) > 0) {
      warnings.push({ key: "travel-pending", label: `${pendingTravelCount} pending travel assistance request(s)` });
    }
  }

  return warnings;
}

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
