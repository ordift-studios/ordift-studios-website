import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";

// Workshop Learning Infrastructure V1 (2026-09-19) — against
// public.workshop_briefs / workshop_submissions /
// workshop_submission_feedback (migration 0138). Ordift terminology
// throughout (Creative Brief/Exercise, never "homework"); no
// grade/GPA/score anywhere. Submissions are always tied to the
// participant's own real workshop_registrations row, never a separate
// learner identity.

const MATERIALS_BUCKET = "workshop-materials";
const SUBMISSION_SIGNED_URL_TTL_SECONDS = 300;

async function isEngagedOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_instructor_engagements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("workshop_id", workshopId);
  return (count ?? 0) > 0;
}

// The caller's own, non-cancelled registration for this workshop — the
// one and only identity a submission is ever tied to.
async function getOwnRegistrationId(profileId: string, workshopId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_registrations")
    .select("id")
    .eq("workshop_id", workshopId)
    .eq("user_id", profileId)
    .neq("registration_status", "Cancelled")
    .maybeSingle();
  return data?.id ?? null;
}

// ============================================================
// Briefs
// ============================================================
export type WorkshopBrief = {
  id: string;
  workshopId: string;
  sessionId: string | null;
  title: string;
  instructions: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
};

const BRIEF_SELECT = "id, workshop_id, session_id, title, instructions, due_at, created_by, created_at";

function mapBrief(r: { id: string; workshop_id: string; session_id: string | null; title: string; instructions: string; due_at: string | null; created_by: string; created_at: string }): WorkshopBrief {
  return { id: r.id, workshopId: r.workshop_id, sessionId: r.session_id, title: r.title, instructions: r.instructions, dueAt: r.due_at, createdBy: r.created_by, createdAt: r.created_at };
}

export async function listBriefsForWorkshop(workshopId: string): Promise<WorkshopBrief[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_briefs").select(BRIEF_SELECT).eq("workshop_id", workshopId).order("created_at", { ascending: false });
  if (error) {
    console.error("[workshops] failed to load briefs", error.message);
    return [];
  }
  return (data ?? []).map(mapBrief);
}

export type CreateBriefParams = {
  workshopId: string;
  sessionId?: string | null;
  title: string;
  instructions: string;
  dueAt?: string | null;
  actorUserId: string;
};

export async function createBrief(params: CreateBriefParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const staffAuth = await authorizeWithSuperAdminOverride(params.actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  const authorized = staffAuth.ok || (await isEngagedOnWorkshop(params.actorUserId, params.workshopId));
  if (!authorized) return { ok: false, error: "Not authorized to create briefs for this workshop." };
  if (!params.title.trim() || !params.instructions.trim()) return { ok: false, error: "Title and instructions are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_briefs")
    .insert({
      workshop_id: params.workshopId,
      session_id: params.sessionId ?? null,
      title: params.title.trim(),
      instructions: params.instructions.trim(),
      due_at: params.dueAt ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Failed to create the brief." };

  await logActivity({ actorUserId: params.actorUserId, action: "workshop.brief.created", entityType: "workshop_brief", entityId: data.id, metadata: { workshopId: params.workshopId } });
  return { ok: true, id: data.id };
}

// ============================================================
// Submissions
// ============================================================
export type WorkshopSubmission = {
  id: string;
  briefId: string;
  registrationId: string;
  note: string | null;
  storagePaths: string[];
  revisionOf: string | null;
  submittedAt: string;
};

const SUBMISSION_SELECT = "id, brief_id, registration_id, note, storage_paths, revision_of, submitted_at";

function mapSubmission(r: { id: string; brief_id: string; registration_id: string; note: string | null; storage_paths: string[]; revision_of: string | null; submitted_at: string }): WorkshopSubmission {
  return { id: r.id, briefId: r.brief_id, registrationId: r.registration_id, note: r.note, storagePaths: r.storage_paths ?? [], revisionOf: r.revision_of, submittedAt: r.submitted_at };
}

// Participant — their own submission(s) against a brief only. Real
// ownership check: the registration behind any returned row must
// belong to this profile.
export async function listOwnSubmissionsForBrief(briefId: string, actorProfileId: string, workshopId: string): Promise<WorkshopSubmission[]> {
  const registrationId = await getOwnRegistrationId(actorProfileId, workshopId);
  if (!registrationId) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_submissions").select(SUBMISSION_SELECT).eq("brief_id", briefId).eq("registration_id", registrationId).order("submitted_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapSubmission);
}

// Instructor — every submission against a brief on a workshop they
// are genuinely engaged on, joined to the registrant's display name
// only (never email/phone/payment, matching the same field-narrowing
// precedent as listRegistrationsForInstructorWorkshop()).
export type InstructorVisibleSubmission = WorkshopSubmission & { participantName: string };

async function listSubmissionsForBriefRaw(briefId: string): Promise<InstructorVisibleSubmission[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_submissions").select(SUBMISSION_SELECT).eq("brief_id", briefId).order("submitted_at", { ascending: false });
  if (error || !data) return [];

  const registrationIds = [...new Set(data.map((r) => r.registration_id))];
  const { data: registrations } = await admin.from("workshop_registrations").select("id, full_name").in("id", registrationIds);
  const nameByRegistrationId = new Map((registrations ?? []).map((r) => [r.id, r.full_name] as const));

  return data.map((r) => ({ ...mapSubmission(r), participantName: nameByRegistrationId.get(r.registration_id) ?? "Unknown participant" }));
}

export async function listSubmissionsForBriefAsInstructor(briefId: string, workshopId: string, actorProfileId: string): Promise<InstructorVisibleSubmission[]> {
  if (!(await isEngagedOnWorkshop(actorProfileId, workshopId))) return [];
  return listSubmissionsForBriefRaw(briefId);
}

// Admin oversight — gated on operations.workshop.administer (or Super
// Admin) rather than engagement, matching every other admin-only read
// on this dashboard.
export async function listSubmissionsForBriefAsAdmin(briefId: string, actorProfileId: string): Promise<InstructorVisibleSubmission[]> {
  const auth = await authorizeWithSuperAdminOverride(actorProfileId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return [];
  return listSubmissionsForBriefRaw(briefId);
}

export async function createSubmissionUploadUrl(
  briefId: string,
  filename: string,
  actorUserId: string
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: brief } = await admin.from("workshop_briefs").select("workshop_id").eq("id", briefId).maybeSingle();
  if (!brief) return { ok: false, error: "Brief not found." };
  const registrationId = await getOwnRegistrationId(actorUserId, brief.workshop_id);
  if (!registrationId) return { ok: false, error: "You are not registered for this workshop." };

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `submissions/${registrationId}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from(MATERIALS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Failed to prepare the upload." };
  return { ok: true, path, token: data.token };
}

export type SubmitWorkParams = {
  briefId: string;
  note?: string | null;
  storagePaths?: string[];
  revisionOf?: string | null;
  actorUserId: string;
};

export async function submitWork(params: SubmitWorkParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: brief } = await admin.from("workshop_briefs").select("workshop_id").eq("id", params.briefId).maybeSingle();
  if (!brief) return { ok: false, error: "Brief not found." };
  const registrationId = await getOwnRegistrationId(params.actorUserId, brief.workshop_id);
  if (!registrationId) return { ok: false, error: "You are not registered for this workshop." };
  if (!params.note?.trim() && (!params.storagePaths || params.storagePaths.length === 0)) {
    return { ok: false, error: "Add a note or attach at least one file." };
  }

  const { data, error } = await admin
    .from("workshop_submissions")
    .insert({
      brief_id: params.briefId,
      registration_id: registrationId,
      note: params.note?.trim() || null,
      storage_paths: params.storagePaths ?? [],
      revision_of: params.revisionOf ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Failed to submit your work." };

  await logActivity({ actorUserId: params.actorUserId, action: "workshop.submission.created", entityType: "workshop_submission", entityId: data.id, metadata: { briefId: params.briefId } });
  return { ok: true, id: data.id };
}

export async function getSubmissionFileUrl(submissionId: string, storagePath: string, actorProfileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: submission } = await admin.from("workshop_submissions").select("registration_id, brief_id, storage_paths").eq("id", submissionId).maybeSingle();
  if (!submission || !submission.storage_paths.includes(storagePath)) return { ok: false, error: "File not found on this submission." };

  const { data: registration } = await admin.from("workshop_registrations").select("user_id, workshop_id").eq("id", submission.registration_id).maybeSingle();
  if (!registration) return { ok: false, error: "Submission not found." };

  const staffAuth = await authorizeWithSuperAdminOverride(actorProfileId, OPERATIONS_CAPABILITIES.workshopAdminister);
  const authorized = staffAuth.ok || registration.user_id === actorProfileId || (await isEngagedOnWorkshop(actorProfileId, registration.workshop_id));
  if (!authorized) return { ok: false, error: "Not authorized to access this file." };

  const { data, error } = await admin.storage.from(MATERIALS_BUCKET).createSignedUrl(storagePath, SUBMISSION_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return { ok: false, error: "Failed to generate a download link." };
  return { ok: true, url: data.signedUrl };
}

// ============================================================
// Feedback — append-only critique history
// ============================================================
export type SubmissionFeedback = {
  id: string;
  submissionId: string;
  instructorProfileId: string;
  feedbackText: string;
  status: string;
  attachmentUrl: string | null;
  createdAt: string;
};

const FEEDBACK_SELECT = "id, submission_id, instructor_profile_id, feedback_text, status, attachment_url, created_at";

function mapFeedback(r: { id: string; submission_id: string; instructor_profile_id: string; feedback_text: string; status: string; attachment_url: string | null; created_at: string }): SubmissionFeedback {
  return { id: r.id, submissionId: r.submission_id, instructorProfileId: r.instructor_profile_id, feedbackText: r.feedback_text, status: r.status, attachmentUrl: r.attachment_url, createdAt: r.created_at };
}

// Participant — feedback on THEIR OWN submission only. Never another
// participant's private critique (Section K) — the registration
// behind the submission must belong to this profile.
export async function listFeedbackForOwnSubmission(submissionId: string, actorProfileId: string): Promise<SubmissionFeedback[]> {
  const admin = createAdminClient();
  const { data: submission } = await admin.from("workshop_submissions").select("registration_id").eq("id", submissionId).maybeSingle();
  if (!submission) return [];
  const { data: registration } = await admin.from("workshop_registrations").select("user_id").eq("id", submission.registration_id).maybeSingle();
  if (!registration || registration.user_id !== actorProfileId) return [];

  const { data, error } = await admin.from("workshop_submission_feedback").select(FEEDBACK_SELECT).eq("submission_id", submissionId).order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(mapFeedback);
}

async function listFeedbackRaw(submissionId: string): Promise<SubmissionFeedback[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_submission_feedback").select(FEEDBACK_SELECT).eq("submission_id", submissionId).order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(mapFeedback);
}

export async function listFeedbackForSubmissionAsInstructor(submissionId: string, actorProfileId: string): Promise<SubmissionFeedback[]> {
  const admin = createAdminClient();
  const { data: submission } = await admin.from("workshop_submissions").select("brief_id").eq("id", submissionId).maybeSingle();
  if (!submission) return [];
  const { data: brief } = await admin.from("workshop_briefs").select("workshop_id").eq("id", submission.brief_id).maybeSingle();
  if (!brief || !(await isEngagedOnWorkshop(actorProfileId, brief.workshop_id))) return [];
  return listFeedbackRaw(submissionId);
}

export async function listFeedbackForSubmissionAsAdmin(submissionId: string, actorProfileId: string): Promise<SubmissionFeedback[]> {
  const auth = await authorizeWithSuperAdminOverride(actorProfileId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return [];
  return listFeedbackRaw(submissionId);
}

export type GiveFeedbackParams = {
  submissionId: string;
  feedbackText: string;
  status?: "reviewed" | "revision_requested";
  attachmentUrl?: string | null;
  actorUserId: string;
};

// Instructor (genuinely engaged on the submission's workshop) or admin
// only — never the participant themself, and never visible to any
// OTHER participant by default (Section K: no shared critique unless
// a future workshop setting explicitly configures it, which does not
// exist yet).
export async function giveFeedback(params: GiveFeedbackParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: submission } = await admin.from("workshop_submissions").select("brief_id").eq("id", params.submissionId).maybeSingle();
  if (!submission) return { ok: false, error: "Submission not found." };
  const { data: brief } = await admin.from("workshop_briefs").select("workshop_id").eq("id", submission.brief_id).maybeSingle();
  if (!brief) return { ok: false, error: "Submission not found." };

  const staffAuth = await authorizeWithSuperAdminOverride(params.actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  const authorized = staffAuth.ok || (await isEngagedOnWorkshop(params.actorUserId, brief.workshop_id));
  if (!authorized) return { ok: false, error: "Not authorized to give feedback on this submission." };
  if (!params.feedbackText.trim()) return { ok: false, error: "Feedback text is required." };

  const { data, error } = await admin
    .from("workshop_submission_feedback")
    .insert({
      submission_id: params.submissionId,
      instructor_profile_id: params.actorUserId,
      feedback_text: params.feedbackText.trim(),
      status: params.status ?? "reviewed",
      attachment_url: params.attachmentUrl ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Failed to save feedback." };

  await logActivity({ actorUserId: params.actorUserId, action: "workshop.submission_feedback.created", entityType: "workshop_submission_feedback", entityId: data.id, metadata: { submissionId: params.submissionId } });
  return { ok: true, id: data.id };
}
