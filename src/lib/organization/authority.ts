import { createAdminClient } from "@/lib/supabase/admin";

// Ordift Organizational & Administrative Architecture V1, Phase 3,
// Parts B and D (2026-08-25). Reads against public.authority_grants —
// see supabase/migrations/0042_phase3_callsigns_authority_reporting.sql
// for the full design rationale. This is an additive authority layer
// consulted explicitly by new code paths; it is never a substitute for
// roles/user_roles/private.has_role(), which remain the sole source of
// system permissions and are completely unchanged by this module.

export const STANDING_AUTHORITIES = ["executive_admin", "department_admin"] as const;
export type StandingAuthority = (typeof STANDING_AUTHORITIES)[number];

export type AuthorityGrant = {
  id: string;
  profileId: string;
  authority: string;
  scopeDepartmentId: string | null;
  scopeDepartmentName: string | null;
  grantedBy: string | null;
  grantedAt: string;
  reason: string | null;
  effectiveAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
};

type RawGrantRow = {
  id: string;
  profile_id: string;
  authority: string;
  scope_department_id: string | null;
  departments: { name: string } | null;
  granted_by: string | null;
  granted_at: string;
  reason: string | null;
  effective_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
};

function mapGrant(row: RawGrantRow): AuthorityGrant {
  return {
    id: row.id,
    profileId: row.profile_id,
    authority: row.authority,
    scopeDepartmentId: row.scope_department_id,
    scopeDepartmentName: row.departments?.name ?? null,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    reason: row.reason,
    effectiveAt: row.effective_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revokedReason: row.revoked_reason,
  };
}

function isActive(row: Pick<AuthorityGrant, "revokedAt" | "effectiveAt" | "expiresAt">): boolean {
  const now = Date.now();
  if (row.revokedAt) return false;
  if (new Date(row.effectiveAt).getTime() > now) return false;
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return false;
  return true;
}

const GRANT_SELECT = "id, profile_id, authority, scope_department_id, departments(name), granted_by, granted_at, reason, effective_at, expires_at, revoked_at, revoked_by, revoked_reason";

// Every grant ever issued, newest first — the permanent historical
// record (Part 12 audit requirement). Active/expired/revoked status is
// derivable per-row via isActive() below; nothing is ever deleted.
export async function listAuthorityGrants(): Promise<AuthorityGrant[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authority_grants")
    .select(GRANT_SELECT)
    .order("granted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load authority_grants", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapGrant(r as unknown as RawGrantRow));
}

export function isGrantActive(grant: Pick<AuthorityGrant, "revokedAt" | "effectiveAt" | "expiresAt">): boolean {
  return isActive(grant);
}

// Service-role check — for server actions/pages that need to gate a
// capability on Executive Admin, independent of the requesting user's
// own RLS-bound session. Mirrors isSuperAdmin()'s shape
// (src/lib/portal/roles.ts) but reads a table, not the roles array, so
// it stays a separate, explicit opt-in rather than silently becoming
// part of CurrentUser.roles.
export async function isExecutiveAdmin(profileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authority_grants")
    .select("effective_at, expires_at, revoked_at")
    .eq("profile_id", profileId)
    .eq("authority", "executive_admin")
    .is("scope_department_id", null)
    .is("revoked_at", null);
  if (error) {
    console.error("[organization] failed to check executive admin status", error.message);
    return false;
  }
  const now = Date.now();
  return (data ?? []).some(
    (r) => new Date(r.effective_at).getTime() <= now && (!r.expires_at || new Date(r.expires_at).getTime() > now)
  );
}

// Department-scoped standing authority (Director tier) OR a matching
// time-bound delegation for the same authority name.
export async function hasAuthority(profileId: string, authority: string, departmentId: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authority_grants")
    .select("scope_department_id, effective_at, expires_at, revoked_at")
    .eq("profile_id", profileId)
    .eq("authority", authority)
    .is("revoked_at", null);
  if (error) {
    console.error("[organization] failed to check authority", authority, error.message);
    return false;
  }
  const now = Date.now();
  return (data ?? []).some((r) => {
    if (new Date(r.effective_at).getTime() > now) return false;
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) return false;
    return r.scope_department_id === null || r.scope_department_id === departmentId;
  });
}

// ============================================================
// Jurisdiction/verb capability taxonomy (Phase 3.2, 2026-08-25)
// ============================================================
// Extends the same free-text `authority` column with a documented
// naming convention — "<jurisdiction>.<verb>" — rather than a new
// table or a rigid DB enum (matching activity_log.action's existing
// unconstrained-string precedent). Each GR.9 executive's functional
// jurisdiction is peer-scoped: PRIME (Operations) receiving
// operations.administer never implies anything about finance.*,
// people.*, technology.*, or strategy.* — those remain VAULT's/PULSE's/
// GEEK's/ARCHITECT's own jurisdictions, granted (or not) as entirely
// separate authority_grants rows to whoever actually occupies those
// Positions. Cross-jurisdiction VIEW-only visibility (e.g. PRIME
// seeing a Finance dashboard for executive coordination) is its own
// distinct grant (finance.view), never implied by operations.administer.
export const JURISDICTIONS = ["operations", "finance", "strategy", "people", "technology"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const AUTHORITY_VERBS = ["view", "create", "edit", "approve", "authorize", "override", "administer"] as const;
export type AuthorityVerb = (typeof AUTHORITY_VERBS)[number];

export function jurisdictionAuthority(jurisdiction: Jurisdiction, verb: AuthorityVerb): string {
  return `${jurisdiction}.${verb}`;
}

// Convenience wrapper over hasAuthority() for the jurisdiction.verb
// convention — global (unscoped) only, matching how every GR.9
// executive capability in this phase is granted (a functional
// jurisdiction, not a department).
export async function hasJurisdictionAuthority(
  profileId: string,
  jurisdiction: Jurisdiction,
  verb: AuthorityVerb
): Promise<boolean> {
  return hasAuthority(profileId, jurisdictionAuthority(jurisdiction, verb), null);
}

// Super-Admin check by id, for server-side helpers (like
// assignStaffPosition()) that only ever receive an actorUserId, not a
// full CurrentUser — src/lib/portal/roles.ts's isSuperAdmin() takes the
// already-resolved CurrentUser and can't be reused here without a
// second session read. Queries the same user_roles/roles tables
// private.has_role() itself is backed by.
export async function isSuperAdminId(profileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("roles!inner(slug)")
    .eq("user_id", profileId)
    .eq("roles.slug", "super_admin")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// The five leadership Positions no capability short of Super Admin may
// reassign — CHIEF itself, and all five GR.9 peer executives (a holder
// of operations.administer may perform routine staff Position
// assignment, per Phase 3.2 Part 8, but must never touch CHIEF's
// Position, appoint/remove/reassign a GR.9 peer, or — by the same
// self-protection principle — reassign their own Position). Enforced in
// assignStaffPosition() (src/lib/organization/assignPosition.ts).
export const PROTECTED_LEADERSHIP_POSITION_SLUGS = new Set([
  "founder-ceo",
  "chief-operating-officer-coo",
  "chief-financial-officer",
  "chief-strategy-officer",
  "chief-people-hr-officer",
  "chief-technology-officer",
]);
