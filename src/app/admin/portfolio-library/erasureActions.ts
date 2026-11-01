"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { isJobType, type JobType } from "@/lib/portfolio/destinations";
import { BASES, type Basis } from "@/lib/portfolio/erasureRules";
import { eraseRecordDetails, recordRetentionPolicy, setJobHold } from "@/lib/portfolio/permissionRecordErasure";

// Controlled erasure of the older client-permission records (proposed 0183; every function refuses while PERMISSION_RECORD_ERASURE_ENABLED is false). The signed-in user is the only actor; the library re-checks authority and the database re-checks every rule.
export type ErasureFormState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
async function run(f: FormData, ok: string, go: (u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, job: { jobType: JobType; jobId: string }) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<ErasureFormState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const t = str(f, "jobType"), id = str(f, "jobId");
  if (!isJobType(t) || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "That job was not recognised." };
  const r = await go(u, { jobType: t, jobId: id.toLowerCase() });
  revalidatePath(`/admin/portfolio-library/${t}/${id}`);
  return r.ok ? { ok: true, message: ok } : { ok: false, message: r.error };
}
export async function retentionPolicyAction(_: ErasureFormState, f: FormData): Promise<ErasureFormState> { return run(f, "Retention policy recorded.", (u) => recordRetentionPolicy(u, Number(str(f, "years")), str(f, "note"))); }
export async function jobHoldAction(_: ErasureFormState, f: FormData): Promise<ErasureFormState> { const act = str(f, "action") === "released" ? "released" : "placed"; return run(f, act === "placed" ? "Hold placed: nothing about this job's permission records can be erased." : "Hold released.", (u, j) => setJobHold(u, j.jobType, j.jobId, act, str(f, "note"))); }
export async function eraseRecordAction(_: ErasureFormState, f: FormData): Promise<ErasureFormState> {
  const basis = str(f, "basis") as Basis;
  return run(f, "Personal details erased. The permission's scope, uses and history are unchanged, and the erasure is logged.", (u) => BASES.some((b) => b.key === basis)
    ? eraseRecordDetails(u, str(f, "recordId"), { basis, reason: str(f, "note"), confirmPermitted: f.get("confirmPermitted") === "on", storageObjectRemoved: f.get("storageRemoved") === "on" }) : Promise.resolve({ ok: false as const, error: "State the basis for the erasure." }));
}
