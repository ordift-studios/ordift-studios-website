import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { createDepartmentRequest, decideDepartmentRequest } from "@/lib/organization/departmentRequests";
import type { Jurisdiction } from "@/lib/organization/authority";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part E (2026-08-25) — recruitment requisition + interview panel
// foundation, against public.recruitment_requisitions/
// recruitment_interview_panels/recruitment_interview_evaluations. A
// requisition is created as a department_request (request_type
// 'recruitment_requisition') for its generic review/approval
// lifecycle, plus this table for the requisition-specific structured
// fields. Recruitment (PULSE/People) receives it via the same
// department_requests row — separation of duties (Part E's explicit
// requirement) is enforced by NEVER letting the requesting
// department's own decideDepartmentRequest() call double as
// Recruitment's required review: see decideRequisition() below, which
// is the only path that can move a requisition past People/Recruitment
// review, independent of who requested it.

export type RecruitmentRequisition = {
  id: string;
  requestId: string;
  requestTitle: string;
  requestStatus: string;
  requestedPositionId: string | null;
  requestedPositionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  gradeId: string | null;
  gradeName: string | null;
  headcount: number;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  requiredSkills: string | null;
  responsibilities: string | null;
  justification: string | null;
  preferredStartDate: string | null;
  hiringManagerId: string | null;
  interviewRequirements: string | null;
  createdAt: string;
};

export async function listRecruitmentRequisitions(): Promise<RecruitmentRequisition[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_requisitions")
    .select(
      `id, request_id, requested_position_id, department_id, grade_id, headcount, engagement_type_id,
       required_skills, responsibilities, justification, preferred_start_date, hiring_manager_id,
       interview_requirements, created_at,
       department_requests(title, status),
       positions(name),
       departments(name),
       grades(name),
       engagement_types(name)`
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[recruitment] failed to load requisitions", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const request = r.department_requests as unknown as { title: string; status: string } | null;
    const position = r.positions as unknown as { name: string } | null;
    const department = r.departments as unknown as { name: string } | null;
    const grade = r.grades as unknown as { name: string } | null;
    const engagementType = r.engagement_types as unknown as { name: string } | null;
    return {
      id: r.id,
      requestId: r.request_id,
      requestTitle: request?.title ?? "—",
      requestStatus: request?.status ?? "—",
      requestedPositionId: r.requested_position_id,
      requestedPositionName: position?.name ?? null,
      departmentId: r.department_id,
      departmentName: department?.name ?? null,
      gradeId: r.grade_id,
      gradeName: grade?.name ?? null,
      headcount: r.headcount,
      engagementTypeId: r.engagement_type_id,
      engagementTypeName: engagementType?.name ?? null,
      requiredSkills: r.required_skills,
      responsibilities: r.responsibilities,
      justification: r.justification,
      preferredStartDate: r.preferred_start_date,
      hiringManagerId: r.hiring_manager_id,
      interviewRequirements: r.interview_requirements,
      createdAt: r.created_at,
    };
  });
}

export type CreateRequisitionParams = {
  title: string;
  requestingDepartmentId?: string | null;
  requestingJurisdiction?: Jurisdiction | null;
  requestedPositionId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  headcount?: number;
  engagementTypeId?: string | null;
  requiredSkills?: string | null;
  responsibilities?: string | null;
  justification?: string | null;
  proposedCompensationBandId?: string | null;
  preferredStartDate?: string | null;
  hiringManagerId?: string | null;
  interviewRequirements?: string | null;
  requestedBy: string;
};

export type CreateRequisitionResult = { ok: true; requisitionId: string } | { ok: false; error: string };

// Servicing party is ALWAYS People/Recruitment (jurisdiction 'people')
// — a requesting department (e.g. VAULT/Finance) can never route a
// requisition anywhere else, satisfying "the requesting department
// must NOT automatically control the entire recruitment process."
export async function createRecruitmentRequisition(params: CreateRequisitionParams): Promise<CreateRequisitionResult> {
  const requestResult = await createDepartmentRequest({
    requestType: "recruitment_requisition",
    title: params.title,
    requestingDepartmentId: params.requestingDepartmentId ?? null,
    requestingJurisdiction: params.requestingJurisdiction ?? null,
    servicingJurisdiction: "people",
    requestedBy: params.requestedBy,
  });
  if (!requestResult.ok) return requestResult;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_requisitions")
    .insert({
      request_id: requestResult.requestId,
      requested_position_id: params.requestedPositionId ?? null,
      department_id: params.departmentId ?? null,
      grade_id: params.gradeId ?? null,
      headcount: params.headcount ?? 1,
      engagement_type_id: params.engagementTypeId ?? null,
      required_skills: params.requiredSkills ?? null,
      responsibilities: params.responsibilities ?? null,
      justification: params.justification ?? null,
      proposed_compensation_band_id: params.proposedCompensationBandId ?? null,
      preferred_start_date: params.preferredStartDate ?? null,
      hiring_manager_id: params.hiringManagerId ?? null,
      interview_requirements: params.interviewRequirements ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[recruitment] failed to create requisition", error?.message);
    return { ok: false, error: "Failed to create the requisition." };
  }

  return { ok: true, requisitionId: data.id };
}

// The ONLY path that can approve/reject a requisition — always goes
// through the underlying department_request's decision fields
// (People/Recruitment's call, never the requesting department's own).
export async function decideRequisition(params: {
  requisitionId: string;
  decision: "approved" | "rejected";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: requisition } = await admin.from("recruitment_requisitions").select("request_id").eq("id", params.requisitionId).maybeSingle();
  if (!requisition) return { ok: false, error: "Requisition not found." };

  return decideDepartmentRequest({
    requestId: requisition.request_id,
    decision: params.decision,
    decisionNotes: params.decisionNotes,
    actorUserId: params.actorUserId,
  });
}

// ============================================================
// Interview panels — multiple interviewers/evaluators
// ============================================================
export type InterviewPanel = {
  id: string;
  applicationId: string;
  scheduledAt: string | null;
  format: string | null;
  status: string;
  notes: string | null;
};

export async function listInterviewPanelsForApplication(applicationId: string): Promise<InterviewPanel[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_interview_panels")
    .select("id, application_id, scheduled_at, format, status, notes")
    .eq("application_id", applicationId)
    .order("scheduled_at", { ascending: true });
  if (error) {
    console.error("[recruitment] failed to load interview panels", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id,
    applicationId: p.application_id,
    scheduledAt: p.scheduled_at,
    format: p.format,
    status: p.status,
    notes: p.notes,
  }));
}

export async function scheduleInterviewPanel(params: {
  applicationId: string;
  scheduledAt?: string | null;
  format?: string | null;
  evaluatorAssignments: { profileId: string; role: string }[];
  actorUserId: string;
}): Promise<{ ok: true; panelId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: panel, error } = await admin
    .from("recruitment_interview_panels")
    .insert({
      application_id: params.applicationId,
      scheduled_at: params.scheduledAt ?? null,
      format: params.format ?? null,
      status: "scheduled",
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !panel) {
    console.error("[recruitment] failed to schedule interview panel", error?.message);
    return { ok: false, error: "Failed to schedule the panel." };
  }

  if (params.evaluatorAssignments.length > 0) {
    const { error: evalError } = await admin.from("recruitment_interview_evaluations").insert(
      params.evaluatorAssignments.map((e) => ({
        panel_id: panel.id,
        evaluator_id: e.profileId,
        evaluator_role: e.role,
      }))
    );
    if (evalError) {
      console.error("[recruitment] failed to assign evaluators", evalError.message);
    }
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "recruitment.interview_panel.scheduled",
    entityType: "recruitment_application",
    entityId: params.applicationId,
    metadata: { panelId: panel.id, evaluatorCount: params.evaluatorAssignments.length },
  });

  return { ok: true, panelId: panel.id };
}

export async function submitInterviewEvaluation(params: {
  panelId: string;
  evaluatorId: string;
  assessmentNotes: string;
  recommendation: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("recruitment_interview_evaluations")
    .update({
      assessment_notes: params.assessmentNotes,
      recommendation: params.recommendation,
      submitted_at: new Date().toISOString(),
    })
    .eq("panel_id", params.panelId)
    .eq("evaluator_id", params.evaluatorId);
  if (error) {
    console.error("[recruitment] failed to submit evaluation", error.message);
    return { ok: false, error: "Failed to submit the evaluation." };
  }

  await logActivity({
    actorUserId: params.evaluatorId,
    action: "recruitment.evaluation.submitted",
    entityType: "recruitment_interview_panel",
    entityId: params.panelId,
    metadata: { recommendation: params.recommendation },
  });

  return { ok: true };
}
