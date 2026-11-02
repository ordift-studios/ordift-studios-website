import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { PERMISSION_RECORD_ERASURE_ENABLED } from "./erasureGate";
import type { JobType } from "./destinations";

// CONTROLLED ERASURE OF PERSONAL DETAILS in the older client-permission records (proposed migration 0183; dormant). Management only. Nothing is deleted or erased automatically. The permission's scope, uses, dates, verification and
// withdrawal history are never touched, and the database refuses an erasure that is in force, under a hold, still in use, before the adopted retention period (on the retention basis), or whenever the record still references a
// stored evidence file. That last rule FAILS CLOSED with no override: the system cannot verify that a file was removed (the record names no bucket) and a person's confirmation must not stand in for evidence. THIS MODULE NEVER
// TOUCHES STORAGE. (Production holds no such record today; allowing erasure of one needs a future, separately approved process that records the bucket and verifies the deletion.)
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const gate = () => (PORTFOLIO_LIBRARY_ENABLED && PERMISSION_RECORD_ERASURE_ENABLED ? null : fail("Erasure of permission-record details is not switched on yet."));
const authority = async (u: CurrentUser) => ((await isManagementUser(u)) ? null : fail("Only the Founder or an authorised executive admin can do this."));
const clean = (e: { message?: string } | null) => (e?.message ?? "That could not be saved.").replace(/^.*?ERROR:\s*/, "");
import { BASES, REASON_HELP, type Basis } from "./erasureRules";
import { authorityTicket } from "./authorityTicket";
export { BASES, REASON_HELP, type Basis };
const reasonOk = (r: string) => r.trim().length >= 10 && r.trim().length <= 200;

export async function recordRetentionPolicy(user: CurrentUser, years: number, note: string): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (!Number.isInteger(years) || years < 1 || years > 50) return fail("Enter the retention period in whole years (1 to 50).");
  if (note.trim().length < 10 || note.trim().length > 500) return fail("Record what was decided and that longer retention applies only where a duty, limitation period, dispute or hold requires it (10 to 500 characters).");
  { const t = await authorityTicket(user, "retention_policy", user.id); if (!t.ok) return fail(t.error); }
  const { error } = await createAdminClient().from("portfolio_retention_policy").insert({ retention_years: years, policy_note: note.trim(), adopted_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.retention_policy_recorded", entityType: "portfolio_retention_policy", metadata: { years } });
  return { ok: true };
}

export async function setJobHold(user: CurrentUser, jobType: JobType, jobId: string, action: "placed" | "released", reason: string): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (!reasonOk(reason)) return fail(`State the reason: ${REASON_HELP}`);
  { const t = await authorityTicket(user, `job_hold:${action}`, jobId); if (!t.ok) return fail(t.error); }
  const { error } = await createAdminClient().from("marketing_permission_job_holds").insert({ job_type: jobType, job_id: jobId, action, reason: reason.trim(), recorded_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.job_hold_${action}`, entityType: "job", entityId: jobId, metadata: { jobType } });
  return { ok: true };
}

export async function eraseRecordDetails(user: CurrentUser, recordId: string, i: { basis: Basis; reason: string; confirmPermitted: boolean }): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (!BASES.some((b) => b.key === i.basis)) return fail("State the basis for the erasure.");
  if (!reasonOk(i.reason)) return fail(`State the reason: ${REASON_HELP}`);
  if (i.confirmPermitted !== true) return fail("Confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence.");
  { const t = await authorityTicket(user, "erase_record", recordId); if (!t.ok) return fail(t.error); }
  const { error } = await createAdminClient().rpc("marketing_permission_record_redact", { p_record: recordId, p_actor: user.id, p_reason: i.reason.trim(), p_basis: i.basis, p_confirm_permitted: true });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.permission_record_erased", entityType: "marketing_permission_record", entityId: recordId, metadata: { basis: i.basis } });
  return { ok: true };
}

export type ErasureRow = { id: string; decision: string; source: string; recordedAt: string; destinations: string[]; erased: boolean; hasStoredFile: boolean; blockersRetention: string[]; endedOn: string | null; lastUseOn: string | null; earliestRetentionDate: string | null };
export type ErasureView = { policyYears: number | null; policyNote: string | null; hold: { reason: string; at: string } | null; rows: ErasureRow[] };
export async function getErasureView(jobType: JobType, jobId: string): Promise<ErasureView | null> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_RECORD_ERASURE_ENABLED) return null;
  const admin = createAdminClient();
  const [{ data: pol }, { data: holds }, { data: recs }] = await Promise.all([
    admin.from("portfolio_retention_policy").select("retention_years, policy_note").order("seq", { ascending: false }).limit(1),
    admin.from("marketing_permission_job_holds").select("action, reason, recorded_at").eq("job_type", jobType).eq("job_id", jobId).order("seq", { ascending: false }).limit(1),
    admin.from("marketing_permission_records").select("id, decision, source, recorded_at, allowed_destinations, grantor_name, evidence_storage_path, supersedes_id").eq("job_type", jobType).eq("job_id", jobId).order("seq", { ascending: true }),
  ]);
  const roots = (recs ?? []).filter((r) => !r.supersedes_id);
  const rows: ErasureRow[] = [];
  for (const r of roots) {
    const { data: chk } = await admin.rpc("marketing_permission_record_erasure_check", { p_record: r.id, p_basis: "retention_period_ended" });
    const c = Array.isArray(chk) ? chk[0] : chk;
    rows.push({ id: r.id as string, decision: r.decision as string, source: r.source as string, recordedAt: r.recorded_at as string, destinations: (r.allowed_destinations as string[]) ?? [], erased: String(r.grantor_name) === "[erased]",
      hasStoredFile: (recs ?? []).some((x) => (x.id === r.id || x.supersedes_id === r.id) && x.evidence_storage_path), blockersRetention: (c?.blockers as string[] | undefined) ?? [], endedOn: (c?.ended_on as string | null) ?? null, lastUseOn: (c?.last_use_on as string | null) ?? null, earliestRetentionDate: (c?.earliest_retention_date as string | null) ?? null });
  }
  const h = holds?.[0];
  return { policyYears: pol?.[0]?.retention_years ?? null, policyNote: (pol?.[0]?.policy_note as string | undefined) ?? null, hold: h && h.action === "placed" ? { reason: h.reason as string, at: h.recorded_at as string } : null, rows };
}
