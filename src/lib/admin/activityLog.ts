import { createClient } from "@/lib/supabase/server";

// Shared audit trail for the Admin Platform (public.activity_log,
// migration 0004). Every module that mutates something writes here the
// same way, rather than inventing its own log — RLS restricts both read
// and insert to staff/admin (see supabase/migrations/0004_admin_platform.sql),
// so the session-scoped client is enough; no need for the admin/service-role
// client here.

export type ActivityLogEntry = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function logActivity(params: {
  actorUserId: string;
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

const RECENT_ACTIVITY_LIMIT = 20;

export async function getRecentActivity(limit = RECENT_ACTIVITY_LIMIT): Promise<ActivityLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] failed to load activity_log", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  }));
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
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at, profiles(full_name)")
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] failed to load activity_log by type", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  }));
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
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at, profiles(full_name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] failed to load entity activity_log", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  }));
}
