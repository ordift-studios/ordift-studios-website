import type { RecruitmentRequisition, HireOrigin } from "./requisitions";

// Deliberately ZERO runtime imports (only a type-only import, erased at
// compile time) — same established pattern as corporateHeadshotEstimate.ts:
// safe to import from a Client Component. requisitions.ts is
// server-only (createAdminClient() etc.); a Client Component importing
// a real VALUE from it (as UsersManager.tsx briefly did, 2026-09-16 —
// the actual Production build failure this file fixes) drags the whole
// server module, including next/headers, into the browser bundle and
// breaks the build. This tiny module is the one place both the
// server-side write-guard (requisitions.ts) and the client-side picker
// (UsersManager.tsx) share the SAME "does this origin name one
// specific real person" definition, without either pulling the other
// in.

export const NAMED_PERSON_ORIGINS = new Set<HireOrigin>(["founder_direct_hire", "existing_account_conversion"]);

// Production fix (2026-09-16, Kelvin's reported "disabled button") —
// finds a named-person requisition (Founder Direct Hire / Existing
// Account Conversion) whose directHireProfileId is THIS exact profile.
// By construction never ambiguous — there is only ever one real
// candidate it could mean. Pure and directly testable.
export function findNamedPersonRequisitionMatch(requisitions: readonly RecruitmentRequisition[], profileId: string): RecruitmentRequisition | null {
  return requisitions.find((r) => NAMED_PERSON_ORIGINS.has(r.hireOrigin) && r.directHireProfileId === profileId) ?? null;
}
