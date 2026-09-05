import { getOwnPayeeProfile } from "@/lib/payables/payeeProfiles";
import { classifyExternalRelationship, modulesForRelationship, type ExternalRelationship, type PortalModules } from "@/lib/portal/externalWorkforce";

// Phase K.1 (2026-09-05) — the one place that actually resolves "which
// External Workforce relationship is this account, and which portal
// modules should render" for a real, authenticated user. Deliberately
// its own file rather than added to externalWorkforce.ts (whose own
// header explicitly requires zero server-only imports, so any future
// "use client" component can import it directly) or
// engagementPortalData.ts (whose own header explicitly states "this
// file must never be given createAdminClient" — getOwnPayeeProfile()
// is admin-client-backed). Respects both existing boundaries rather
// than quietly violating either for convenience.
//
// Safe to call with any userId in principle (getOwnPayeeProfile() only
// reads, never mutates), but every real call site in this codebase
// passes only the authenticated caller's own id — matching the
// existing payment-details/page.tsx precedent for the same function.
export async function getMyPortalModules(
  userId: string,
  roles: string[]
): Promise<{ relationship: ExternalRelationship; modules: PortalModules }> {
  const payeeProfile = await getOwnPayeeProfile(userId);
  const relationship = classifyExternalRelationship({ roles, payeeCategory: payeeProfile?.category ?? null });
  return { relationship, modules: modulesForRelationship(relationship) };
}
