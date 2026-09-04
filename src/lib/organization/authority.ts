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
// 'governance' added Phase 3.3, Part A (2026-08-25) — CHANCELLOR's
// jurisdiction (corporate administration, organizational governance,
// corporate records/policy/contract/legal-document administration,
// external-counsel liaison). Explicitly NOT "legal" — CHANCELLOR is the
// internal governance/legal-administration owner and external-counsel
// liaison, never represented as providing professional legal advice.
export const JURISDICTIONS = ["operations", "finance", "strategy", "people", "technology", "governance"] as const;
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

// ============================================================
// Auditable Super Admin intervention (Workshop Management V1, Phase B,
// Part 5, 2026-08-25)
// ============================================================
// Shared authorization check: an actor is authorized if they hold the
// named capability (optionally department-scoped) OR are Super Admin.
// When Super Admin is the ONLY reason access was granted (they don't
// actually hold the capability), `actedAsOverride: true` is returned so
// the caller can record that fact explicitly in activity_log — CHIEF's
// intervention is never silently recorded as if the normally
// responsible jurisdiction had acted (Part 5's explicit requirement).
// This is the one shared place every future capability-gated action
// should call through, rather than each re-implementing its own
// Super-Admin-bypass-plus-audit logic.
export async function authorizeWithSuperAdminOverride(
  actorUserId: string,
  capability: string,
  scopeDepartmentId: string | null = null
): Promise<{ ok: true; actedAsOverride: boolean } | { ok: false }> {
  const authorized = await hasAuthority(actorUserId, capability, scopeDepartmentId);
  if (authorized) return { ok: true, actedAsOverride: false };

  const superAdmin = await isSuperAdminId(actorUserId);
  if (superAdmin) return { ok: true, actedAsOverride: true };

  return { ok: false };
}

// ============================================================
// jurisdiction.resource.verb (Phase 3.3, Part C, 2026-08-25)
// ============================================================
// Extends the same free-text `authority` column one level further —
// confirmed safe before use: authority_grants.authority has no DB
// CHECK/enum, and every consumer (hasAuthority(), isExecutiveAdmin())
// compares it by exact string equality only, never parses or counts
// dots. A 3-part jurisdiction.resource.verb string (e.g.
// "technology.identity.reserve") coexists in the same column as the
// existing 2-part (operations.administer) and 0-part
// (executive_admin) values with zero conflict.
//
// GEEK/Technology owns the corporate-identity capability set below —
// this is a functional-jurisdiction fact, not an automatic grant to
// whoever occupies the CTO Position (Position/Grade/Call Sign still
// grant zero authority by themselves, per Part K). PULSE/People can
// REQUEST identity creation (via a department_request); GEEK/
// Technology fulfills it — a cross-department workflow relationship,
// never an authority transfer, so GEEK never thereby receives HR/
// Finance/Strategy/Operations jurisdiction, and PULSE never thereby
// receives Technology jurisdiction.
export const IDENTITY_CAPABILITIES = {
  view: "technology.identity.view",
  reserve: "technology.identity.reserve",
  provision: "technology.identity.provision",
  suspend: "technology.identity.suspend",
  reactivate: "technology.identity.reactivate",
  deactivate: "technology.identity.deactivate",
  manageEmail: "technology.email.manage",
} as const;

// ============================================================
// Full six-jurisdiction capability taxonomy (Phase 3.4, 2026-08-25)
// ============================================================
// One block per GR.9 peer executive's jurisdiction. Each is designed
// now, per explicit instruction, even where the corresponding
// functionality doesn't exist yet — a capability string existing here
// grants nothing by itself; it only becomes real the moment (a) a real
// function actually checks for it (see the "WIRED" / "DORMANT" note on
// each constant below) AND (b) a real authority_grants row exists for
// a real profile. No capability is activated merely because a Position
// exists to occupy — see assignStaffPosition()/reserveCorporateIdentity()
// etc. for the actual enforcement points.
//
// operations.administer (PRIME) is unchanged from Phase 3.2 — the
// exact same string, already wired into assignStaffPosition(). The
// three additions below are new for this phase, DORMANT (no function
// checks them yet) — Operations has no other built workflow to gate.
// workshop.administer added Workshop Management V1, Phase B
// (2026-08-25) — PRIME's overall workshop operational administration
// (create/edit workshop content, ticket types, check-in). Deliberately
// its own capability, not folded into `administer`, so Workshop
// authority can be granted/revoked independently of general staff
// Position-assignment authority.
export const OPERATIONS_CAPABILITIES = {
  administer: "operations.administer", // WIRED — assignStaffPosition() (Phase 3.2)
  coordinate: "operations.coordinate", // DORMANT
  report: "operations.report", // DORMANT
  requestRoute: "operations.request.route", // DORMANT
  workshopAdminister: "operations.workshop.administer", // WIRED — Workshop Management V1, Phase B
} as const;

// finance.* — VAULT. Two of these are WIRED this phase
// (payment_obligation.approve into approvePaymentObligation(),
// payment_instruction.verify into verifyPaymentInstruction()); the
// rest are DORMANT, exactly matching the explicit instruction that
// finance.payout.*/compensation.* stay dormant until real payout/
// compensation functionality exists. Strings are verbatim as specified.
export const FINANCE_CAPABILITIES = {
  compensationView: "finance.compensation.view", // DORMANT
  compensationManage: "finance.compensation.manage", // DORMANT
  paymentInstructionVerify: "finance.payment_instruction.verify", // WIRED — verifyPaymentInstruction()
  paymentObligationReview: "finance.payment_obligation.review", // DORMANT
  paymentObligationApprove: "finance.payment_obligation.approve", // WIRED — approvePaymentObligation()
  payoutInitiate: "finance.payout.initiate", // DORMANT — no PayoutProvider implementation exists
  payoutReconcile: "finance.payout.reconcile", // DORMANT
  // Workshop Management V1, Phase B (2026-08-25) — read-only financial
  // visibility into a workshop's registration revenue/outstanding
  // amounts. Deliberately separate from paymentObligationApprove — VIEW
  // is never bundled with a mutation capability.
  workshopRevenueView: "finance.workshop_revenue.view", // WIRED — Workshop financial overview
  // Universal Payables System (2026-09-03) — administering the payee/
  // engagement/payable record itself (creating a payee profile, a
  // payment instruction, an engagement, or a payable's line items) is
  // deliberately its own capability, separate from approving one
  // (paymentObligationApprove) and separate from recording that one
  // has actually been paid (paymentObligationRecordPayment below) —
  // three distinct duties, never bundled, matching this taxonomy's
  // existing view/mutation separation principle.
  payeeAdminister: "finance.payee.administer", // WIRED — src/lib/payables/*
  // Marks an already-approved obligation as paid via a controlled,
  // auditable manual/external payment record — never a bare status
  // dropdown edit. See recordManualPayment() in payoutObligations.ts.
  paymentObligationRecordPayment: "finance.payment_obligation.record_payment", // WIRED — recordManualPayment()
  // Payable Safety Hardening (2026-09-04) — cancelling a payable while
  // pending_approval/approved reuses paymentObligationApprove (the
  // natural negative counterpart of the same review decision).
  // Reversing one that's already approved/paid is a separately
  // permissioned, rarer, more serious after-the-fact correction — its
  // own capability, same separation-of-duties principle as
  // paymentObligationRecordPayment being distinct from approve.
  paymentObligationReverse: "finance.payment_obligation.reverse", // WIRED — reversePaymentObligation()
} as const;

// strategy.* — ARCHITECT. Fully DORMANT — no strategic-planning/
// initiative table or workflow exists anywhere in this codebase yet;
// defined now purely as approved taxonomy for a future phase.
export const STRATEGY_CAPABILITIES = {
  planningAdminister: "strategy.planning.administer", // DORMANT
  initiativeManage: "strategy.initiative.manage", // DORMANT
  report: "strategy.report", // DORMANT
} as const;

// people.* — PULSE. recruitmentAdminister is WIRED into
// decideRequisition() and scheduleInterviewPanel() (Phase 3.3's
// recruitment functions) — the actual "PULSE administers the
// recruitment process" enforcement point. The rest are DORMANT.
export const PEOPLE_CAPABILITIES = {
  recruitmentAdminister: "people.recruitment.administer", // WIRED — decideRequisition(), scheduleInterviewPanel()
  requisitionReview: "people.requisition.review", // DORMANT
  applicationReview: "people.application.review", // DORMANT
  interviewPanelAdminister: "people.interview_panel.administer", // DORMANT
  onboardingAdminister: "people.onboarding.administer", // DORMANT
  report: "people.report", // DORMANT
  // Workshop Management V1, Phase B (2026-08-25) — instructor/
  // facilitator engagement coordination for a workshop.
  workshopEngagementAdminister: "people.workshop_engagement.administer", // WIRED — workshop instructor engagements
} as const;

// technology.* — GEEK. IDENTITY_CAPABILITIES above (Phase 3.3) are
// WIRED this phase into reserveCorporateIdentity()/setCorporateIdentityStatus().
// technology.system.administer is DORMANT — no general technical-
// infrastructure/integration-administration surface exists yet.
export const TECHNOLOGY_CAPABILITIES = {
  systemAdminister: "technology.system.administer", // DORMANT
} as const;

// governance.* — CHANCELLOR. Fully DORMANT — no corporate-records/
// contract/compliance-tracking table or workflow exists anywhere in
// this codebase yet; defined now purely as approved taxonomy. Never
// "legal" — CHANCELLOR administers governance workflow and liaises
// with external counsel, never represented as providing licensed
// legal advice (see the governance jurisdiction comment above).
export const GOVERNANCE_CAPABILITIES = {
  recordsAdminister: "governance.records.administer", // DORMANT
  policyAdminister: "governance.policy.administer", // DORMANT
  contractAdminister: "governance.contract.administer", // DORMANT
  complianceTrack: "governance.compliance.track", // DORMANT
  externalCounselCoordinate: "governance.external_counsel.coordinate", // DORMANT
} as const;

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

// The six leadership Positions no capability short of Super Admin may
// reassign — CHIEF itself, and all six GR.9 peer executives (a holder
// of operations.administer may perform routine staff Position
// assignment, per Phase 3.2 Part 8, but must never touch CHIEF's
// Position, appoint/remove/reassign a GR.9 peer, or — by the same
// self-protection principle — reassign their own Position). Enforced in
// assignStaffPosition() (src/lib/organization/assignPosition.ts).
// CHANCELLOR added Phase 3.3, Part A, on promotion to GR.9.
export const PROTECTED_LEADERSHIP_POSITION_SLUGS = new Set([
  "founder-ceo",
  "chief-operating-officer-coo",
  "chief-financial-officer",
  "chief-strategy-officer",
  "chief-people-hr-officer",
  "chief-technology-officer",
  "director-executive-administration",
]);

// ============================================================
// Delegation self-scoping safeguard (Phase 3.4, Part 12, 2026-08-25)
// ============================================================
// Deferred from Phase 3.1-3.3 ("leave delegation creation Super-Admin-
// only... report the later extension") — implemented now. The
// invariant: a non-Super-Admin grantor may only delegate an authority
// they themselves currently hold, and only within the scope (global or
// a specific department) they hold it in. Super Admin is exempt (the
// ultimate authority, per Part 2), and remains the only actor who can
// grant something they don't personally "hold" as a grant row — same
// as today's grantExecutiveAdminAction/grantDepartmentAuthorityAction.
//
// Split into a pure validator (canDelegate, fully unit-testable, no
// DB) and a thin DB-backed wrapper (validateDelegationAuthority) that
// fetches the real grantor's active grants and calls it — same
// pure/impure split already used for corporateEmail.ts vs
// reserveCorporateIdentity.ts.
export type GrantorAuthority = { authority: string; scopeDepartmentId: string | null };

export function canDelegate(params: {
  grantorIsSuperAdmin: boolean;
  grantorActiveGrants: GrantorAuthority[];
  requestedAuthority: string;
  requestedScopeDepartmentId: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (params.grantorIsSuperAdmin) return { ok: true };

  // Super Admin itself, and the two standing tiers (executive_admin,
  // department_admin), can never be delegated by a non-Super-Admin —
  // those are appointments, not operational capabilities, and stay
  // exclusively grantExecutiveAdminAction/grantDepartmentAuthorityAction's
  // domain (both already Super-Admin-only, unchanged).
  if (STANDING_AUTHORITIES.includes(params.requestedAuthority as StandingAuthority)) {
    return { ok: false, error: "Standing authority tiers can only be granted by a Super Admin, never delegated." };
  }

  const held = params.grantorActiveGrants.find((g) => g.authority === params.requestedAuthority);
  if (!held) {
    return { ok: false, error: "You cannot delegate an authority you do not currently hold." };
  }

  // A global grant (scopeDepartmentId null) may delegate globally or
  // scoped to any single department (narrowing is always safe). A
  // department-scoped grant may only delegate within that SAME
  // department — never globally, never to a different department
  // (never upward/sideways, per explicit instruction).
  if (held.scopeDepartmentId !== null && held.scopeDepartmentId !== params.requestedScopeDepartmentId) {
    return { ok: false, error: "You can only delegate this authority within the department you hold it for." };
  }

  return { ok: true };
}

export async function validateDelegationAuthority(params: {
  grantorProfileId: string;
  requestedAuthority: string;
  requestedScopeDepartmentId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const grantorIsSuperAdmin = await isSuperAdminId(params.grantorProfileId);
  if (grantorIsSuperAdmin) return { ok: true };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authority_grants")
    .select("authority, scope_department_id, effective_at, expires_at, revoked_at")
    .eq("profile_id", params.grantorProfileId)
    .is("revoked_at", null);
  if (error) {
    console.error("[organization] failed to load grantor's authority for delegation check", error.message);
    return { ok: false, error: "Failed to verify your current authority." };
  }

  const now = Date.now();
  const activeGrants: GrantorAuthority[] = (data ?? [])
    .filter((g) => new Date(g.effective_at).getTime() <= now && (!g.expires_at || new Date(g.expires_at).getTime() > now))
    .map((g) => ({ authority: g.authority, scopeDepartmentId: g.scope_department_id }));

  return canDelegate({
    grantorIsSuperAdmin: false,
    grantorActiveGrants: activeGrants,
    requestedAuthority: params.requestedAuthority,
    requestedScopeDepartmentId: params.requestedScopeDepartmentId,
  });
}

export type ExecutivePositionOccupancy = { callSign: string; occupied: boolean; occupantName: string | null };

// Closure refinement (2026-08-25) — the Executive Command Center's
// per-jurisdiction occupied/vacant indicator. Read-only; never creates,
// modifies, or infers authority — occupancy is a Position/staff_details
// fact, completely separate from whether CHIEF is currently viewing via
// Super Admin override. Same "only an active account counts as a real
// occupant" rule as resolveCurrentManager() (reporting.ts) — a
// deactivated occupant's Position reads as vacant, not stale-occupied.
export async function getExecutivePositionOccupancy(
  callSigns: readonly string[]
): Promise<Record<string, ExecutivePositionOccupancy>> {
  const admin = createAdminClient();
  const result: Record<string, ExecutivePositionOccupancy> = {};
  for (const callSign of callSigns) result[callSign] = { callSign, occupied: false, occupantName: null };

  const { data: positions, error: positionsError } = await admin
    .from("positions")
    .select("id, call_sign")
    .in("call_sign", callSigns as string[]);
  if (positionsError || !positions || positions.length === 0) {
    if (positionsError) console.error("[organization] failed to load executive positions", positionsError.message);
    return result;
  }

  const callSignByPositionId = new Map(positions.map((p) => [p.id, p.call_sign as string]));
  const { data: staffRows, error: staffError } = await admin
    .from("staff_details")
    .select("id, position_id")
    .in("position_id", positions.map((p) => p.id));
  if (staffError || !staffRows || staffRows.length === 0) {
    if (staffError) console.error("[organization] failed to load staff_details for executive occupancy", staffError.message);
    return result;
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, access_status")
    .in("id", staffRows.map((s) => s.id));
  if (profilesError) {
    console.error("[organization] failed to load profiles for executive occupancy", profilesError.message);
    return result;
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  for (const staff of staffRows) {
    const profile = profileById.get(staff.id);
    if (!profile || profile.access_status !== "active") continue; // deactivated/missing account — reads as vacant
    const callSign = callSignByPositionId.get(staff.position_id);
    if (!callSign) continue;
    result[callSign] = { callSign, occupied: true, occupantName: profile.full_name };
  }

  return result;
}
