import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { sendFilesReadyEmail } from "@/lib/enquiry/lifecycleEmails";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { getCrewAssignmentForEngagement } from "./crewOffers";
import { isManagementUser } from "./management";
import { clientFilePath, deliverableKeyFor, releaseCategoryLabel, reviewerConflict, transition, validateSubmitForRelease, type ReleaseAction } from "./fileRelease";

// The controlled path by which an assignment's private file reaches the client:
//   professional uploads (private) -> submits for review -> management approves -> management releases.
// "Released" means a deliverables row (the client's existing Files & Deliverables list) now points at an
// authorised, audited download route for the file. Nothing here completes the engagement or project, marks
// a payable paid, or triggers a payout.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOT_ENTITY = "crew_support_slot";

type FileRow = { id: string; engagement_id: string; original_filename: string; release_status: string; release_category: string | null; client_title: string | null; client_description: string | null; purged_at: string | null; uploaded_by: string | null; submitted_for_release_by: string | null };
const FILE_COLS = "id, engagement_id, original_filename, release_status, release_category, client_title, client_description, purged_at, uploaded_by, submitted_for_release_by";

async function loadFile(fileId: string): Promise<FileRow | null> {
  const { data } = await createAdminClient().from("project_files").select(FILE_COLS).eq("id", fileId).maybeSingle();
  return (data as FileRow | null) ?? null;
}

// Separation of duties for a file and a would-be reviewer/releaser; null means no conflict.
async function conflictFor(file: FileRow, reviewerId: string): Promise<string | null> {
  const { data: eng } = await createAdminClient().from("engagements").select("payee_profile_id").eq("id", file.engagement_id).maybeSingle();
  return reviewerConflict({ reviewerId, uploadedBy: file.uploaded_by, submittedBy: file.submitted_for_release_by, assigneeId: (eng?.payee_profile_id as string | null) ?? null });
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

// ---- management side
export async function reviewFileForRelease(params: { fileId: string; user: CurrentUser; action: Extract<ReleaseAction, "approve" | "request_changes" | "reject">; note?: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can review files for release." };
  const file = await loadFile(params.fileId);
  if (!file) return { ok: false, error: "File not found." };
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
export async function releaseApprovedFiles(params: { fileIds: string[]; user: CurrentUser; notifyClient: boolean }): Promise<Result<ReleaseOutcome>> {
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
  const categories = new Set<string>();

  for (const file of files) {
    if (file.release_status === "released") { out.alreadyReleased++; continue; }
    const conflict = await conflictFor(file, params.user.id);
    if (conflict) { out.failed.push(`${file.client_title ?? file.original_filename}: ${conflict}`); continue; }
    const t = transition(file.release_status, "release", "management");
    if (!t.ok) { out.failed.push(`${file.client_title ?? file.original_filename}: ${t.error}`); continue; }
    const key = file.release_category ? deliverableKeyFor(file.release_category) : null;
    if (!key || !file.client_title) { out.failed.push(`${file.original_filename}: missing category or title`); continue; }
    const { data: category } = await supabase.from("deliverable_categories").select("id").eq("key", key).maybeSingle();
    if (!category) { out.failed.push(`${file.client_title}: the "${key}" category does not exist`); continue; }

    // Claim the file first (guards double release), then publish. If publishing fails, put it back.
    if (!(await setStatus(file, "approved", "released", { released_at: new Date().toISOString(), released_by: params.user.id }))) { out.alreadyReleased++; continue; }
    const { data: deliverable, error } = await supabase
      .from("deliverables")
      .insert({ entity_type: "enquiry", entity_id: ctx.enquiryId, category_id: category.id as string, title: file.client_title, description: file.client_description, url: clientFilePath(file.id), published_by: params.user.id, project_file_id: file.id })
      .select("id")
      .single();
    if (error || !deliverable) {
      if (error?.code === "23505") { out.alreadyReleased++; continue; } // already has its deliverable
      console.error("[crew-support] deliverable insert failed", error?.message);
      await createAdminClient().from("project_files").update({ release_status: "approved", released_at: null, released_by: null }).eq("id", file.id).eq("release_status", "released");
      out.failed.push(`${file.client_title}: could not be published`);
      continue;
    }
    await createAdminClient().from("project_files").update({ deliverable_id: deliverable.id as string }).eq("id", file.id);
    await logActivityAsSystem({ actorUserId: params.user.id, action: "deliverable.published", entityType: "enquiry", entityId: ctx.enquiryId, metadata: { title: file.client_title, fromAssignmentFile: file.id } });
    await logActivityAsSystem({ actorUserId: params.user.id, action: "project_file.released", entityType: "engagement", entityId: file.engagement_id, metadata: { fileId: file.id, deliverableId: deliverable.id, title: file.client_title, category: file.release_category } });
    releasedTitles.push(file.client_title);
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
  await logActivityAsSystem({ actorUserId: params.user.id, action: "deliverable.files_ready_email_sent", entityType: "enquiry", entityId: ctx.enquiryId, metadata: { ok: sent?.ok ?? false, files: releasedTitles.length } });
  out.client = { notified: Boolean(sent?.ok), reason: sent?.ok ? "The client was emailed." : "The email could not be sent." };
  return { ok: true, ...out };
}
