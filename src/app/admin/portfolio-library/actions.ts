"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/portal/roles";
import { addFilesToCollection, addPortfolioCandidates, createCollection, createPermissionRequest, recogniseContractPermission, recordAdminPermission, recordInternalReview, recordUse, verifyPermission, type Result } from "@/lib/portfolio/library";
import { isJobType, type JobType } from "@/lib/portfolio/destinations";
import { REVIEW_CHECKS } from "@/lib/portfolio/permissionModel";

// Thin wrappers: sign-in check, form parsing, then the library (which applies the feature gate and the authority rules, and the database re-checks them).
export type FormState = { ok: boolean; message: string } | null;
const done = (r: Result, ok: string): FormState => (r.ok ? { ok: true, message: ok } : { ok: false, message: r.error });
const NOT_IN = { ok: false, message: "Please sign in again." } as const;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);
function job(f: FormData): { jobType: JobType; jobId: string } | null {
  const t = str(f, "jobType"), id = str(f, "jobId");
  return isJobType(t) && /^[0-9a-f-]{36}$/i.test(id) ? { jobType: t, jobId: id.toLowerCase() } : null;
}
async function withUser(f: FormData, run: (u: CurrentUser, j: { jobType: JobType; jobId: string }) => Promise<FormState>): Promise<FormState> {
  const u = await getCurrentUser(); if (!u) return NOT_IN;
  const j = job(f); if (!j) return { ok: false, message: "That job was not recognised." };
  const r = await run(u, j);
  revalidatePath(`/admin/portfolio-library/${j.jobType}/${j.jobId}`);
  return r;
}

export async function recordPermissionAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u, j) => {
    const decision = str(f, "decision") as "granted" | "declined" | "withdrawn";
    const fileIds = str(f, "scope") === "files" ? list(f, "fileIds") : null;
    return done(await recordAdminPermission(u, j.jobType, j.jobId, {
      decision, grantorName: str(f, "grantorName"), grantorCapacity: str(f, "grantorCapacity"), destinations: list(f, "destinations"), fileIds, restrictions: str(f, "restrictions"),
      expiresOn: str(f, "expiresOn"), method: str(f, "method"), grantedOn: str(f, "grantedOn"), evidenceSummary: str(f, "evidenceSummary"), note: str(f, "note"), verified: str(f, "evidenceSufficient") === "yes",
    }), "Recorded. It appears below as administrator-recorded.");
  });
}
export async function recogniseContractAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u, j) => {
    const r = await recogniseContractPermission(u, j.jobType, j.jobId, { agreementId: str(f, "agreementId"), clause: str(f, "clause"), destinations: list(f, "destinations"), expiresOn: str(f, "expiresOn"), restrictions: str(f, "restrictions"), grantorName: str(f, "grantorName") });
    return r.ok ? { ok: true, message: r.verified ? "Recognised from the agreement and verified." : "Recorded from the agreement; its territory or term still needs your verification." } : { ok: false, message: r.error };
  });
}
export async function verifyPermissionAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u, j) => done(await verifyPermission(u, j.jobType, j.jobId, str(f, "recordId"), str(f, "note")), "Verified."));
}
export async function requestPermissionAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u, j) => done(await createPermissionRequest(u, { ...j, addressedTo: str(f, "addressedTo"), destinations: list(f, "destinations"), fileIds: null }), "The request is now waiting in the client's portal. No message was sent."));
}
export async function reviewPhotoAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u) => {
    const checks = Object.fromEntries(REVIEW_CHECKS.map((c) => [c.key, f.get(`check_${c.key}`) === "on"]));
    return done(await recordInternalReview(u, { fileId: str(f, "fileId"), decision: str(f, "decision") as "approved" | "rejected" | "returned" | "revoked", destinations: list(f, "destinations"), checks, notes: str(f, "notes") }), "Your decision is recorded.");
  });
}
export async function recordUseAction(_: FormState, f: FormData): Promise<FormState> {
  return withUser(f, async (u) => done(await recordUse(u, { fileId: str(f, "fileId"), destination: str(f, "destination"), action: str(f, "action") as "published" | "shared" | "ended", reference: str(f, "reference") }), "Recorded."));
}

// Used by the picker and by the final-approval gallery: propose photographs as private candidates. Never publishes, delivers or changes retention.
export async function addCandidatesAction(fileIds: string[], via: "picker" | "final_approval"): Promise<{ ok: boolean; message: string }> {
  const u = await getCurrentUser(); if (!u) return NOT_IN;
  const r = await addPortfolioCandidates(u, fileIds.map(String), via);
  return r.ok ? { ok: true, message: `${r.added} added as private candidates${r.alreadyThere ? `, ${r.alreadyThere} already were` : ""}. Nothing was published or sent.` } : { ok: false, message: r.error };
}

// Put the picker's tray into a collection (a new one, or an existing one). Photographs from several jobs may share a collection; each stays linked to its own job.
export async function addToCollectionAction(fileIds: string[], collectionId: string, newName: string): Promise<{ ok: boolean; message: string }> {
  const u = await getCurrentUser(); if (!u) return NOT_IN;
  let id = collectionId;
  if (!id) {
    const c = await createCollection(u, { name: newName });
    if (!c.ok) return { ok: false, message: c.error };
    id = c.id;
  }
  const r = await addFilesToCollection(u, id, fileIds.map(String));
  return r.ok ? { ok: true, message: `${r.added} photograph${r.added === 1 ? "" : "s"} added. They remain private and linked to their jobs; nothing was published.` } : { ok: false, message: r.error };
}
