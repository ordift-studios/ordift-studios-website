import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import type { FileOutcome } from "./fileReview";
import { friendlyDbError, isMissingRelation, releaseApprovedFiles, type ReleaseOutcome } from "./fileReleaseFlow";
import {
  FSR_CONFLICT_ACKNOWLEDGEMENT,
  FSR_EXCEPTION_TTL_HOURS,
  FSR_POLICY_CODE,
  FSR_RELEASE_CONFIRMATION,
  FSR_REVIEW_CONFIRMATION,
  buildSelectionSnapshot,
  checkReleaseSelection,
  checkReviewSelection,
  declarationOutcome,
  resolveFounderContext,
  validateJustification,
  validateTypedCount,
  type DeclarationOutcome,
  type ExceptionFile,
  type FounderContext,
  type SelfReviewDecision,
} from "./founderSelfReviewRules";

// ORDIFT-POL-FSR-001 — server side. Every check here is repeated by the database (migration 0169): this layer refuses
// early with a clear message; the database refuses even if this layer were wrong or bypassed. The browser is never
// trusted for file ids' properties, versions, sizes, paths, or for having "viewed" anything: all of that is read from, or
// recorded by, the server.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SIGNED_URL_TTL_SECONDS = 600;

type FileRowFull = { id: string; engagement_id: string; file_kind: string; release_status: string; purged_at: string | null; version: number; size_bytes: number | null; storage_bucket: string; storage_path: string; original_filename: string; release_category: string | null; client_title: string | null; mime_type: string | null; release_review_note: string | null };
const FILE_COLS = "id, engagement_id, file_kind, release_status, purged_at, version, size_bytes, storage_bucket, storage_path, original_filename, release_category, client_title, mime_type, release_review_note";

async function loadEngagementFiles(engagementId: string): Promise<FileRowFull[]> {
  const { data } = await createAdminClient().from("project_files").select(FILE_COLS).eq("engagement_id", engagementId);
  return (data as FileRowFull[] | null) ?? [];
}
const toExceptionFile = (r: FileRowFull): ExceptionFile => ({ id: r.id, fileKind: r.file_kind, releaseStatus: r.release_status, purged: Boolean(r.purged_at), engagementId: r.engagement_id, version: r.version, sizeBytes: r.size_bytes, storagePath: r.storage_path });

// ------------------------------------------------------------------ context
export async function getFounderContext(user: { id: string }, engagementId: string): Promise<FounderContext> {
  const admin = createAdminClient();
  const [founderRes, linkedRes, engRes] = await Promise.all([
    admin.from("founder_identities").select("id, profile_id").eq("status", "active").limit(1).maybeSingle(),
    admin.from("founder_common_control_accounts").select("founder_identity_id").eq("profile_id", user.id).is("revoked_at", null).limit(1).maybeSingle(),
    admin.from("engagements").select("payee_profile_id, entity_type").eq("id", engagementId).maybeSingle(),
  ]);
  if (founderRes.error || linkedRes.error) {
    // Not installed yet (before migration 0169): the exception simply does not exist. Any other error: treat as unavailable.
    return isMissingRelation(founderRes.error) || isMissingRelation(linkedRes.error) ? { state: "not_applicable" } : { state: "unavailable", reason: "The exception could not be verified right now." };
  }
  const founder = founderRes.data as { id: string; profile_id: string } | null;
  const payee = (engRes.data?.payee_profile_id as string | null) ?? null;
  const entityIsCrew = engRes.data?.entity_type === "crew_support_slot";
  if (!entityIsCrew) return { state: "not_applicable" };
  const viewerIsLinked = Boolean(linkedRes.data);
  if (viewerIsLinked) return resolveFounderContext({ viewerId: user.id, engagementPayeeId: payee, founderProfileId: founder?.profile_id ?? null, holderActive: false, viewerIsLinkedLogin: true, linkedFounderIsPerformer: Boolean(founder && payee === founder.profile_id), open: null });
  if (!founder || founder.profile_id !== user.id || payee !== user.id) return { state: "not_applicable" };

  const nowIso = new Date().toISOString();
  const [holderRes, openRes] = await Promise.all([
    admin.from("self_review_exception_holders").select("id, effective_at, expires_at").eq("founder_identity_id", founder.id).is("revoked_at", null).limit(1).maybeSingle(),
    admin.from("self_review_exceptions").select("id, opened_at, expires_at, justification, holder_id").eq("engagement_id", engagementId).eq("status", "open").gt("expires_at", nowIso).limit(1).maybeSingle(),
  ]);
  if (holderRes.error || openRes.error) return { state: "unavailable", reason: "The exception could not be verified right now." };
  const holder = holderRes.data as { id: string; effective_at: string; expires_at: string | null } | null;
  const holderActive = Boolean(holder && new Date(holder.effective_at).getTime() <= Date.now() && (!holder.expires_at || new Date(holder.expires_at).getTime() > Date.now()));
  const openRow = openRes.data as { id: string; opened_at: string; expires_at: string; justification: string; holder_id: string } | null;
  // An exception made under an earlier, revoked or ended authorization is inert: treat it as not open (the database closes it
  // automatically when the Founder opens a new one — found by the PostgreSQL rehearsal).
  const open = openRow && holder && openRow.holder_id === holder.id ? openRow : null;
  let viewed: string[] = [];
  if (open && holderActive) {
    const [views, files] = await Promise.all([
      admin.from("self_review_file_views").select("file_id, file_version, file_storage_path").eq("exception_id", open.id),
      loadEngagementFiles(engagementId),
    ]);
    const current = new Map(files.map((f) => [f.id, f]));
    viewed = [...new Set((views.data ?? []).filter((v) => { const f = current.get(v.file_id as string); return f && f.version === v.file_version && f.storage_path === v.file_storage_path; }).map((v) => v.file_id as string))];
  }
  const ctx = resolveFounderContext({
    viewerId: user.id, engagementPayeeId: payee, founderProfileId: founder.profile_id, holderActive, viewerIsLinkedLogin: false, linkedFounderIsPerformer: false,
    open: open && holderActive ? { id: open.id, openedAt: open.opened_at, expiresAt: open.expires_at, justification: open.justification, viewedFileIds: viewed } : null,
  });
  return ctx.state === "available" ? { ...ctx, founderIdentityId: founder.id, holderId: holder!.id } : ctx;
}

// Which files were reviewed / released under the exception — used only for display and for the separate email step.
export async function listSelfReviewFileState(engagementId: string): Promise<{ reviewedIds: string[]; releasedIds: string[] }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("project_files").select("id, release_review_declaration_id, release_declaration_id").eq("engagement_id", engagementId);
  if (error) return { reviewedIds: [], releasedIds: [] };
  const rows = data ?? [];
  return {
    reviewedIds: rows.filter((r) => r.release_review_declaration_id).map((r) => r.id as string),
    releasedIds: rows.filter((r) => r.release_declaration_id).map((r) => r.id as string),
  };
}

async function requireOpenContext(user: CurrentUser, engagementId: string, exceptionId: string): Promise<Result<{ ctx: Extract<FounderContext, { state: "open" }> }>> {
  const ctx = await getFounderContext(user, engagementId);
  if (ctx.state === "linked_login") return { ok: false, error: ctx.message };
  if (ctx.state !== "open") return { ok: false, error: "There is no open Founder self-review exception for this engagement." };
  if (ctx.exception.id !== exceptionId) return { ok: false, error: "That exception is not the open one for this engagement." };
  return { ok: true, ctx };
}

async function engagementOfException(exceptionId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("self_review_exceptions").select("engagement_id").eq("id", exceptionId).maybeSingle();
  return (data?.engagement_id as string | null) ?? null;
}

// ------------------------------------------------------------------ steps A + B: open the exception
export async function openFounderException(params: { user: CurrentUser; engagementId: string; justification: string; acknowledged: boolean }): Promise<Result<{ exceptionId: string }>> {
  const ctx = await getFounderContext(params.user, params.engagementId);
  if (ctx.state === "linked_login") return { ok: false, error: ctx.message };
  if (ctx.state === "unavailable") return { ok: false, error: ctx.reason };
  if (ctx.state === "open") return { ok: false, error: "An exception is already open for this engagement." };
  if (ctx.state !== "available") return { ok: false, error: "The Founder self-review exception does not apply to you on this engagement." };
  const v = validateJustification(params.justification);
  if (!v.ok) return v;
  if (!params.acknowledged) return { ok: false, error: "You must acknowledge the conflict of interest to continue." };
  const now = new Date();
  const { data, error } = await createAdminClient()
    .from("self_review_exceptions")
    .insert({
      engagement_id: params.engagementId, holder_id: ctx.holderId, founder_profile_id: params.user.id, justification: params.justification.trim(),
      conflict_acknowledgement: FSR_CONFLICT_ACKNOWLEDGEMENT, conflict_acknowledged_at: now.toISOString(), expires_at: new Date(now.getTime() + FSR_EXCEPTION_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "An exception is already open for this engagement." : friendlyDbError(error?.message ?? "") };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "founder_self_review.exception_opened", entityType: "engagement", entityId: params.engagementId, metadata: { exceptionId: data.id, policy: FSR_POLICY_CODE } });
  return { ok: true, exceptionId: data.id as string };
}

export async function closeFounderException(params: { user: CurrentUser; exceptionId: string; reason: string }): Promise<Result> {
  const engagementId = await engagementOfException(params.exceptionId);
  if (!engagementId) return { ok: false, error: "Exception not found." };
  const guard = await requireOpenContext(params.user, engagementId, params.exceptionId);
  if (!guard.ok) return guard;
  if (params.reason.trim().length < 5) return { ok: false, error: "Say why you are closing the exception." };
  const { error } = await createAdminClient().from("self_review_exceptions").update({ status: "closed", closed_at: new Date().toISOString(), closed_reason: params.reason.trim() }).eq("id", params.exceptionId).eq("status", "open");
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "founder_self_review.exception_closed", entityType: "engagement", entityId: engagementId, metadata: { exceptionId: params.exceptionId } });
  return { ok: true };
}

// ------------------------------------------------------------------ step C: open each image in the review viewer
// The evidence is written only after the server has issued the viewer link, and the link is returned only if the evidence
// was written. The database fills the recorded version, size and path from the live file row, so the browser cannot
// choose them. This proves the image was opened — not that it was meaningfully inspected — and it is never the only control.
export async function issueViewerUrl(params: { user: CurrentUser; exceptionId: string; fileId: string }): Promise<Result<{ url: string }>> {
  const engagementId = await engagementOfException(params.exceptionId);
  if (!engagementId) return { ok: false, error: "Exception not found." };
  const guard = await requireOpenContext(params.user, engagementId, params.exceptionId);
  if (!guard.ok) return guard;
  const files = await loadEngagementFiles(engagementId);
  const file = files.find((f) => f.id === params.fileId);
  if (!file || file.purged_at) return { ok: false, error: "File not found." };
  const admin = createAdminClient();
  const signed = await admin.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) return { ok: false, error: "Could not authorize the preview." };
  const { error } = await admin.from("self_review_file_views").insert({ exception_id: params.exceptionId, file_id: file.id, viewer_profile_id: params.user.id });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true, url: signed.data.signedUrl };
}

// ------------------------------------------------------------------ steps D–F: declare and apply the decisions
async function declare(params: {
  exceptionId: string; user: CurrentUser; kind: "review" | "release"; ids: string[]; files: FileRowFull[]; decisions: Record<string, { decision: string; note: string | null }>; confirmationText: string; typedCount: number;
}): Promise<Result<{ declarationId: string; selectionHash: string }>> {
  const admin = createAdminClient();
  const snapshot = buildSelectionSnapshot(
    params.files.map((f) => ({ ...toExceptionFile(f), originalFilename: f.original_filename, releaseCategory: f.release_category, clientTitle: f.client_title, mimeType: f.mime_type })),
    params.ids
  );
  const nowIso = new Date().toISOString();
  const { data: decl, error } = await admin
    .from("self_review_declarations")
    .insert({
      exception_id: params.exceptionId, kind: params.kind, actor_profile_id: params.user.id, file_ids: params.ids, selection_snapshot: snapshot,
      confirmation_text: params.confirmationText, typed_file_count: params.typedCount,
      ...(params.kind === "review" ? { review_confirmed_at: nowIso } : { release_set_confirmed_at: nowIso }),
    })
    .select("id, selection_hash")
    .single();
  if (error || !decl) return { ok: false, error: friendlyDbError(error?.message ?? "") };
  const rows = params.ids.map((id) => ({ declaration_id: decl.id, file_id: id, decision: params.decisions[id].decision, note: params.decisions[id].note }));
  const { error: rowsError } = await admin.from("self_review_declaration_files").insert(rows);
  if (rowsError) return { ok: false, error: `The declaration could not be completed and nothing was applied. ${friendlyDbError(rowsError.message)}` };
  return { ok: true, declarationId: decl.id as string, selectionHash: decl.selection_hash as string };
}

export type SelfReviewRunResult = { outcomes: FileOutcome[]; declaration: DeclarationOutcome; declarationId: string | null };

export async function declareAndApplyReview(params: {
  user: CurrentUser; exceptionId: string; decisions: Record<string, SelfReviewDecision>; note: string; reviewConfirmed: boolean; typedCount: unknown;
}): Promise<Result<SelfReviewRunResult>> {
  const engagementId = await engagementOfException(params.exceptionId);
  if (!engagementId) return { ok: false, error: "Exception not found." };
  const guard = await requireOpenContext(params.user, engagementId, params.exceptionId);
  if (!guard.ok) return guard;
  const ids = Object.keys(params.decisions);
  if (!params.reviewConfirmed) return { ok: false, error: "Confirm that you have reviewed the selected images." };
  if (!validateTypedCount(params.typedCount, ids.length)) return { ok: false, error: `Type the number of images you are deciding on (${ids.length}) to confirm.` };
  const files = await loadEngagementFiles(engagementId);
  // The server's own record of what was opened — never the browser's claim.
  const check = checkReviewSelection({ decisions: params.decisions, files: files.map(toExceptionFile), engagementId, viewedFileIds: guard.ctx.viewedFileIds, note: params.note });
  if (!check.ok) return { ok: false, error: check.errors.slice(0, 4).join(" ") };
  const decl = await declare({
    exceptionId: params.exceptionId, user: params.user, kind: "review", ids, files, typedCount: ids.length, confirmationText: FSR_REVIEW_CONFIRMATION,
    decisions: Object.fromEntries(ids.map((id) => [id, { decision: params.decisions[id], note: params.decisions[id] === "approve" ? null : params.note.trim() }])),
  });
  if (!decl.ok) return decl;

  const admin = createAdminClient();
  const byId = new Map(files.map((f) => [f.id, f]));
  const outcomes: FileOutcome[] = [];
  for (const id of ids) {
    const f = byId.get(id)!;
    const label = f.client_title ?? f.original_filename;
    const r = await admin.rpc("fsr_apply_review", { p_declaration: decl.declarationId, p_file: id });
    if (r.error) {
      const msg = friendlyDbError(r.error.message);
      await admin.rpc("fsr_record_failure", { p_declaration: decl.declarationId, p_file: id, p_error: msg });
      outcomes.push({ fileId: id, label, ok: false, error: msg });
      continue;
    }
    await logActivityAsSystem({
      actorUserId: params.user.id, action: `project_file.release_${params.decisions[id]}`, entityType: "engagement", entityId: engagementId,
      metadata: { fileId: id, title: f.client_title, selfReview: true, policy: FSR_POLICY_CODE, exceptionId: params.exceptionId, declarationId: decl.declarationId },
    });
    outcomes.push({ fileId: id, label, ok: true });
  }
  return { ok: true, outcomes, declaration: declarationOutcome("review", outcomes), declarationId: decl.declarationId };
}

// ------------------------------------------------------------------ steps G–H: a separate declaration for the release set
export async function declareAndRelease(params: {
  user: CurrentUser; exceptionId: string; fileIds: string[]; releaseSetConfirmed: boolean; typedCount: unknown;
}): Promise<Result<SelfReviewRunResult & { release: ReleaseOutcome | null }>> {
  const engagementId = await engagementOfException(params.exceptionId);
  if (!engagementId) return { ok: false, error: "Exception not found." };
  const guard = await requireOpenContext(params.user, engagementId, params.exceptionId);
  if (!guard.ok) return guard;
  const ids = [...new Set(params.fileIds)];
  if (!params.releaseSetConfirmed) return { ok: false, error: "Confirm the client-visible release set." };
  if (!validateTypedCount(params.typedCount, ids.length)) return { ok: false, error: `Type the number of images being released (${ids.length}) to confirm.` };
  const files = await loadEngagementFiles(engagementId);
  const check = checkReleaseSelection({ fileIds: ids, files: files.map(toExceptionFile), engagementId });
  if (!check.ok) return { ok: false, error: check.errors.slice(0, 4).join(" ") };
  const decl = await declare({
    exceptionId: params.exceptionId, user: params.user, kind: "release", ids, files, typedCount: ids.length, confirmationText: FSR_RELEASE_CONFIRMATION,
    decisions: Object.fromEntries(ids.map((id) => [id, { decision: "release", note: null }])),
  });
  if (!decl.ok) return decl;

  // The same release engine as a normal release — one client update, no email (notifyClient is always false here; the
  // client email is a separate, opt-in step with its own confirmation).
  const released = await releaseApprovedFiles({ fileIds: ids, user: params.user, notifyClient: false, selfReview: { declarationId: decl.declarationId } });
  if (!released.ok) {
    const admin = createAdminClient();
    for (const id of ids) await admin.rpc("fsr_record_failure", { p_declaration: decl.declarationId, p_file: id, p_error: released.error });
    return { ok: true, outcomes: ids.map((id) => ({ fileId: id, label: id, ok: false, error: released.error })), declaration: declarationOutcome("release", ids.map((id) => ({ fileId: id, label: id, ok: false, error: released.error }))), declarationId: decl.declarationId, release: null };
  }
  const { data: states } = await createAdminClient().from("self_review_declaration_files").select("file_id, outcome, outcome_error").eq("declaration_id", decl.declarationId);
  const byFile = new Map((states ?? []).map((s) => [s.file_id as string, s]));
  const outcomes: FileOutcome[] = ids.map((id) => {
    const f = files.find((x) => x.id === id)!;
    const s = byFile.get(id);
    return { fileId: id, label: f.client_title ?? f.original_filename, ok: s?.outcome === "applied", error: s?.outcome === "applied" ? undefined : ((s?.outcome_error as string | null) ?? "not released") };
  });
  for (const o of outcomes.filter((x) => x.ok)) {
    await logActivityAsSystem({ actorUserId: params.user.id, action: "project_file.self_review_released", entityType: "engagement", entityId: engagementId, metadata: { fileId: o.fileId, selfReview: true, policy: FSR_POLICY_CODE, exceptionId: params.exceptionId, declarationId: decl.declarationId } });
  }
  return { ok: true, outcomes, declaration: declarationOutcome("release", outcomes), declarationId: decl.declarationId, release: released };
}

