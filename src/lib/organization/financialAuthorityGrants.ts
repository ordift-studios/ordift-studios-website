import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import {
  type FinancialAuthorityLevel,
  FINANCIAL_AUTHORITY_LEVELS,
  CANONICAL_ROUTINE_CEILING_USD,
  financialAuthorityLevelAuthority,
  parseFinancialAuthorityLevelAuthority,
} from "@/lib/organization/financialAuthority";

// Ordift Studios — Organizational Structure, Authority Grants, Staff
// Onboarding & Work Email V1 (2026-09-07). DB-backed layer for
// Financial Authority Levels. Deliberately reuses public.authority_grants
// (0042) — a Financial Authority Level IS an authority_grants row (one
// of the financial_authority_level_N convention strings, see
// src/lib/organization/financialAuthority.ts), never a second/parallel
// grant table. Standing (permanent) grants are Super-Admin-only here,
// mirroring grantExecutiveAdminAction()/grantDepartmentAuthorityAction()
// exactly (src/app/admin/authority/actions.ts). Time-bound DELEGATION of
// a specific level already works through the EXISTING generic
// createDelegationAction()/validateDelegationAuthority() — that form's
// `authority` field is free text, so a level-holder typing
// "financial_authority_level_3" is delegated through the exact same
// self-scoping safeguard as any other capability, with zero new code.

export type FinancialAuthorityLevelThreshold = {
  id: string;
  level: FinancialAuthorityLevel;
  label: string;
  routineCeilingUsd: number | null;
  effectiveDate: string;
  active: boolean;
};

// Live, versioned, admin-configurable ceilings — falls back to the pure
// module's CANONICAL_ROUTINE_CEILING_USD only if the table is
// unreachable/empty, so a transient read failure never silently blocks
// every financial approval in the system.
export async function listFinancialAuthorityLevelThresholds(): Promise<FinancialAuthorityLevelThreshold[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("financial_authority_level_thresholds")
    .select("id, level, label, routine_ceiling_usd, effective_date, active")
    .eq("active", true)
    .is("supersedes_id", null)
    .order("level");
  if (error || !data || data.length === 0) {
    if (error) console.error("[organization] failed to load financial_authority_level_thresholds", error.message);
    return FINANCIAL_AUTHORITY_LEVELS.map((level) => ({
      id: `fallback-${level}`,
      level,
      label: String(level),
      routineCeilingUsd: CANONICAL_ROUTINE_CEILING_USD[level],
      effectiveDate: new Date().toISOString().slice(0, 10),
      active: true,
    }));
  }
  return data.map((r) => ({
    id: r.id,
    level: r.level as FinancialAuthorityLevel,
    label: r.label,
    routineCeilingUsd: r.routine_ceiling_usd,
    effectiveDate: r.effective_date,
    active: r.active,
  }));
}

export async function getEffectiveCeilingTable(): Promise<Record<FinancialAuthorityLevel, number | null>> {
  const thresholds = await listFinancialAuthorityLevelThresholds();
  const table = { ...CANONICAL_ROUTINE_CEILING_USD };
  for (const t of thresholds) table[t.level] = t.routineCeilingUsd;
  return table;
}

// The highest ACTIVE (not revoked, not expired, already effective)
// Financial Authority Level this profile currently holds — global or
// department-scoped, matching hasAuthority()'s exact effective/expiry
// logic. Returns null if none. A person may hold zero, exactly like
// Grade granting zero Financial Authority by construction (Part 10).
export async function getPersonFinancialAuthorityLevel(
  profileId: string,
  scopeDepartmentId: string | null = null
): Promise<FinancialAuthorityLevel | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authority_grants")
    .select("authority, financial_authority_level, scope_department_id, effective_at, expires_at, revoked_at")
    .eq("profile_id", profileId)
    .not("financial_authority_level", "is", null)
    .is("revoked_at", null);
  if (error) {
    console.error("[organization] failed to load financial authority grants", error.message);
    return null;
  }
  const now = Date.now();
  let highest: FinancialAuthorityLevel | null = null;
  for (const row of data ?? []) {
    if (parseFinancialAuthorityLevelAuthority(row.authority) === null) continue;
    if (new Date(row.effective_at).getTime() > now) continue;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
    if (row.scope_department_id !== null && row.scope_department_id !== scopeDepartmentId) continue;
    const level = row.financial_authority_level as FinancialAuthorityLevel;
    if (highest === null || level > highest) highest = level;
  }
  return highest;
}

export type FinancialAuthorizationResult = { ok: true; actedAsOverride: boolean } | { ok: false };

// Mirrors authorizeWithSuperAdminOverride()'s exact shape (Part 5/K).
// Super Admin always passes (actedAsOverride: true when they don't
// independently hold the level). "Financial Level alone grants no
// unrelated capability" is satisfied by construction — this function
// checks ONLY the numeric level, never any other capability; callers
// needing both a capability AND a level call both checks separately and
// require both to pass (Part 15/16's explicit "require both").
export async function authorizeFinancialLevel(
  actorUserId: string,
  requiredLevel: FinancialAuthorityLevel,
  scopeDepartmentId: string | null = null
): Promise<FinancialAuthorizationResult> {
  const personLevel = await getPersonFinancialAuthorityLevel(actorUserId, scopeDepartmentId);
  if (personLevel !== null && personLevel >= requiredLevel) return { ok: true, actedAsOverride: false };

  const superAdmin = await isSuperAdminId(actorUserId);
  if (superAdmin) return { ok: true, actedAsOverride: true };

  return { ok: false };
}

// Standing (non-expiring) Financial Authority Level grant — Super-Admin-
// only, same tier as Executive Admin/Director-tier appointment. A
// TIME-BOUND delegation of a specific level is a different act, made
// through the existing generic delegation path (see this file's header
// comment) — never duplicated here.
export async function grantStandingFinancialAuthorityLevel(params: {
  profileId: string;
  level: FinancialAuthorityLevel;
  scopeDepartmentId?: string | null;
  reason?: string | null;
  grantedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isSuperAdminId(params.grantedBy))) {
    return { ok: false, error: "Only a Super Admin can grant a standing Financial Authority Level." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("authority_grants").insert({
    profile_id: params.profileId,
    authority: financialAuthorityLevelAuthority(params.level),
    scope_department_id: params.scopeDepartmentId ?? null,
    financial_authority_level: params.level,
    granted_by: params.grantedBy,
    reason: params.reason ?? null,
    expires_at: null,
  });
  if (error) {
    console.error("[organization] failed to grant financial authority level", error.message);
    return { ok: false, error: "Failed to grant the Financial Authority Level." };
  }

  await logActivity({
    actorUserId: params.grantedBy,
    action: "financial_authority_level.grant",
    entityType: "user",
    entityId: params.profileId,
    metadata: { level: params.level, scopeDepartmentId: params.scopeDepartmentId ?? null, reason: params.reason ?? null },
  });

  return { ok: true };
}
