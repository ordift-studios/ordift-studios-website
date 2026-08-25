import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { Jurisdiction } from "@/lib/organization/authority";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part D (2026-08-25) — generic cross-department request/workflow
// foundation, against public.department_requests. See that migration's
// header comment for why this is a new table rather than an extension
// of project_requests or workflow_statuses.

export type DepartmentRequest = {
  id: string;
  referenceNumber: string | null;
  requestType: string;
  title: string;
  description: string | null;
  requestingDepartmentId: string | null;
  requestingDepartmentName: string | null;
  requestingJurisdiction: Jurisdiction | null;
  servicingDepartmentId: string | null;
  servicingDepartmentName: string | null;
  servicingJurisdiction: Jurisdiction | null;
  requestedBy: string;
  assignedTo: string | null;
  status: string;
  priority: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decision: string | null;
  decisionNotes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

const SELECT = `
  id, reference_number, request_type, title, description,
  requesting_department_id, requesting_jurisdiction,
  servicing_department_id, servicing_jurisdiction,
  requested_by, assigned_to, status, priority,
  decided_by, decided_at, decision, decision_notes, due_date, completed_at, created_at,
  requesting_department:requesting_department_id(name),
  servicing_department:servicing_department_id(name)
`;

type RawDepartmentRequestRow = {
  id: string;
  reference_number: string | null;
  request_type: string;
  title: string;
  description: string | null;
  requesting_department_id: string | null;
  requesting_jurisdiction: string | null;
  servicing_department_id: string | null;
  servicing_jurisdiction: string | null;
  requested_by: string;
  assigned_to: string | null;
  status: string;
  priority: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision: string | null;
  decision_notes: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

function mapRequest(row: RawDepartmentRequestRow): DepartmentRequest {
  const requestingDepartment = (row as unknown as { requesting_department: { name: string } | null }).requesting_department;
  const servicingDepartment = (row as unknown as { servicing_department: { name: string } | null }).servicing_department;
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    requestType: row.request_type,
    title: row.title,
    description: row.description,
    requestingDepartmentId: row.requesting_department_id,
    requestingDepartmentName: requestingDepartment?.name ?? null,
    requestingJurisdiction: row.requesting_jurisdiction as Jurisdiction | null,
    servicingDepartmentId: row.servicing_department_id,
    servicingDepartmentName: servicingDepartment?.name ?? null,
    servicingJurisdiction: row.servicing_jurisdiction as Jurisdiction | null,
    requestedBy: row.requested_by,
    assignedTo: row.assigned_to,
    status: row.status,
    priority: row.priority,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decision: row.decision,
    decisionNotes: row.decision_notes,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function listDepartmentRequests(): Promise<DepartmentRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("department_requests").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load department_requests", error.message);
    return [];
  }
  return (data ?? []).map(mapRequest);
}

export type CreateDepartmentRequestParams = {
  requestType: string;
  title: string;
  description?: string | null;
  requestingDepartmentId?: string | null;
  requestingJurisdiction?: Jurisdiction | null;
  servicingDepartmentId?: string | null;
  servicingJurisdiction?: Jurisdiction | null;
  priority?: string | null;
  dueDate?: string | null;
  payload?: Record<string, unknown>;
  requestedBy: string;
};

export type CreateDepartmentRequestResult = { ok: true; requestId: string } | { ok: false; error: string };

// Never touches reporting lines or Grade — this function has no path to
// staff_details/positions.reports_to_position_id at all, by
// construction (Part D's explicit "never automatically modify
// reporting lines or Grade").
export async function createDepartmentRequest(params: CreateDepartmentRequestParams): Promise<CreateDepartmentRequestResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("department_requests")
    .insert({
      request_type: params.requestType,
      title: params.title,
      description: params.description ?? null,
      requesting_department_id: params.requestingDepartmentId ?? null,
      requesting_jurisdiction: params.requestingJurisdiction ?? null,
      servicing_department_id: params.servicingDepartmentId ?? null,
      servicing_jurisdiction: params.servicingJurisdiction ?? null,
      priority: params.priority ?? null,
      due_date: params.dueDate ?? null,
      payload: params.payload ?? {},
      requested_by: params.requestedBy,
      status: "submitted",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to create department_request", error?.message);
    return { ok: false, error: "Failed to create the request." };
  }

  await logActivity({
    actorUserId: params.requestedBy,
    action: "department_request.created",
    entityType: "department_request",
    entityId: data.id,
    metadata: { requestType: params.requestType, title: params.title },
  });

  return { ok: true, requestId: data.id };
}

export async function decideDepartmentRequest(params: {
  requestId: string;
  decision: "approved" | "rejected";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("department_requests")
    .update({
      decision: params.decision,
      decision_notes: params.decisionNotes ?? null,
      decided_by: params.actorUserId,
      decided_at: new Date().toISOString(),
      status: params.decision === "approved" ? "approved" : "rejected",
    })
    .eq("id", params.requestId);
  if (error) {
    console.error("[organization] failed to decide department_request", error.message);
    return { ok: false, error: "Failed to record the decision." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "department_request.decided",
    entityType: "department_request",
    entityId: params.requestId,
    metadata: { decision: params.decision, decisionNotes: params.decisionNotes ?? null },
  });

  return { ok: true };
}

export async function addDepartmentRequestComment(params: {
  requestId: string;
  comment: string;
  authorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("department_request_comments")
    .insert({ request_id: params.requestId, author_id: params.authorId, comment: params.comment });
  if (error) {
    console.error("[organization] failed to add department_request comment", error.message);
    return { ok: false, error: "Failed to add the comment." };
  }

  await logActivity({
    actorUserId: params.authorId,
    action: "department_request.comment_added",
    entityType: "department_request",
    entityId: params.requestId,
  });

  return { ok: true };
}
