// Ordift Organizational & Administrative Architecture V1, Phase 3.2
// (2026-08-25) — human-facing Grade display convention: GR.1 .. GR.10.
//
// Internal public.grades.grade_code ('G1'..'G10') is NOT renamed.
// Inspected first: grade_code is a structural join key in every
// Position-seeding migration since 0039 (`join public.grades g on
// g.grade_code = v.grade_code`), reused again in 0043. Renaming the
// stored value would be a purely cosmetic change carrying real risk —
// every seed migration's source text would then read a code that no
// longer matches live data, and any future migration author copying
// the established 'G9'-style pattern would silently break. Per
// explicit instruction to preserve the internal canonical code and
// implement the new format as display-only when a structural rename
// isn't safe, this is a pure, stateless formatter applied only at
// render time — grade_code stays 'G1'..'G10' everywhere in the schema,
// RLS, and application logic.
export function formatGradeDisplay(gradeCode: string): string {
  const match = /^G(\d{1,2})$/.exec(gradeCode);
  if (!match) return gradeCode;
  return `GR.${match[1]}`;
}
