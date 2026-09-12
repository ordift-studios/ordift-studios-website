import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { createDepartmentRequest, decideDepartmentRequest } from "@/lib/organization/departmentRequests";
import { isSuperAdminId, hasAuthority, PEOPLE_CAPABILITIES, type Jurisdiction } from "@/lib/organization/authority";

async function requirePeopleAdministerOrSuperAdmin(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSuperAdminId(actorUserId)) return { ok: true };
  const authorized = await hasAuthority(actorUserId, PEOPLE_CAPABILITIES.recruitmentAdminister, null);
  if (!authorized) return { ok: false, error: "Only People/Recruitment (PULSE) or a Super Admin can do this." };
  return { ok: true };
}

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

export type HireOrigin = "standard_recruitment" | "founder_direct_hire";

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
  // Employment foundation + hire origin (E.5 Stage 2M, 2026-09-12) —
  // see migration 0080. All employment-context fields are nullable/
  // "pending" by design where genuinely undecided; never inferred.
  hireOrigin: HireOrigin;
  directHireProfileId: string | null;
  directHireProfileName: string | null;
  employingEntityId: string | null;
  employingEntityName: string | null;
  employmentJurisdictionId: string | null;
  employmentJurisdictionName: string | null;
  workLocation: string | null;
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
       hire_origin, direct_hire_profile_id, employing_entity_id, employment_jurisdiction_id, work_location,
       department_requests(title, status),
       positions(name),
       departments(name),
       grades(name),
       engagement_types(name),
       direct_hire_profile:profiles!recruitment_requisitions_direct_hire_profile_id_fkey(full_name),
       employing_entities(name),
       employment_jurisdictions(name)`
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[recruitment] failed to load requisitions", error.message);
    return [];
  }
  return (data ?? []).map(mapRequisition);
}

function mapRequisition(r: {
  id: string;
  request_id: string;
  requested_position_id: string | null;
  department_id: string | null;
  grade_id: string | null;
  headcount: number;
  engagement_type_id: string | null;
  required_skills: string | null;
  responsibilities: string | null;
  justification: string | null;
  preferred_start_date: string | null;
  hiring_manager_id: string | null;
  interview_requirements: string | null;
  created_at: string;
  hire_origin: string;
  direct_hire_profile_id: string | null;
  employing_entity_id: string | null;
  employment_jurisdiction_id: string | null;
  work_location: string | null;
  department_requests: unknown;
  positions: unknown;
  departments: unknown;
  grades: unknown;
  engagement_types: unknown;
  direct_hire_profile: unknown;
  employing_entities: unknown;
  employment_jurisdictions: unknown;
}): RecruitmentRequisition {
  const request = r.department_requests as unknown as { title: string; status: string } | null;
  const position = r.positions as unknown as { name: string } | null;
  const department = r.departments as unknown as { name: string } | null;
  const grade = r.grades as unknown as { name: string } | null;
  const engagementType = r.engagement_types as unknown as { name: string } | null;
  const directHireProfile = r.direct_hire_profile as unknown as { full_name: string | null } | null;
  const employingEntity = r.employing_entities as unknown as { name: string } | null;
  const employmentJurisdiction = r.employment_jurisdictions as unknown as { name: string } | null;
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
    hireOrigin: r.hire_origin as HireOrigin,
    directHireProfileId: r.direct_hire_profile_id,
    directHireProfileName: directHireProfile?.full_name ?? null,
    employingEntityId: r.employing_entity_id,
    employingEntityName: employingEntity?.name ?? null,
    employmentJurisdictionId: r.employment_jurisdiction_id,
    employmentJurisdictionName: employmentJurisdiction?.name ?? null,
    workLocation: r.work_location,
    createdAt: r.created_at,
  };
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
  // Employment foundation + hire origin (E.5 Stage 2M) — hireOrigin
  // defaults to 'standard_recruitment' (unchanged prior behavior).
  // 'founder_direct_hire' requires directHireProfileId and is
  // enforced Super-Admin-only below — not a bypass of decideRequisition(),
  // which every requisition (either origin) still goes through
  // unchanged.
  hireOrigin?: HireOrigin;
  directHireProfileId?: string | null;
  employingEntityId?: string | null;
  employmentJurisdictionId?: string | null;
  workLocation?: string | null;
  requestedBy: string;
};

export type CreateRequisitionResult = { ok: true; requisitionId: string } | { ok: false; error: string };

// Servicing party is ALWAYS People/Recruitment (jurisdiction 'people')
// — a requesting department (e.g. VAULT/Finance) can never route a
// requisition anywhere else, satisfying "the requesting department
// must NOT automatically control the entire recruitment process."
export async function createRecruitmentRequisition(params: CreateRequisitionParams): Promise<CreateRequisitionResult> {
  const hireOrigin = params.hireOrigin ?? "standard_recruitment";

  // E.5 Stage 2M, Part 2 — "unauthorized users cannot manufacture
  // Founder-direct hires." This is the real boundary, inside the
  // library function, independent of whatever gate a calling server
  // action applies — matching this codebase's established pattern
  // (assignStaffPosition's staff-role guard, etc.). Deliberately
  // stricter than the coarse People/Recruitment tier that can create a
  // standard requisition: a direct hire names a specific real person
  // and skips the public application process, so only a genuine Super
  // Admin may open one.
  if (hireOrigin === "founder_direct_hire") {
    if (!(await isSuperAdminId(params.requestedBy))) {
      return { ok: false, error: "Only a Super Admin can create a Founder Direct Hire requisition." };
    }
    if (!params.directHireProfileId) {
      return { ok: false, error: "A Founder Direct Hire requisition must name the specific person being hired." };
    }
  } else if (params.directHireProfileId) {
    return { ok: false, error: "A standard-recruitment requisition must not name a specific candidate directly." };
  }

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
      hire_origin: hireOrigin,
      direct_hire_profile_id: params.directHireProfileId ?? null,
      employing_entity_id: params.employingEntityId ?? null,
      employment_jurisdiction_id: params.employmentJurisdictionId ?? null,
      work_location: params.workLocation ?? null,
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

  if (hireOrigin === "founder_direct_hire") {
    await logActivity({
      actorUserId: params.requestedBy,
      action: "recruitment_requisition.founder_direct_hire_created",
      entityType: "user",
      entityId: params.directHireProfileId!,
      metadata: { requisitionId: data.id },
    });
  }

  return { ok: true, requisitionId: data.id };
}

// Convenience for "a Founder should be able to create and approve such
// a direct-hire requisition in one deliberate workflow" (E.5 Stage 2M,
// Part 2) — literally just createRecruitmentRequisition() then
// decideRequisition({decision:'approved'}) in sequence; NOT a new or
// weaker approval path. decideRequisition() runs its own unchanged
// authorization and writes its own unchanged audit trail; this
// function adds no shortcut around either.
export async function createAndApproveFounderDirectHire(
  params: Omit<CreateRequisitionParams, "hireOrigin"> & { directHireProfileId: string; decisionNotes?: string | null }
): Promise<CreateRequisitionResult> {
  const created = await createRecruitmentRequisition({ ...params, hireOrigin: "founder_direct_hire" });
  if (!created.ok) return created;

  const decided = await decideRequisition({
    requisitionId: created.requisitionId,
    decision: "approved",
    decisionNotes: params.decisionNotes ?? "Founder Direct Hire — created and approved in one workflow.",
    actorUserId: params.requestedBy,
  });
  if (!decided.ok) return { ok: false, error: decided.error };

  return created;
}

// The ONLY path that can approve/reject a requisition — always goes
// through the underlying department_request's decision fields
// (People/Recruitment's call, never the requesting department's own).
// Phase 3.4, Part 6 — the real enforcement point for
// people.recruitment.administer (PULSE's capability): the requesting
// department can never approve/reject its own requisition, only
// People/Recruitment or a Super Admin.
export async function decideRequisition(params: {
  requisitionId: string;
  decision: "approved" | "rejected";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authCheck = await requirePeopleAdministerOrSuperAdmin(params.actorUserId);
  if (!authCheck.ok) return authCheck;

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

// Phase 3.4, Part 6 — assigning WHO evaluates is the actual
// separation-of-duties control point (not evaluation submission
// itself, see submitInterviewEvaluation() below) — PULSE decides the
// panel composition, or a Super Admin.
export async function scheduleInterviewPanel(params: {
  applicationId: string;
  scheduledAt?: string | null;
  format?: string | null;
  evaluatorAssignments: { profileId: string; role: string }[];
  actorUserId: string;
}): Promise<{ ok: true; panelId: string } | { ok: false; error: string }> {
  const authCheck = await requirePeopleAdministerOrSuperAdmin(params.actorUserId);
  if (!authCheck.ok) return authCheck;

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

// Self-only: an evaluator may only submit their OWN assigned
// evaluation — panel composition (who was assigned) is already the
// separation-of-duties gate, enforced above in scheduleInterviewPanel().
// A Super Admin may submit/correct on anyone's behalf where necessary.
export async function submitInterviewEvaluation(params: {
  panelId: string;
  evaluatorId: string;
  assessmentNotes: string;
  recommendation: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.actorUserId !== params.evaluatorId && !(await isSuperAdminId(params.actorUserId))) {
    return { ok: false, error: "You can only submit your own evaluation." };
  }

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
    actorUserId: params.actorUserId,
    action: "recruitment.evaluation.submitted",
    entityType: "recruitment_interview_panel",
    entityId: params.panelId,
    metadata: { recommendation: params.recommendation },
  });

  return { ok: true };
}

// ============================================================
// Onboarding-start integrity (E.5 Stage 2M, Part 5) — "an ordinary
// administrator [must not be able to] create an orphan employee
// onboarding record with no approved hire definition." Both functions
// below are read-only; startStaffOnboarding() (onboarding.ts) is the
// actual enforcement point that calls getApprovedRequisitionForOnboarding().
// ============================================================

// Pure display fetch — no approval/linkage validation, unlike
// getApprovedRequisitionForOnboarding() below (which would always
// reject an ALREADY-linked requisition, wrong for simply displaying
// one). Used by the Onboarding Workspace's Employment/Hire Definition
// summary.
export async function getRequisitionById(id: string): Promise<RecruitmentRequisition | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_requisitions")
    .select(
      `id, request_id, requested_position_id, department_id, grade_id, headcount, engagement_type_id,
       required_skills, responsibilities, justification, preferred_start_date, hiring_manager_id,
       interview_requirements, created_at,
       hire_origin, direct_hire_profile_id, employing_entity_id, employment_jurisdiction_id, work_location,
       department_requests(title, status),
       positions(name),
       departments(name),
       grades(name),
       engagement_types(name),
       direct_hire_profile:profiles!recruitment_requisitions_direct_hire_profile_id_fkey(full_name),
       employing_entities(name),
       employment_jurisdictions(name)`
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRequisition(data);
}

// Requisitions that are genuinely usable to start a NEW onboarding:
// approved (via department_requests.status), and not already linked
// to an existing staff_onboarding row (one requisition -> at most one
// onboarding). Used to populate the Start Onboarding requisition
// picker — a Super Admin still exercises judgment picking the right
// one; getApprovedRequisitionForOnboarding() is the real, enforced
// check at write time.
export async function listApprovedRequisitionsForOnboarding(): Promise<RecruitmentRequisition[]> {
  const admin = createAdminClient();
  const { data: linkedIds } = await admin.from("staff_onboarding").select("requisition_id").not("requisition_id", "is", null);
  const alreadyLinked = new Set((linkedIds ?? []).map((r) => r.requisition_id as string));

  const all = await listRecruitmentRequisitions();
  return all.filter((r) => r.requestStatus === "approved" && !alreadyLinked.has(r.id));
}

// The real enforcement point. Confirms: the requisition exists, is
// approved (department_requests.status), is not already linked to a
// different onboarding record, and — for a Founder Direct Hire
// specifically — genuinely names THIS profile (a standard-recruitment
// requisition has no stored candidate link yet in this schema; see the
// E.5 Stage 2M report's own "unresolved" note on this asymmetry).
export async function getApprovedRequisitionForOnboarding(
  requisitionId: string,
  profileId: string
): Promise<{ ok: true; requisition: RecruitmentRequisition } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_requisitions")
    .select(
      `id, request_id, requested_position_id, department_id, grade_id, headcount, engagement_type_id,
       required_skills, responsibilities, justification, preferred_start_date, hiring_manager_id,
       interview_requirements, created_at,
       hire_origin, direct_hire_profile_id, employing_entity_id, employment_jurisdiction_id, work_location,
       department_requests(title, status),
       positions(name),
       departments(name),
       grades(name),
       engagement_types(name),
       direct_hire_profile:profiles!recruitment_requisitions_direct_hire_profile_id_fkey(full_name),
       employing_entities(name),
       employment_jurisdictions(name)`
    )
    .eq("id", requisitionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Requisition not found." };

  const requisition = mapRequisition(data);
  if (requisition.requestStatus !== "approved") {
    return { ok: false, error: `This requisition is "${requisition.requestStatus}", not approved — it cannot be used to start onboarding.` };
  }
  if (requisition.hireOrigin === "founder_direct_hire" && requisition.directHireProfileId !== profileId) {
    return { ok: false, error: "This Founder Direct Hire requisition names a different person." };
  }

  const { data: existingLink } = await admin.from("staff_onboarding").select("id").eq("requisition_id", requisitionId).maybeSingle();
  if (existingLink) {
    return { ok: false, error: "This requisition is already linked to another onboarding record." };
  }

  return { ok: true, requisition };
}
