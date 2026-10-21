import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { sendFilesReadyEmail } from "@/lib/enquiry/lifecycleEmails";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { getCrewAssignmentForEngagement } from "./crewOffers";
import { isManagementUser } from "./management";
import { canRemoveOwnFile, clientFilePath, deliverableKeyFor, releaseCategoryLabel, reviewerConflict, transition, validateSubmitForRelease, type ReleaseAction } from "./fileRelease";
import { canReviewFile, type FileOutcome } from "./fileReview";
import { LINKED_LOGIN_MESSAGE } from "./founderSelfReviewRules";

// The controlled path by which an assignment's private file reaches the client:
//   professional uploads (private) -> submits for review -> management approves -> management releases.
// "Released" means a deliverables row (the client's existing Files & Deliverables list) now points at an
// authorised, audited download route for the file. Nothing here completes the engagement or project, marks
// a payable paid, or triggers a payout.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOT_ENTITY = "crew_support_slot";

// Bounded parallelism for batch operations: a batch of dozens of files finishes in seconds instead of running one
// file at a time (the original "submit all" took ~1.3 s per file), without opening an unbounded number of queries.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
const BATCH_CONCURRENCY = 4;

// Database refusals carry a readable "fsr: …" message; show that, never a raw stack or internal detail.
export function friendlyDbError(message: string): string {
  const m = /fsr: ([^\n]+)/.exec(message);
  return m ? m[1].replace(/\s+/g, " ").trim() : "The change was refused.";
}
const MAX_BATCH = 200;

type FileRow = { id: string; engagement_id: string; file_kind: string; original_filename: string; release_status: string; release_category: string | null; client_title: string | null; client_description: string | null; purged_at: string | null; uploaded_by: string | null; submitted_for_release_by: string | null };
const FILE_COLS = "id, engagement_id, file_kind, original_filename, release_status, release_category, client_title, client_description, purged_at, uploaded_by, submitted_for_release_by";

async function loadFile(fileId: string): Promise<FileRow | null> {
  const { data } = await createAdminClient().from("project_files").select(FILE_COLS).eq("id", fileId).maybeSingle();
  return (data as FileRow | null) ?? null;
}

// Separation of duties for a file and a would-be reviewer/releaser; null means no conflict.
// Beyond the person's own work, a login registered as being under the Founder's common control is never an independent
// reviewer of the Founder's work (ORDIFT-POL-FSR-001). Before the exception tables exist this adds nothing.
async function conflictFor(file: FileRow, reviewerId: string): Promise<string | null> {
  const { data: eng } = await createAdminClient().from("engagements").select("payee_profile_id").eq("id", file.engagement_id).maybeSingle();
  const assigneeId = (eng?.payee_profile_id as string | null) ?? null;
  const own = reviewerConflict({ reviewerId, uploadedBy: file.uploaded_by, submittedBy: file.submitted_for_release_by, assigneeId });
  if (own) return own;
  return linkedLoginConflict(reviewerId, [file.uploaded_by, file.submitted_for_release_by, assigneeId]);
}

async function linkedLoginConflict(reviewerId: string, performers: (string | null)[]): Promise<string | null> {
  const group = await foundersGroupOf([reviewerId, ...performers.filter((p): p is string => Boolean(p))]);
  if (group === "not-installed") return null;
  if (group === "unknown") return "Independence could not be verified right now, so this review is blocked. Try again shortly.";
  const reviewerGroup = group.get(reviewerId);
  if (!reviewerGroup) return null;
  const clash = performers.some((p) => p && p !== reviewerId && group.get(p) === reviewerGroup);
  return clash ? LINKED_LOGIN_MESSAGE : null;
}

// profile id -> Founder identity id, for the Founder and any login registered under the Founder's common control.
async function foundersGroupOf(profileIds: string[]): Promise<Map<string, string> | "not-installed" | "unknown"> {
  const admin = createAdminClient();
  const ids = [...new Set(profileIds)];
  const [founders, linked] = await Promise.all([
    // NOT limited to an active identity: revoking the exception or the identity must never make the second login "independent"
    // again (mirrors private.fsr_group in migration 0169, found by the PostgreSQL rehearsal).
    admin.from("founder_identities").select("id, profile_id").in("profile_id", ids),
    admin.from("founder_common_control_accounts").select("founder_identity_id, profile_id").is("revoked_at", null).in("profile_id", ids),
  ]);
  for (const r of [founders, linked]) {
    if (r.error) return isMissingRelation(r.error) ? "not-installed" : "unknown";
  }
  const out = new Map<string, string>();
  for (const f of founders.data ?? []) out.set(f.profile_id as string, f.id as string);
  if ((linked.data ?? []).length > 0) {
    // a linked login belongs to its Founder identity's group (whatever that identity's status is)
    const { data: all, error } = await admin.from("founder_identities").select("id, profile_id");
    if (error) return isMissingRelation(error) ? "not-installed" : "unknown";
    for (const l of linked.data ?? []) out.set(l.profile_id as string, l.founder_identity_id as string);
    // a performer who IS the Founder must be in the map too (it may not have been in the ids queried above)
    for (const a of all ?? []) if (ids.includes(a.profile_id as string)) out.set(a.profile_id as string, a.id as string);
  }
  return out;
}

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error) && (error!.code === "42P01" || error!.code === "PGRST205" || /does not exist|schema cache/i.test(error!.message ?? ""));
}

// Move a file between release states with an optimistic guard: the UPDATE only applies if the file is still
// in the state we validated against, so two simultaneous actions can never both win.
async function setStatus(file: FileRow, from: string, to: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await createAdminClient().from("project_files").update({ release_status: to, ...patch }).eq("id", file.id).eq("release_status", from).select("id");
  if (error) console.error("[crew-support] file release status update failed", error.message);
  return !error && (data?.length ?? 0) === 1;
}

// ---- professional side
export async function submitFileForRelease(params: { fileId: string; actorUserId: string; category: string; title: string; description: string }): Promise<Result> {
  const file = await loadFile(params.fileId);
  if (!file || file.purged_at) return { ok: false, error: "File not found." };
  if (!(await getCrewAssignmentForEngagement(file.engagement_id, params.actorUserId))) return { ok: false, error: "Only the assigned professional can submit this file." };
  return submitLoadedFile(file, params);
}

// The submit step once the caller has been verified as the assigned professional for the file's engagement.
async function submitLoadedFile(file: FileRow, params: { actorUserId: string; category: string; title: string; description: string }): Promise<Result> {
  const v = validateSubmitForRelease({ category: params.category, title: params.title, description: params.description });
  if (!v.ok) return v;
  const t = transition(file.release_status, "submit", "professional");
  if (!t.ok) return t;
  const done = await setStatus(file, file.release_status, t.to, {
    release_category: params.category,
    client_title: params.title.trim(),
    client_description: params.description.trim() || null,
    submitted_for_release_at: new Date().toISOString(),
    submitted_for_release_by: params.actorUserId,
    release_review_note: null,
  });
  if (!done) return { ok: false, error: "That file changed while you were submitting it — refresh and try again." };
  await logActivityAsSystem({ actorUserId: params.actorUserId, action: "project_file.submitted_for_release", entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id, category: params.category, title: params.title.trim() } });
  return { ok: true };
}

export type SubmitBatchResult = { submitted: number; alreadyInReview: number; outcomes: FileOutcome[] };

// Submits every still-private file that was uploaded WITH a category, using the file name as its title. One
// assignment check and one read for the whole batch, then bounded-parallel updates. Idempotent: a file that is
// already submitted/approved/released is never touched (the per-file transition guard refuses it) and is simply
// counted, so a retry after a refresh can never create duplicate records or audit entries.
export async function submitPrivateFilesForRelease(params: { engagementId: string; actorUserId: string }): Promise<Result<SubmitBatchResult>> {
  if (!(await getCrewAssignmentForEngagement(params.engagementId, params.actorUserId))) return { ok: false, error: "Only the assigned professional can submit these files." };
  const { data } = await createAdminClient().from("project_files").select(FILE_COLS).eq("engagement_id", params.engagementId).is("purged_at", null);
  const rows = (data as FileRow[] | null) ?? [];
  const alreadyInReview = rows.filter((f) => ["submitted", "approved", "released"].includes(f.release_status)).length;
  const todo = rows.filter((f) => f.release_status === "private" && f.release_category).slice(0, MAX_BATCH);
  const outcomes = await mapLimit(todo, BATCH_CONCURRENCY, async (f): Promise<FileOutcome> => {
    const title = f.original_filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Photo";
    const r = await submitLoadedFile(f, { actorUserId: params.actorUserId, category: f.release_category as string, title: title.length >= 3 ? title : `${title} photo`, description: "" });
    return r.ok ? { fileId: f.id, label: f.original_filename, ok: true } : { fileId: f.id, label: f.original_filename, ok: false, error: r.error };
  });
  return { ok: true, submitted: outcomes.filter((o) => o.ok).length, alreadyInReview, outcomes };
}

export async function withdrawFileFromReview(params: { fileId: string; actorUserId: string }): Promise<Result> {
  const file = await loadFile(params.fileId);
  if (!file) return { ok: false, error: "File not found." };
  if (!(await getCrewAssignmentForEngagement(file.engagement_id, params.actorUserId))) return { ok: false, error: "Only the assigned professional can do that." };
  const t = transition(file.release_status, "withdraw_from_review", "professional");
  if (!t.ok) return t;
  if (!(await setStatus(file, file.release_status, t.to, {}))) return { ok: false, error: "That file changed — refresh and try again." };
  await logActivityAsSystem({ actorUserId: params.actorUserId, action: "project_file.release_withdrawn", entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id } });
  return { ok: true };
}

// Remove a file the professional uploaded and has not submitted (or that management sent back): a wrong or duplicate
// upload, or a photograph they have decided not to deliver. The stored object is deleted; the record is kept, marked
// purged and withdrawn, so the history of what was uploaded and removed is never lost. Submitted, approved and released
// files cannot be removed here.
export async function removeOwnPrivateFile(params: { fileId: string; actorUserId: string }): Promise<Result> {
  const file = await loadFile(params.fileId);
  if (!file || file.purged_at) return { ok: false, error: "File not found." };
  if (!(await getCrewAssignmentForEngagement(file.engagement_id, params.actorUserId))) return { ok: false, error: "Only the assigned professional can remove this file." };
  if (file.uploaded_by !== params.actorUserId) return { ok: false, error: "You can only remove files you uploaded yourself." };
  if (!canRemoveOwnFile(file.release_status)) return { ok: false, error: "This file has been submitted for review or released, so it can't be removed. Withdraw it from review first if it has not been released." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("project_files").select("storage_bucket, storage_path").eq("id", file.id).maybeSingle();
  if (!row) return { ok: false, error: "File not found." };
  // Claim the record first (so a simultaneous submit cannot succeed), then delete the stored object.
  const claimed = await setStatus(file, file.release_status, "withdrawn", { lifecycle_state: "purged", purged_at: new Date().toISOString(), purge_reason: "removed by the uploader before submission" });
  if (!claimed) return { ok: false, error: "That file changed — refresh and try again." };
  const { error } = await admin.storage.from(row.storage_bucket as string).remove([row.storage_path as string]);
  if (error) console.error("[crew-support] removing a stored file failed (record already marked removed)", error.message);
  await logActivityAsSystem({ actorUserId: params.actorUserId, action: "project_file.removed_before_release", entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id, filename: file.original_filename, previousStatus: file.release_status } });
  return { ok: true };
}

// ---- management side
export async function reviewFileForRelease(params: { fileId: string; user: CurrentUser; action: Extract<ReleaseAction, "approve" | "request_changes" | "reject">; note?: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can review files for release." };
  const file = await loadFile(params.fileId);
  if (!file) return { ok: false, error: "File not found." };
  return reviewLoadedFile(file, params);
}

// Review step once management authority has been verified. Separation of duties is checked here, per file.
async function reviewLoadedFile(file: FileRow, params: { user: CurrentUser; action: Extract<ReleaseAction, "approve" | "request_changes" | "reject">; note?: string }): Promise<Result> {
  const conflict = await conflictFor(file, params.user.id);
  if (conflict) return { ok: false, error: conflict };
  const note = (params.note ?? "").trim();
  if (params.action !== "approve" && note.length < 5) return { ok: false, error: "Say what needs to change (or why it is declined) — the professional will see this." };
  const t = transition(file.release_status, params.action, "management");
  if (!t.ok) return t;
  const done = await setStatus(file, file.release_status, t.to, { release_reviewed_by: params.user.id, release_reviewed_at: new Date().toISOString(), release_review_note: note || null });
  if (!done) return { ok: false, error: "That file changed — refresh and try again." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: `project_file.release_${params.action}`, entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id, note: note || null, title: file.client_title } });
  return { ok: true };
}

// Review several files in one operation. Management authority is checked once; separation of duties, the status
// machine and the deliverable-type rule are checked per file, so each file gets its own honest outcome and audit
// entry and a mix of results is reported as a mix (never one misleading success). Files that are not deliverable-type
// (RAW source, intermediate, working, reference, archive), already released, or purged are reported as skipped.
export async function reviewFilesForRelease(params: { fileIds: string[]; user: CurrentUser; action: Extract<ReleaseAction, "approve" | "request_changes" | "reject">; note?: string }): Promise<Result<{ outcomes: FileOutcome[] }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can review files for release." };
  const ids = [...new Set(params.fileIds)].slice(0, MAX_BATCH);
  if (ids.length === 0) return { ok: false, error: "Select at least one file." };
  const note = (params.note ?? "").trim();
  if (params.action !== "approve" && note.length < 5) return { ok: false, error: "Say what needs to change (or why it is declined) — the professional will see this." };
  const outcomes = await mapLimit(ids, BATCH_CONCURRENCY, async (id): Promise<FileOutcome> => {
    const file = await loadFile(id);
    if (!file) return { fileId: id, label: "Unknown file", ok: false, error: "File not found." };
    const label = file.client_title ?? file.original_filename;
    if (!canReviewFile({ fileKind: file.file_kind, releaseStatus: file.release_status, purged: Boolean(file.purged_at) }, params.action)) {
      return { fileId: id, label, ok: false, error: "Skipped — not eligible for this action (wrong file type, or its status doesn't allow it)." };
    }
    const r = await reviewLoadedFile(file, { user: params.user, action: params.action, note });
    return r.ok ? { fileId: id, label, ok: true } : { fileId: id, label, ok: false, error: r.error };
  });
  return { ok: true, outcomes };
}

type Context = { enquiryId: string; reference: string; isTest: boolean; fullName: string | null; email: string | null; service: string };
async function clientContextFor(engagementId: string): Promise<Context | null> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("entity_type, entity_id").eq("id", engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY) return null;
  const { data: slot } = await admin.from("crew_support_slots").select("request_id").eq("id", eng.entity_id as string).maybeSingle();
  if (!slot) return null;
  const { data: request } = await admin.from("crew_support_requests").select("enquiry_id").eq("id", slot.request_id as string).maybeSingle();
  if (!request) return null;
  const { data: enquiry } = await admin.from("enquiries").select("id, reference_number, is_test, full_name, email, service").eq("id", request.enquiry_id as string).maybeSingle();
  if (!enquiry) return null;
  return { enquiryId: enquiry.id as string, reference: (enquiry.reference_number as string | null) ?? (enquiry.id as string), isTest: Boolean(enquiry.is_test), fullName: (enquiry.full_name as string | null) ?? null, email: (enquiry.email as string | null) ?? null, service: (enquiry.service as string | null) ?? "" };
}

export type ReleaseOutcome = { released: number; alreadyReleased: number; failed: string[]; client: { notified: boolean; reason: string } };

// Release approved files to the client. One call = one release event: ONE client-visible project update and
// at most ONE email, however many files it covers (so releasing 40 thank-you photographs does not send 40
// emails). The email is opt-in per release, and is never sent for a QA/test record.
export async function releaseApprovedFiles(params: { fileIds: string[]; user: CurrentUser; notifyClient: boolean; selfReview?: { declarationId: string } }): Promise<Result<ReleaseOutcome>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can release files to a client." };
  const ids = [...new Set(params.fileIds)];
  if (ids.length === 0) return { ok: false, error: "Choose at least one approved file." };

  const files: FileRow[] = [];
  for (const id of ids) {
    const f = await loadFile(id);
    if (!f) return { ok: false, error: "A selected file no longer exists." };
    files.push(f);
  }
  if (new Set(files.map((f) => f.engagement_id)).size !== 1) return { ok: false, error: "Release files for one assignment at a time." };
  const ctx = await clientContextFor(files[0].engagement_id);
  if (!ctx) return { ok: false, error: "This assignment is not linked to a client project, so its files can't be released." };

  const supabase = await createClient(); // management session; deliverable tables are readable/writable under RLS
  const out: ReleaseOutcome = { released: 0, alreadyReleased: 0, failed: [], client: { notified: false, reason: "No email was requested." } };
  const releasedTitles: string[] = [];
  const releasedIds: string[] = [];
  const categories = new Set<string>();

  for (const file of files) {
    if (file.release_status === "released") { out.alreadyReleased++; continue; }
    // Under a Founder self-review declaration the conflict is validated by the database against that declaration;
    // otherwise the normal separation of duties applies.
    const conflict = params.selfReview ? null : await conflictFor(file, params.user.id);
    if (conflict) { out.failed.push(`${file.client_title ?? file.original_filename}: ${conflict}`); continue; }
    const t = transition(file.release_status, "release", "management");
    if (!t.ok) { out.failed.push(`${file.client_title ?? file.original_filename}: ${t.error}`); continue; }
    const key = file.release_category ? deliverableKeyFor(file.release_category) : null;
    if (!key || !file.client_title) { out.failed.push(`${file.original_filename}: missing category or title`); continue; }
    const { data: category } = await supabase.from("deliverable_categories").select("id").eq("key", key).maybeSingle();
    if (!category) { out.failed.push(`${file.client_title}: the "${key}" category does not exist`); continue; }

    // Claim the file first (guards double release), then publish. If publishing fails, put it back.
    if (params.selfReview) {
      const claimed = await createAdminClient().rpc("fsr_claim_release", { p_declaration: params.selfReview.declarationId, p_file: file.id });
      if (claimed.error) {
        out.failed.push(`${file.client_title}: ${friendlyDbError(claimed.error.message)}`);
        await createAdminClient().rpc("fsr_record_failure", { p_declaration: params.selfReview.declarationId, p_file: file.id, p_error: friendlyDbError(claimed.error.message) });
        continue;
      }
      if (claimed.data === "already_applied") { out.alreadyReleased++; continue; }
    } else if (!(await setStatus(file, "approved", "released", { released_at: new Date().toISOString(), released_by: params.user.id }))) { out.alreadyReleased++; continue; }
    const { data: deliverable, error } = await supabase
      .from("deliverables")
      .insert({ entity_type: "enquiry", entity_id: ctx.enquiryId, category_id: category.id as string, title: file.client_title, description: file.client_description, url: clientFilePath(file.id), published_by: params.user.id, project_file_id: file.id })
      .select("id")
      .single();
    if (error || !deliverable) {
      if (error?.code === "23505") { out.alreadyReleased++; continue; } // already has its deliverable
      console.error("[crew-support] deliverable insert failed", error?.message);
      if (params.selfReview) await createAdminClient().rpc("fsr_revert_release", { p_declaration: params.selfReview.declarationId, p_file: file.id, p_error: "the client-facing deliverable could not be published" });
      else await createAdminClient().from("project_files").update({ release_status: "approved", released_at: null, released_by: null }).eq("id", file.id).eq("release_status", "released");
      out.failed.push(`${file.client_title}: could not be published`);
      continue;
    }
    await createAdminClient().from("project_files").update({ deliverable_id: deliverable.id as string }).eq("id", file.id);
    if (params.selfReview) {
      const confirmed = await createAdminClient().rpc("fsr_confirm_release", { p_declaration: params.selfReview.declarationId, p_file: file.id });
      if (confirmed.error) out.failed.push(`${file.client_title}: released, but the declaration outcome could not be recorded (${friendlyDbError(confirmed.error.message)})`);
    }
    await logActivityAsSystem({ actorUserId: params.user.id, action: "deliverable.published", entityType: "enquiry", entityId: ctx.enquiryId, metadata: { title: file.client_title, fromAssignmentFile: file.id } });
    await logActivityAsSystem({ actorUserId: params.user.id, action: "project_file.released", entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id, deliverableId: deliverable.id, title: file.client_title, category: file.release_category } });
    releasedTitles.push(file.client_title);
    releasedIds.push(file.id);
    categories.add(releaseCategoryLabel(file.release_category));
    out.released++;
  }

  if (out.released === 0) return { ok: true, ...out };

  // One client-visible project update for the whole release.
  const summary = releasedTitles.length === 1 ? `“${releasedTitles[0]}”` : `${releasedTitles.length} files (${[...categories].join(", ")})`;
  const { error: noteError } = await supabase.from("enquiry_notes").insert({ enquiry_id: ctx.enquiryId, author_user_id: params.user.id, audience: "client", note: `New files are ready for you: ${summary}. You can view and download them in the Files section of your project.` });
  if (noteError) console.error("[crew-support] client update note failed", noteError.message);

  if (!params.notifyClient) return { ok: true, ...out };
  if (ctx.isTest) { out.client = { notified: false, reason: "This is a QA/test record, so no email was sent." }; return { ok: true, ...out }; }
  if (!ctx.email || !ctx.fullName) { out.client = { notified: false, reason: "The client has no email address on file." }; return { ok: true, ...out }; }
  const sent = await sendFilesReadyEmail({ entityId: ctx.enquiryId, portalKind: "enquiry", referenceNumber: ctx.reference, fullName: ctx.fullName, email: ctx.email, projectLabel: pathwayLabel(ctx.service), deliverableTitle: summary });
  await logActivityAsSystem({ actorUserId: params.user.id, action: "deliverable.files_ready_email_sent", entityType: "enquiry", entityId: ctx.enquiryId, metadata: { ok: sent?.ok ?? false, files: releasedTitles.length, fileIds: releasedIds } });
  out.client = { notified: Boolean(sent?.ok), reason: sent?.ok ? "The client was emailed." : "The email could not be sent." };
  return { ok: true, ...out };
}

// ---- client notification, separate from release
// Releasing files and emailing the client are two different outcomes that can fail independently. A release that was
// made without the email (or whose email failed) can be followed up here — once. The "files ready" email events are
// logged with the ids of the files they covered; a file that already has a successful email is never emailed again.
async function emailedFileIds(enquiryId: string): Promise<Set<string>> {
  const { data } = await createAdminClient().from("activity_log").select("metadata").eq("action", "deliverable.files_ready_email_sent").eq("entity_id", enquiryId);
  const out = new Set<string>();
  for (const row of data ?? []) {
    const m = row.metadata as { ok?: boolean; fileIds?: string[] } | null;
    if (m?.ok === true && Array.isArray(m.fileIds)) for (const id of m.fileIds) out.add(id);
  }
  return out;
}

export async function listEmailedReleasedFileIds(enquiryId: string): Promise<string[]> {
  return [...(await emailedFileIds(enquiryId))];
}

export async function notifyClientOfReleasedFiles(params: { fileIds: string[]; user: CurrentUser }): Promise<Result<{ emailed: number; alreadyEmailed: number; reason: string }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can email a client about released files." };
  const ids = [...new Set(params.fileIds)];
  if (ids.length === 0) return { ok: false, error: "Choose at least one released file." };
  const files: FileRow[] = [];
  for (const id of ids) {
    const f = await loadFile(id);
    if (!f) return { ok: false, error: "A selected file no longer exists." };
    if (f.release_status !== "released") return { ok: false, error: `“${f.client_title ?? f.original_filename}” has not been released, so the client can't be told about it.` };
    files.push(f);
  }
  if (new Set(files.map((f) => f.engagement_id)).size !== 1) return { ok: false, error: "Choose files from one assignment at a time." };
  const ctx = await clientContextFor(files[0].engagement_id);
  if (!ctx) return { ok: false, error: "This assignment is not linked to a client project." };
  if (ctx.isTest) return { ok: false, error: "This is a QA/test record, so no email is ever sent." };
  if (!ctx.email || !ctx.fullName) return { ok: false, error: "The client has no email address on file." };

  const already = await emailedFileIds(ctx.enquiryId);
  const pending = files.filter((f) => !already.has(f.id));
  if (pending.length === 0) return { ok: false, error: "The client has already been emailed about these files." };

  const titles = pending.map((f) => f.client_title ?? f.original_filename);
  const categories = [...new Set(pending.map((f) => releaseCategoryLabel(f.release_category)))];
  const summary = titles.length === 1 ? `“${titles[0]}”` : `${titles.length} files (${categories.join(", ")})`;
  const sent = await sendFilesReadyEmail({ entityId: ctx.enquiryId, portalKind: "enquiry", referenceNumber: ctx.reference, fullName: ctx.fullName, email: ctx.email, projectLabel: pathwayLabel(ctx.service), deliverableTitle: summary });
  const ok = Boolean(sent?.ok);
  await logActivityAsSystem({ actorUserId: params.user.id, action: "deliverable.files_ready_email_sent", entityType: "enquiry", entityId: ctx.enquiryId, metadata: { ok, files: pending.length, fileIds: pending.map((f) => f.id), retry: true } });
  if (!ok) return { ok: false, error: "The email could not be sent. The files remain released; you can try again." };
  return { ok: true, emailed: pending.length, alreadyEmailed: files.length - pending.length, reason: "The client was emailed once about these files." };
}

// Which Crew Support request an engagement's files belong to (for links and cache refresh); null for any other kind
// of engagement.
export async function crewRequestForEngagement(engagementId: string): Promise<{ requestId: string; reference: string } | null> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("entity_type, entity_id").eq("id", engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY) return null;
  const { data: slot } = await admin.from("crew_support_slots").select("request_id").eq("id", eng.entity_id as string).maybeSingle();
  if (!slot) return null;
  const { data: request } = await admin.from("crew_support_requests").select("id, reference_number").eq("id", slot.request_id as string).maybeSingle();
  return request ? { requestId: request.id as string, reference: request.reference_number as string } : null;
}
