import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { getCrewAssignmentForEngagement } from "./crewOffers";
import { validateJobReport, type JobReportInput } from "./jobReportRules";

// Job-completion reports. A report is the assigned professional's record of what happened on a job. It is
// append-only (the original is never overwritten; a correction is a new version naming what it replaces and
// why), INTERNAL (never shown to clients), and it deliberately does nothing else: it does not complete the
// engagement, close the client project, mark any payable paid, or trigger a payout.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOT_ENTITY = "crew_support_slot";

export type AssignmentReport = {
  id: string;
  engagementId: string;
  reporterId: string;
  version: number;
  supersedesId: string | null;
  correctionReason: string | null;
  serviceFamily: string | null;
  actualServiceDate: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  completionStatus: string;
  wentSmoothly: boolean | null;
  answers: Record<string, string>;
  incidents: string | null;
  clientRequests: string | null;
  additionalServices: string | null;
  outstandingWork: string | null;
  remarks: string | null;
  submittedAt: string;
};

const SELECT =
  "id, engagement_id, reporter_id, version, supersedes_id, correction_reason, service_family, actual_service_date, actual_start_time, actual_end_time, completion_status, went_smoothly, answers, incidents, client_requests, additional_services, outstanding_work, remarks, submitted_at";

function mapReport(r: Record<string, unknown>): AssignmentReport {
  return {
    id: r.id as string,
    engagementId: r.engagement_id as string,
    reporterId: r.reporter_id as string,
    version: r.version as number,
    supersedesId: (r.supersedes_id as string | null) ?? null,
    correctionReason: (r.correction_reason as string | null) ?? null,
    serviceFamily: (r.service_family as string | null) ?? null,
    actualServiceDate: r.actual_service_date as string,
    actualStartTime: (r.actual_start_time as string | null) ?? null,
    actualEndTime: (r.actual_end_time as string | null) ?? null,
    completionStatus: r.completion_status as string,
    wentSmoothly: (r.went_smoothly as boolean | null) ?? null,
    answers: (r.answers as Record<string, string> | null) ?? {},
    incidents: (r.incidents as string | null) ?? null,
    clientRequests: (r.client_requests as string | null) ?? null,
    additionalServices: (r.additional_services as string | null) ?? null,
    outstandingWork: (r.outstanding_work as string | null) ?? null,
    remarks: (r.remarks as string | null) ?? null,
    submittedAt: r.submitted_at as string,
  };
}

// Qatar is UTC+3 and has no daylight saving.
export function todayInQatar(now: number = Date.now()): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
}

// The service family of the job behind an engagement (drives which questions the report asks).
export async function getServiceFamilyForEngagement(engagementId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("entity_type, entity_id").eq("id", engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY) return null;
  const { data: slot } = await admin.from("crew_support_slots").select("request_id").eq("id", eng.entity_id as string).maybeSingle();
  if (!slot) return null;
  const { data: request } = await admin.from("crew_support_requests").select("service_family").eq("id", slot.request_id as string).maybeSingle();
  return (request?.service_family as string | null) ?? null;
}

// All versions, newest first. Admin read — callers decide who may see it (the reporter for their own job,
// administrators for any).
export async function listReportsForEngagement(engagementId: string): Promise<AssignmentReport[]> {
  const { data, error } = await createAdminClient().from("assignment_reports").select(SELECT).eq("engagement_id", engagementId).order("version", { ascending: false });
  if (error) {
    console.error("[crew-support] failed to load assignment reports", error.message);
    return [];
  }
  return (data ?? []).map(mapReport);
}

export async function listMyReports(engagementId: string, userId: string): Promise<AssignmentReport[]> {
  // Only the engagement's own accepted assignee ever reads their reports through this path.
  if (!(await getCrewAssignmentForEngagement(engagementId, userId))) return [];
  return listReportsForEngagement(engagementId);
}

// Submit the first report, or (when one already exists) a correction as a NEW version.
export async function submitJobReport(params: { engagementId: string; actorUserId: string; input: JobReportInput; now?: number }): Promise<Result<{ id: string; version: number; isCorrection: boolean }>> {
  const job = await getCrewAssignmentForEngagement(params.engagementId, params.actorUserId);
  if (!job) return { ok: false, error: "Only the professional assigned to this job can submit its report." };

  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("entity_type, entity_id").eq("id", params.engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY) return { ok: false, error: "This assignment has no job record." };
  const { data: slot } = await admin.from("crew_support_slots").select("id, request_id").eq("id", eng.entity_id as string).maybeSingle();
  const { data: request } = slot ? await admin.from("crew_support_requests").select("service_family").eq("id", slot.request_id as string).maybeSingle() : { data: null };

  const previous = await listReportsForEngagement(params.engagementId);
  const isCorrection = previous.length > 0;
  const valid = validateJobReport({ ...params.input, serviceFamily: (request?.service_family as string | null) ?? null }, todayInQatar(params.now), isCorrection);
  if (!valid.ok) return valid;
  const r = valid.report;

  const version = isCorrection ? previous[0].version + 1 : 1;
  const { data, error } = await admin
    .from("assignment_reports")
    .insert({
      engagement_id: params.engagementId,
      slot_id: slot?.id ?? null,
      request_id: slot?.request_id ?? null,
      reporter_id: params.actorUserId,
      version,
      supersedes_id: isCorrection ? previous[0].id : null,
      correction_reason: isCorrection ? (r.correctionReason ?? "").trim() : null,
      service_family: r.serviceFamily,
      actual_service_date: r.actualServiceDate,
      actual_start_time: r.actualStartTime || null,
      actual_end_time: r.actualEndTime || null,
      completion_status: r.completionStatus,
      went_smoothly: r.wentSmoothly,
      answers: r.answers,
      incidents: r.incidents.trim() || null,
      client_requests: r.clientRequests.trim() || null,
      additional_services: r.additionalServices.trim() || null,
      outstanding_work: r.outstandingWork.trim() || null,
      remarks: r.remarks.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    // 23505 = someone (this person in another tab) submitted the same version a moment ago.
    if (error?.code === "23505") return { ok: false, error: "A report was just submitted for this job — refresh to see it." };
    console.error("[crew-support] failed to record assignment report", error?.message);
    return { ok: false, error: "Could not save the report. Please try again." };
  }

  await logActivityAsSystem({
    actorUserId: params.actorUserId,
    action: isCorrection ? "assignment_report.corrected" : "assignment_report.submitted",
    entityType: "engagement",
    entityId: params.engagementId,
    metadata: { reportId: data.id, version, completionStatus: r.completionStatus, actualServiceDate: r.actualServiceDate, ...(isCorrection ? { supersedes: previous[0].id, reason: r.correctionReason } : {}) },
  });
  return { ok: true, id: data.id as string, version, isCorrection };
}
