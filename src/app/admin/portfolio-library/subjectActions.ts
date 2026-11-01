"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { addSubject, declarePeopleShown, recordSubjectPermission, redactSubjectPermission, setFileHold, verifySubjectPermission, withdrawSubjectPermission } from "@/lib/portfolio/subjects";
import { SUBJECT_KINDS, type SubjectKind } from "@/lib/portfolio/subjectRules";
import { isJobType } from "@/lib/portfolio/destinations";
import { setCandidateOrigin } from "@/lib/portfolio/candidateJurisdiction";

// Permission evidence for the people and property shown (proposed 0182; every function refuses while SUBJECT_PERMISSIONS_ENABLED is false). The signed-in user is the only actor; the library re-checks authority and the database re-checks every rule.
export type SubjectFormState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);
async function run(f: FormData, ok: string, go: (u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<SubjectFormState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const r = await go(u);
  const t = str(f, "jobType"), id = str(f, "jobId");
  if (isJobType(t) && /^[0-9a-f-]{36}$/i.test(id)) revalidatePath(`/admin/portfolio-library/${t}/${id}`);
  return r.ok ? { ok: true, message: ok } : { ok: false, message: r.error };
}

export async function declarePeopleAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { return run(f, "Recorded.", (u) => declarePeopleShown(u, str(f, "fileId"), str(f, "declaration"), str(f, "note"))); }
export async function addSubjectAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> {
  const kind = str(f, "kind") as SubjectKind;
  return run(f, "Added to the list.", async (u) => { if (!SUBJECT_KINDS.some((k) => k.key === kind)) return { ok: false as const, error: "Choose who or what is shown." }; const r = await addSubject(u, str(f, "fileId"), kind, str(f, "label")); return r.ok ? { ok: true as const } : r; });
}
export async function recordSubjectPermissionAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> {
  const kind = str(f, "subjectKind") as SubjectKind;
  return run(f, "Recorded. It counts for nothing until it is verified.", async (u) => {
    const r = await recordSubjectPermission(u, { id: str(f, "subjectId"), kind }, { grantorKind: str(f, "grantorKind"), grantorName: str(f, "grantorName"), grantorRelationship: str(f, "grantorRelationship"), authorityReference: str(f, "authorityReference"), givenOn: str(f, "givenOn"), evidenceKind: str(f, "evidenceKind"), evidenceReference: str(f, "evidenceReference"), agreementId: str(f, "agreementId"), destinations: list(f, "destinations"), restrictions: str(f, "restrictions"), expiresOn: str(f, "expiresOn"), replacesGrantId: str(f, "replacesGrantId") });
    return r.ok ? { ok: true as const } : r;
  });
}
export async function verifySubjectPermissionAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { return run(f, "Verified. This decision is dated and attributed to you.", (u) => verifySubjectPermission(u, str(f, "subjectId"), str(f, "grantId"), str(f, "evidenceExamined"), str(f, "note"))); }
export async function withdrawSubjectPermissionAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { return run(f, "Withdrawn. The photograph is blocked for this person from now on.", (u) => withdrawSubjectPermission(u, str(f, "subjectId"), str(f, "grantId"), str(f, "note"))); }
export async function redactSubjectPermissionAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { return run(f, "Personal details erased and the erasure logged.", (u) => redactSubjectPermission(u, str(f, "grantId"), str(f, "note"), f.get("confirmPermitted") === "on")); }
export async function fileHoldAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { const act = str(f, "action") === "released" ? "released" : "placed"; return run(f, act === "placed" ? "Hold placed: nothing about this photograph can be erased." : "Hold released.", (u) => setFileHold(u, str(f, "fileId"), act, str(f, "note"))); }
export async function setOriginAction(_: SubjectFormState, f: FormData): Promise<SubjectFormState> { return run(f, "Origin recorded.", (u) => setCandidateOrigin(u, str(f, "fileId"), str(f, "origin"))); }
