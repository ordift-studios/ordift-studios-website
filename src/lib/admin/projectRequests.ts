import { createClient } from "@/lib/supabase/server";

export type ProjectRequestEntityType = "enquiry" | "workshop_registration";

export type RequestType = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
};

export async function getRequestTypes(): Promise<RequestType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("request_types")
    .select("id, key, label, sort_order")
    .order("sort_order");

  if (error) {
    console.error("[admin] failed to load request_types", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
  }));
}

export const PROJECT_REQUEST_STATUSES = ["pending", "approved", "rejected", "completed"] as const;
export type ProjectRequestStatus = (typeof PROJECT_REQUEST_STATUSES)[number];

export const PROJECT_REQUEST_STATUS_LABELS: Record<ProjectRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export type AdminProjectRequest = {
  id: string;
  requestTypeLabel: string;
  status: ProjectRequestStatus;
  clientNotes: string | null;
  staffDecision: "approved" | "rejected" | null;
  staffResponse: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function getProjectRequestsForEntity(
  entityType: ProjectRequestEntityType,
  entityId: string
): Promise<AdminProjectRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_requests")
    .select(
      "id, status, client_notes, staff_decision, staff_response, decided_at, created_at, request_types(label)"
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin] failed to load project_requests", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    requestTypeLabel: (row.request_types as unknown as { label: string } | null)?.label ?? "Request",
    status: row.status as ProjectRequestStatus,
    clientNotes: row.client_notes,
    staffDecision: row.staff_decision as "approved" | "rejected" | null,
    staffResponse: row.staff_response,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  }));
}
