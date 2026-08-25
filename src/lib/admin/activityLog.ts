import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActorIdentities, formatActorLabel } from "@/lib/portal/actorIdentity";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";

// Shared audit trail for the Admin Platform (public.activity_log,
// migration 0004). Every module that mutates something writes here the
// same way, rather than inventing its own log — RLS restricts both read
// and insert to staff/admin (see supabase/migrations/0004_admin_platform.sql),
// so the session-scoped client is enough; no need for the admin/service-role
// client here.
//
// Actor identity (2026-08-05, Audit Identity Standard — see
// ARCHITECTURE_DECISIONS.md): actor_user_id was always, and remains,
// the authoritative reference — a profile_id FK, never a stored name.
// What changed is the display layer — every row now also resolves the
// actor's immutable member_number (via src/lib/portal/actorIdentity.ts)
// alongside their current display name, role, and department, instead
// of surfacing only full_name as before.

export type ActivityLogEntry = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorMemberNumber: string | null;
  actorRoleLabel: string | null;
  actorDepartment: string | null;
  actorLabel: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type RawActivityRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

async function enrichWithActorIdentity(rows: RawActivityRow[]): Promise<ActivityLogEntry[]> {
  const identities = await resolveActorIdentities(
    rows.map((r) => r.actor_user_id).filter((id): id is string => Boolean(id))
  );

  return rows.map((row) => {
    const identity = row.actor_user_id ? (identities.get(row.actor_user_id) ?? null) : null;
    return {
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: identity?.fullName ?? null,
      actorMemberNumber: identity?.memberNumber ?? null,
      actorRoleLabel: identity?.roleLabel ?? null,
      actorDepartment: identity?.department ?? null,
      actorLabel: formatActorLabel(identity),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at,
    };
  });
}

export async function logActivity(params: {
  // Nullable as of 2026-08-06 (Payments & Finance Module): a
  // gateway-webhook-driven transition (e.g. a payment completing) has
  // no human session to attribute it to. null renders through
  // enrichWithActorIdentity() the same way an already-null
  // actor_user_id from the database does — no special-casing needed
  // on the read side, this was already a handled state.
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_log").insert({
    actor_user_id: params.actorUserId,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    // Best-effort: a failed log write should never block the action it's
    // recording, same reasoning as src/lib/supabase/primaryWrite.ts's
    // best-effort role-grant step.
    console.error("[admin] failed to write activity_log", error.message);
  }
}

// Service-role variant (2026-08-06, Payments & Finance Module) — for
// contexts where the RLS-gated "activity_log: staff insert" policy
// can't apply to a session client. Two distinct situations use this:
//
// 1. Genuinely unauthenticated server-to-server contexts (webhook
//    handlers) — there is no cookie session for createClient() to
//    read at all, so actorUserId is omitted/null (a gateway webhook
//    has no human to attribute the row to).
//
// 2. A trusted server-side audit write on behalf of an already
//    authenticated and authorized human actor, when that actor's own
//    role doesn't satisfy the staff-only insert policy — e.g. a plain
//    client submitting their own bank-transfer proof (TD-033,
//    2026-08-14). The route itself must already have independently
//    verified authentication and ownership/authorization *before*
//    calling this — logActivityAsSystem() performs no auth check of
//    its own, exactly like logActivity() doesn't. actorUserId in this
//    case must come only from the server-verified session
//    (`getCurrentUser()`/equivalent), never from request body, query
//    params, or any other client-supplied value — this function
//    trusts its caller completely, so the caller carries that
//    responsibility.
//
// In both cases: uses the same admin/secret-key client already
// established for exactly this class of problem
// (src/lib/supabase/admin.ts's own doc comment: "the visitor
// submitting isn't necessarily logged in"). This function only ever
// runs server-side (this module has no "use client" boundary and the
// admin client it constructs is never sent to the browser) — the
// service-role credential itself never leaves trusted server code.
export async function logActivityAsSystem(params: {
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("activity_log").insert({
    actor_user_id: params.actorUserId ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error("[admin] failed to write activity_log (system)", error.message);
  }
}

const RECENT_ACTIVITY_LIMIT = 20;

// Sensitivity tiering for the global feed (TD-035, 2026-08-14) — RLS
// already restricts *read* on activity_log to staff-or-above (migration
// 0004's "activity_log: staff read" policy); this is a narrower,
// app-layer restriction on top of that for getRecentActivity()
// specifically (the unfiltered, platform-wide /admin/activity feed), so
// an ordinary staff-tier account doesn't see financial or role/security
// events that policy alone would otherwise let through to them. Every
// other consumer of this table (getRecentActivityByType,
// getActivityForEntity) is already scoped to a single non-sensitive
// entity type or a single already-access-controlled record, so this
// tiering is deliberately not applied there.
//
// Real action strings pulled directly from every logActivity()/
// logActivityAsSystem() call site in the codebase at the time this was
// written — not a speculative list. A future new action name defaults
// to staff-visible (fail-open on the *classification*, not on auth)
// unless explicitly added to one of the two restricted sets below.
const SUPER_ADMIN_ONLY_ACTIONS = new Set<string>([
  "role.grant",
  "role.revoke",
  "access_status.change",
  "access_expiry.change",
  // Ordift Organizational & Administrative Architecture V1, Phase 3
  // (2026-08-25) — granting/revoking Executive Admin, Director-tier
  // department authority, or a delegation is as sensitive as a role
  // grant/revoke, same tier.
  "executive_admin.grant",
  "executive_admin.revoke",
  "department_admin.grant",
  "department_admin.revoke",
  "delegation.create",
  "delegation.revoke",
]);

const ADMIN_TIER_ACTIONS = new Set<string>([
  "payment.completed",
  "payment.failed",
  "payment.amount_mismatch",
  "payment.completion_conflict",
  "payment.receipt_retry",
  "payment.exchange_rate_added",
  "payment.bank_transfer_initiated",
  "payment.bank_transfer_submitted",
  "payment.bank_transfer_approved",
  "payment.bank_transfer_rejected",
  "enquiry.amount_due_set",
  "booking.amount_due_set",
]);

function isAdminTierViewer(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return hasRole(user, "admin") || isSuperAdmin(user);
}

export async function getRecentActivity(limit = RECENT_ACTIVITY_LIMIT): Promise<ActivityLogEntry[]> {
  const supabase = await createClient();
  const viewer = await getCurrentUser();

  const excludedActions: string[] = [];
  if (!isSuperAdmin(viewer)) excludedActions.push(...SUPER_ADMIN_ONLY_ACTIONS);
  if (!isAdminTierViewer(viewer)) excludedActions.push(...ADMIN_TIER_ACTIONS);

  let query = supabase
    .from("activity_log")
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludedActions.length > 0) {
    query = query.not("action", "in", `(${excludedActions.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin] failed to load activity_log", error.message);
    return [];
  }

  return enrichWithActorIdentity(data ?? []);
}

const TYPE_ACTIVITY_LIMIT = 20;

// Recent activity across every entity of one type (e.g. every
// portfolio project's lifecycle changes for the Portfolio Management
// System's "Recently Edited" panel) — distinct from
// getActivityForEntity() above, which is scoped to one specific
// entity_id.
export async function getRecentActivityByType(
  entityType: string,
  limit = TYPE_ACTIVITY_LIMIT
): Promise<ActivityLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] failed to load activity_log by type", error.message);
    return [];
  }

  return enrichWithActorIdentity(data ?? []);
}

const ENTITY_ACTIVITY_LIMIT = 50;

// Access-change history for a single user (Users & Roles detail panel) —
// same table, just filtered to entity_type='user', entity_id=userId
// instead of the global feed.
export async function getActivityForEntity(
  entityType: string,
  entityId: string,
  limit = ENTITY_ACTIVITY_LIMIT
): Promise<ActivityLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] failed to load entity activity_log", error.message);
    return [];
  }

  return enrichWithActorIdentity(data ?? []);
}
