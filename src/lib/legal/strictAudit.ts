import { createAdminClient } from "@/lib/supabase/admin";

// Decision-bearing records (an approval attestation, a registration check, a confirmed entity, a selected signatory) are stored in the audit
// log, so a silently failed write would be a false success. The shared logActivity() is best-effort by design; this one is not: it writes
// with the service role and reports failure so the calling action can refuse or roll back.
export async function recordAuditEvent(e: { actorUserId: string; action: string; entityType: string; entityId: string; metadata: Record<string, unknown> }): Promise<{ ok: true } | { ok: false }> {
  const { error } = await createAdminClient().from("activity_log").insert({ actor_user_id: e.actorUserId, action: e.action, entity_type: e.entityType, entity_id: e.entityId, metadata: e.metadata });
  if (error) { console.error("[legal] audit write failed", e.action, error.message); return { ok: false }; }
  return { ok: true };
}
