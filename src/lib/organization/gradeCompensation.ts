import { createAdminClient } from "@/lib/supabase/admin";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part H (2026-08-25) — read layer for grade_compensation_bands. See
// supabase/migrations/0046_phase3_3_organizational_operating_infrastructure.sql
// for the table. Structural banding only — no amounts are seeded by
// this phase; every numeric column is nullable and starts unpopulated.
// COMPENSATION TERMS (this table) is deliberately separate from
// PAYMENT EXECUTION (payment_obligations, Part I) — a band informs what
// an offer SHOULD be, it never itself moves money.

export type GradeCompensationBand = {
  id: string;
  gradeId: string;
  gradeCode: string;
  gradeName: string;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  location: string | null;
  currency: string;
  minimumAmount: number | null;
  midpointAmount: number | null;
  maximumAmount: number | null;
  effectiveDate: string;
  active: boolean;
  notes: string | null;
};

// Super-Admin-only read, matching the table's RLS exactly (compensation
// data is at least as sensitive as Grade itself, which is already
// admin-tier-confidential — this starts stricter, at super_admin-only,
// since real salary figures are more sensitive than a grade label).
export async function listGradeCompensationBands(): Promise<GradeCompensationBand[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("grade_compensation_bands")
    .select(
      "id, grade_id, engagement_type_id, location, currency, minimum_amount, midpoint_amount, maximum_amount, effective_date, active, notes, grades(grade_code, name), engagement_types(name)"
    )
    .order("effective_date", { ascending: false });
  if (error) {
    console.error("[organization] failed to load grade_compensation_bands", error.message);
    return [];
  }
  return (data ?? []).map((b) => {
    const grade = b.grades as unknown as { grade_code: string; name: string } | null;
    const engagementType = b.engagement_types as unknown as { name: string } | null;
    return {
      id: b.id,
      gradeId: b.grade_id,
      gradeCode: grade?.grade_code ?? "—",
      gradeName: grade?.name ?? "—",
      engagementTypeId: b.engagement_type_id,
      engagementTypeName: engagementType?.name ?? null,
      location: b.location,
      currency: b.currency,
      minimumAmount: b.minimum_amount,
      midpointAmount: b.midpoint_amount,
      maximumAmount: b.maximum_amount,
      effectiveDate: b.effective_date,
      active: b.active,
      notes: b.notes,
    };
  });
}
