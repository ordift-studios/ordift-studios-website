"use server";

import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getStatutoryComplianceForProfile, type ComplianceResult } from "@/lib/organization/statutoryWageEngine";

export type CheckComplianceState = ({ ok: true } & ComplianceResult) | { ok: false; error: string } | null;

// Read-only — any staff-or-admin may check compliance (it never
// exposes anything beyond what the Compensation section of the
// Employee Profile page already shows for that same person), but the
// page itself is Super-Admin-only, so in practice only Super Admin
// reaches this.
export async function checkComplianceAction(_prev: CheckComplianceState, formData: FormData): Promise<CheckComplianceState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, error: "Select a person first." };

  const result = await getStatutoryComplianceForProfile(profileId);
  return { ok: true, ...result };
}
