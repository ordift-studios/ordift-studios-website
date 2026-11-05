import { createClient } from "@/lib/supabase/server";

// The shared audit trail (public.activity_log), written the same way as every other admin module, with one difference that matters here: it reports whether the entry was actually stored, so a publish
// can say honestly "published, but the audit entry could not be recorded" instead of claiming success for a step that failed. (logActivity swallows write errors by design; this does not.)
export type AuditEntry = { actorUserId: string; action: string; entityId?: string; metadata?: Record<string, unknown> };

export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("activity_log").insert({
      actor_user_id: entry.actorUserId, action: entry.action, entity_type: "qr_portfolio", entity_id: entry.entityId ?? null, metadata: entry.metadata ?? {},
    });
    if (error) { console.error("[admin] failed to write activity_log (qr portfolio)", error.message); return false; }
    return true;
  } catch (e) {
    console.error("[admin] failed to write activity_log (qr portfolio)", e instanceof Error ? e.message : e);
    return false;
  }
}
