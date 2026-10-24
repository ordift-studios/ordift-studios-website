import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isStaffOrAdmin, type CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { PERMISSION_TEXT_APPROVED, PERMISSION_TEXT_VERSION } from "./permissionText";
import { isDestination, type JobType } from "./destinations";
import { summariseStanding, validateAdminPermission, validateReview, type AdminPermissionInput, type ReviewInput, type Standing } from "./permissionModel";

// The persistent portfolio library: candidates, collections, marketing permission (stage 1), internal approval (stage 2) and use control.
// EVERY function starts with gate(): while PORTFOLIO_LIBRARY_ENABLED is false (migrations 0169-0171 not applied) nothing here reads or writes the database.
// The database itself re-enforces what is checked here (authority, evidence shape, both approval stages at the moment of use), so a mistake in this file
// cannot make an unapproved photograph usable. Postgres error text is passed back as-is: the trigger messages are written for people.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const gate = () => (PORTFOLIO_LIBRARY_ENABLED ? null : fail("The portfolio library is not switched on yet."));
async function needAuthority(user: CurrentUser) { return (await isManagementUser(user)) ? null : fail("Only the Founder or an authorised executive admin can do this."); }
const clean = (e: { message?: string } | null) => (e?.message ?? "That could not be saved.").replace(/^.*?ERROR:\s*/, "");

// ---------------------------------------------------------------- candidates and collections (any staff member may PROPOSE)
export async function addPortfolioCandidates(user: CurrentUser, fileIds: string[], via: "picker" | "final_approval" | "job_page"): Promise<Result<{ added: number; alreadyThere: number }>> {
  const g = gate(); if (g) return g;
  if (!isStaffOrAdmin(user)) return fail("Only staff can propose portfolio candidates.");
  const ids = [...new Set(fileIds.map(String))].slice(0, 200);
  if (ids.length === 0) return fail("Select at least one photograph.");
  const admin = createAdminClient();
  const { data: files } = await admin.from("project_files").select("id, mime_type, original_filename").in("id", ids).is("purged_at", null);
  const real = (files ?? []).map((f) => f.id as string);
  if (real.length === 0) return fail("None of the selected photographs is available.");
  const { data: existing } = await admin.from("portfolio_candidates").select("project_file_id").in("project_file_id", real);
  const have = new Set((existing ?? []).map((r) => r.project_file_id as string));
  const fresh = real.filter((id) => !have.has(id));
  if (fresh.length) {
    const { error } = await admin.from("portfolio_candidates").insert(fresh.map((id) => ({ project_file_id: id, added_by: user.id, proposed_via: via })));
    if (error) return fail(clean(error));
    await logActivity({ actorUserId: user.id, action: "portfolio.candidates_proposed", entityType: "portfolio_candidate", metadata: { count: fresh.length, via } });
  }
  return { ok: true, added: fresh.length, alreadyThere: real.length - fresh.length };
}

export async function createCollection(user: CurrentUser, input: { name: string; serviceCategory?: string; cmsCollectionRef?: string }): Promise<Result<{ id: string }>> {
  const g = gate(); if (g) return g;
  if (!isStaffOrAdmin(user)) return fail("Only staff can create collections.");
  const admin = createAdminClient();
  const { data, error } = await admin.from("portfolio_collections").insert({ name: input.name.trim(), service_category: input.serviceCategory?.trim() || null, cms_collection_ref: input.cmsCollectionRef?.trim() || null, created_by: user.id }).select("id").single();
  if (error || !data) return fail(clean(error));
  return { ok: true, id: data.id as string };
}

export async function addFilesToCollection(user: CurrentUser, collectionId: string, fileIds: string[]): Promise<Result<{ added: number }>> {
  const g = gate(); if (g) return g;
  const c = await addPortfolioCandidates(user, fileIds, "picker"); if (!c.ok) return c;
  const admin = createAdminClient();
  const { data: cands } = await admin.from("portfolio_candidates").select("id").in("project_file_id", fileIds.slice(0, 200));
  const { data: live } = await admin.from("portfolio_collection_items").select("candidate_id").eq("collection_id", collectionId).is("removed_at", null);
  const have = new Set((live ?? []).map((r) => r.candidate_id as string));
  const rows = (cands ?? []).filter((r) => !have.has(r.id as string)).map((r) => ({ collection_id: collectionId, candidate_id: r.id as string, added_by: user.id }));
  if (rows.length) { const { error } = await admin.from("portfolio_collection_items").insert(rows); if (error) return fail(clean(error)); }
  return { ok: true, added: rows.length };
}

// ---------------------------------------------------------------- STAGE 1: marketing permission
export async function recordAdminPermission(user: CurrentUser, jobType: JobType, jobId: string, input: AdminPermissionInput & { verified: boolean }): Promise<Result> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  const problems = validateAdminPermission(input);
  if (problems.length) return fail(problems.join(" "));
  const admin = createAdminClient();
  // The recorder states whether the evidence suffices. Insufficient evidence is saved as "verification still required"; it never counts until verified.
  const { data, error } = await admin.from("marketing_permission_records").insert({
    job_type: jobType, job_id: jobId, source: "admin_recorded", decision: input.decision, grantor_name: input.grantorName.trim(), grantor_capacity: input.grantorCapacity,
    allowed_destinations: input.decision === "granted" ? input.destinations : [], file_ids: input.fileIds && input.fileIds.length ? input.fileIds : null, restrictions: input.restrictions.trim() || null,
    expires_on: input.expiresOn || null, method: input.method, granted_on: input.grantedOn || null, evidence_summary: input.evidenceSummary.trim(), note: input.note.trim() || null,
    verification_status: input.verified ? "verified" : "pending_verification", recorded_by: user.id,
  }).select("id").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.permission_${input.decision}_recorded`, entityType: "marketing_permission", entityId: data.id as string, metadata: { jobType, jobId, verified: input.verified } });
  return { ok: true };
}

export async function recogniseContractPermission(user: CurrentUser, jobType: JobType, jobId: string, input: { agreementId: string; clause: string; destinations: string[]; expiresOn?: string; restrictions?: string; grantorName: string }): Promise<Result<{ verified: boolean }>> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  if (input.destinations.length === 0 || input.destinations.some((d) => !isDestination(d))) return fail("Choose at least one recognised use.");
  if (input.clause.trim().length < 2) return fail("Name the clause that gives the permission.");
  const admin = createAdminClient();
  // The DATABASE decides: executed, linked to this job, a recorded release covering every use. Otherwise it refuses with the reason.
  const { data, error } = await admin.from("marketing_permission_records").insert({
    job_type: jobType, job_id: jobId, source: "contract", decision: "granted", grantor_name: input.grantorName.trim() || "Client (per agreement)", grantor_capacity: "client",
    allowed_destinations: input.destinations, agreement_id: input.agreementId, agreement_clause: input.clause.trim(), expires_on: input.expiresOn || null, restrictions: input.restrictions?.trim() || null, recorded_by: user.id,
  }).select("id, verification_status").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.permission_from_agreement", entityType: "marketing_permission", entityId: data.id as string, metadata: { jobType, jobId, agreementId: input.agreementId } });
  return { ok: true, verified: data.verification_status === "verified" };
}

export async function verifyPermission(user: CurrentUser, jobType: JobType, jobId: string, recordId: string, note: string): Promise<Result> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  if (note.trim().length < 3) return fail("Say what you checked.");
  const admin = createAdminClient();
  const { data: tgt } = await admin.from("marketing_permission_records").select("grantor_name, grantor_capacity").eq("id", recordId).maybeSingle();
  if (!tgt) return fail("That record was not found.");
  const { error } = await admin.from("marketing_permission_records").insert({ job_type: jobType, job_id: jobId, source: "admin_recorded", decision: "verified", supersedes_id: recordId, grantor_name: tgt.grantor_name, grantor_capacity: tgt.grantor_capacity, note: note.trim(), recorded_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.permission_verified", entityType: "marketing_permission", entityId: recordId, metadata: { jobType, jobId } });
  return { ok: true };
}

export async function createPermissionRequest(user: CurrentUser, input: { jobType: JobType; jobId: string; addressedTo: string; destinations: string[]; fileIds: string[] | null }): Promise<Result> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  if (!PERMISSION_TEXT_APPROVED) return fail("The client permission wording has not been approved yet, so no request can be sent.");
  if (input.destinations.length === 0 || input.destinations.some((d) => !isDestination(d))) return fail("Choose at least one recognised use.");
  const admin = createAdminClient();
  const { error } = await admin.from("marketing_permission_requests").insert({ job_type: input.jobType, job_id: input.jobId, addressed_to: input.addressedTo, proposed_destinations: input.destinations, file_ids: input.fileIds?.length ? input.fileIds : null, text_version: PERMISSION_TEXT_VERSION, created_by: user.id });
  if (error) return fail(clean(error));
  // Deliberately NO email or notification: the client sees the request in their portal. Any reminder rule needs its own authorisation.
  return { ok: true };
}

// Client portal: the signed-in rights holder answers a request addressed to them. Nothing is preselected; refusing never touches delivery.
export async function answerPermissionRequest(userId: string, requestId: string, input: { decision: "granted" | "declined"; destinations: string[]; restrictions: string; displayName: string }): Promise<Result> {
  const g = gate(); if (g) return g;
  if (!PERMISSION_TEXT_APPROVED) return fail("This request is not available yet.");
  if (input.decision === "granted" && (input.destinations.length === 0 || input.destinations.some((d) => !isDestination(d)))) return fail("Tick at least one use, or choose to decline.");
  const admin = createAdminClient();
  const { data: req } = await admin.from("marketing_permission_requests").select("id, job_type, job_id, addressed_to, status, file_ids, proposed_destinations, text_version").eq("id", requestId).maybeSingle();
  if (!req || req.addressed_to !== userId || req.status !== "open") return fail("There is no open request for you here.");
  const { error } = await admin.from("marketing_permission_records").insert({
    job_type: req.job_type, job_id: req.job_id, source: "client_portal", decision: input.decision, grantor_name: input.displayName.trim() || "Client", grantor_capacity: "client", grantor_profile_id: userId,
    allowed_destinations: input.decision === "granted" ? input.destinations : [], file_ids: input.decision === "granted" ? req.file_ids : null, restrictions: input.restrictions.trim() || null,
    permission_text_version: req.text_version, request_id: requestId, recorded_by: userId,
  });
  if (error) return fail(clean(error));
  return { ok: true };
}

export async function withdrawOwnPermission(userId: string, recordId: string, displayName: string): Promise<Result> {
  const g = gate(); if (g) return g;
  const admin = createAdminClient();
  const { data: tgt } = await admin.from("marketing_permission_records").select("job_type, job_id, grantor_profile_id, decision").eq("id", recordId).maybeSingle();
  if (!tgt || tgt.grantor_profile_id !== userId || tgt.decision !== "granted") return fail("That permission was not found.");
  const { error } = await admin.from("marketing_permission_records").insert({ job_type: tgt.job_type, job_id: tgt.job_id, source: "client_portal", decision: "withdrawn", supersedes_id: recordId, grantor_name: displayName.trim() || "Client", grantor_capacity: "client", grantor_profile_id: userId, permission_text_version: PERMISSION_TEXT_VERSION, recorded_by: userId });
  if (error) return fail(clean(error));
  return { ok: true };
}

// ---------------------------------------------------------------- STAGE 2: internal approval, and use control
export async function recordInternalReview(user: CurrentUser, input: { fileId: string } & ReviewInput): Promise<Result> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  const problems = validateReview(input);
  if (problems.length) return fail(problems.join(" "));
  const added = await addPortfolioCandidates(user, [input.fileId], "job_page"); if (!added.ok) return added;
  const admin = createAdminClient();
  const { data: cand } = await admin.from("portfolio_candidates").select("id").eq("project_file_id", input.fileId).maybeSingle();
  if (!cand) return fail("That photograph is not a candidate.");
  const { error } = await admin.from("portfolio_internal_reviews").insert({ project_file_id: input.fileId, candidate_id: cand.id, decision: input.decision, destinations: input.decision === "approved" ? input.destinations : [], checks: input.checks, notes: input.notes.trim() || null, reviewed_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.internal_${input.decision}`, entityType: "project_file", entityId: input.fileId, metadata: { destinations: input.destinations } });
  return { ok: true };
}

// The single re-check used at the moment of publishing or sharing: both stages, evaluated now by the database.
export async function checkUseEligibility(fileId: string, destination: string): Promise<{ eligible: boolean; rightsReason: string; internalReason: string }> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !isDestination(destination)) return { eligible: false, rightsReason: "no_permission_on_record", internalReason: "no_internal_review" };
  const { data } = await createAdminClient().rpc("portfolio_use_eligibility", { p_file: fileId, p_destination: destination });
  const r = Array.isArray(data) ? data[0] : data;
  return { eligible: Boolean(r?.eligible), rightsReason: r?.rights_reason ?? "no_permission_on_record", internalReason: r?.internal_reason ?? "no_internal_review" };
}

export async function recordUse(user: CurrentUser, input: { fileId: string; destination: string; action: "published" | "shared" | "ended"; reference: string }): Promise<Result> {
  const g = gate(); if (g) return g;
  const a = await needAuthority(user); if (a) return a;
  if (!isDestination(input.destination)) return fail("That use is not recognised.");
  // The insert itself re-checks both stages in the database; a use that no longer qualifies is refused there, whatever this page showed earlier.
  const { error } = await createAdminClient().from("portfolio_use_events").insert({ project_file_id: input.fileId, destination: input.destination, action: input.action, reference: input.reference.trim() || null, actor_id: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.use_${input.action}`, entityType: "project_file", entityId: input.fileId, metadata: { destination: input.destination } });
  return { ok: true };
}

// ---------------------------------------------------------------- reads
export async function getStandings(fileIds: string[]): Promise<Record<string, ReturnType<typeof summariseStanding> & { byDestination: Standing[] }>> {
  if (!PORTFOLIO_LIBRARY_ENABLED || fileIds.length === 0) return {};
  const { data } = await createAdminClient().rpc("portfolio_standing", { p_files: fileIds.slice(0, 200) });
  const by = new Map<string, Standing[]>();
  for (const r of (data ?? []) as { project_file_id: string; destination: string; eligible: boolean; rights_reason: string; internal_reason: string }[]) {
    const list = by.get(r.project_file_id) ?? [];
    list.push({ destination: r.destination, eligible: r.eligible, rightsReason: r.rights_reason, internalReason: r.internal_reason });
    by.set(r.project_file_id, list);
  }
  return Object.fromEntries([...by].map(([id, rows]) => [id, { ...summariseStanding(rows), byDestination: rows }]));
}

export type PermissionRecordView = { id: string; seq: number; source: string; decision: string; grantorName: string; grantorCapacity: string; destinations: string[]; restrictions: string | null; expiresOn: string | null; method: string | null; grantedOn: string | null; evidence: string | null; verification: string; note: string | null; agreementReference: string | null; clause: string | null; recordedAt: string; supersedes: string | null; wholeJob: boolean };

export async function getJobPermissionView(jobType: JobType, jobId: string) {
  if (!PORTFOLIO_LIBRARY_ENABLED) return null;
  const admin = createAdminClient();
  const [{ data: recs }, { data: reqs }] = await Promise.all([
    admin.from("marketing_permission_records").select("*").eq("job_type", jobType).eq("job_id", jobId).order("seq", { ascending: false }),
    admin.from("marketing_permission_requests").select("id, status, proposed_destinations, created_at, addressed_to").eq("job_type", jobType).eq("job_id", jobId).order("created_at", { ascending: false }),
  ]);
  const agIds = [...new Set((recs ?? []).map((r) => r.agreement_id as string | null).filter((x): x is string => Boolean(x)))];
  const { data: ags } = agIds.length ? await admin.from("agreements").select("id, agreement_reference").in("id", agIds) : { data: [] };
  const ref = new Map((ags ?? []).map((a) => [a.id as string, a.agreement_reference as string]));
  const records: PermissionRecordView[] = (recs ?? []).map((r) => ({
    id: r.id, seq: Number(r.seq), source: r.source, decision: r.decision, grantorName: r.grantor_name, grantorCapacity: r.grantor_capacity, destinations: r.allowed_destinations ?? [], restrictions: r.restrictions, expiresOn: r.expires_on,
    method: r.method, grantedOn: r.granted_on, evidence: r.evidence_summary, verification: r.verification_status, note: r.note, agreementReference: r.agreement_id ? ref.get(r.agreement_id) ?? null : null, clause: r.agreement_clause, recordedAt: r.recorded_at, supersedes: r.supersedes_id, wholeJob: !r.file_ids,
  }));
  return { records, requests: reqs ?? [] };
}

// Executed agreements that name this job as their context and carry a recorded release: the only agreements the database will accept as Route A evidence.
export async function listContractCandidates(jobType: JobType, jobId: string) {
  if (!PORTFOLIO_LIBRARY_ENABLED) return [];
  const admin = createAdminClient();
  const reference = jobType === "engagement" ? jobId : ((await admin.from("crew_support_requests").select("reference_number").eq("id", jobId).maybeSingle()).data?.reference_number as string | undefined);
  if (!reference) return [];
  const { data } = await admin.from("agreements").select("id, agreement_reference, status, agreement_releases(usage_rights, territory, duration, duration_end_date)").eq("primary_context_type", jobType).eq("primary_context_reference", reference);
  return (data ?? []).map((a) => {
    const rel = (a.agreement_releases as unknown as { usage_rights: Record<string, boolean>; territory: string | null; duration: string | null; duration_end_date: string | null }[] | null)?.[0] ?? null;
    return { id: a.id as string, reference: a.agreement_reference as string, status: a.status as string, executed: ["fully_executed", "active", "completed"].includes(a.status as string), release: rel };
  });
}

export type CollectionSummary = { id: string; name: string; serviceCategory: string | null; cmsCollectionRef: string | null; count: number };
export async function listCollections(): Promise<CollectionSummary[]> {
  if (!PORTFOLIO_LIBRARY_ENABLED) return [];
  const admin = createAdminClient();
  const [{ data: cols }, { data: items }] = await Promise.all([
    admin.from("portfolio_collections").select("id, name, service_category, cms_collection_ref").eq("status", "active").order("name"),
    admin.from("portfolio_collection_items").select("collection_id").is("removed_at", null),
  ]);
  const n = new Map<string, number>();
  for (const i of items ?? []) n.set(i.collection_id as string, (n.get(i.collection_id as string) ?? 0) + 1);
  return (cols ?? []).map((c) => ({ id: c.id as string, name: c.name as string, serviceCategory: (c.service_category as string | null) ?? null, cmsCollectionRef: (c.cms_collection_ref as string | null) ?? null, count: n.get(c.id as string) ?? 0 }));
}
export async function listCollectionFileIds(collectionId: string): Promise<string[]> {
  if (!PORTFOLIO_LIBRARY_ENABLED) return [];
  const admin = createAdminClient();
  const { data: items } = await admin.from("portfolio_collection_items").select("candidate_id").eq("collection_id", collectionId).is("removed_at", null).order("display_order");
  const ids = (items ?? []).map((i) => i.candidate_id as string);
  if (!ids.length) return [];
  const { data: cands } = await admin.from("portfolio_candidates").select("project_file_id").in("id", ids);
  return (cands ?? []).map((c) => c.project_file_id as string);
}
