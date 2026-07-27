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

export type ProjectRequestReportFilters = {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ProjectRequestReportRow = {
  id: string;
  referenceNumber: string | null;
  requestTypeLabel: string;
  status: ProjectRequestStatus;
  relatedProjectReference: string;
  relatedProjectType: "Enquiry" | "Workshop Registration";
  clientName: string;
  email: string;
  phone: string | null;
  clientNotes: string | null;
  staffResponse: string | null;
  decidedAt: string | null;
  createdAt: string;
};

// entity_id is a polymorphic reference (enquiry OR workshop_registration
// — see 0008_project_requests.sql's check constraint), so PostgREST
// can't auto-embed the linked row the way request_types(label) above
// can. Fetched in two batched follow-up queries instead of N+1 per-row
// lookups, then merged in application code. Free-text `search` is
// applied after the join for the same reason — it spans fields that
// only exist on the joined row, not on project_requests itself.
export async function getAllProjectRequests(
  filters: ProjectRequestReportFilters = {},
  limit = 5000
): Promise<ProjectRequestReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("project_requests")
    .select(
      "id, reference_number, entity_type, entity_id, status, client_notes, staff_response, decided_at, created_at, request_types(label)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] failed to load project_requests report", error.message);
    return [];
  }

  const rows = data ?? [];
  const enquiryIds = rows.filter((r) => r.entity_type === "enquiry").map((r) => r.entity_id);
  const workshopIds = rows
    .filter((r) => r.entity_type === "workshop_registration")
    .map((r) => r.entity_id);

  const [{ data: enquiries }, { data: registrations }] = await Promise.all([
    enquiryIds.length
      ? supabase.from("enquiries").select("id, reference_number, full_name, email, phone").in("id", enquiryIds)
      : Promise.resolve({ data: [] as { id: string; reference_number: string; full_name: string; email: string; phone: string | null }[] }),
    workshopIds.length
      ? supabase
          .from("workshop_registrations")
          .select("id, registration_reference, full_name, email, phone")
          .in("id", workshopIds)
      : Promise.resolve({ data: [] as { id: string; registration_reference: string; full_name: string; email: string; phone: string | null }[] }),
  ]);

  const enquiryMap = new Map((enquiries ?? []).map((e) => [e.id, e]));
  const registrationMap = new Map((registrations ?? []).map((r) => [r.id, r]));

  const mapped: ProjectRequestReportRow[] = rows.map((row) => {
    const isEnquiry = row.entity_type === "enquiry";
    const linkedEnquiry = isEnquiry ? enquiryMap.get(row.entity_id) : undefined;
    const linkedRegistration = !isEnquiry ? registrationMap.get(row.entity_id) : undefined;
    const linked = linkedEnquiry ?? linkedRegistration;

    return {
      id: row.id,
      referenceNumber: row.reference_number,
      requestTypeLabel: (row.request_types as unknown as { label: string } | null)?.label ?? "Request",
      status: row.status as ProjectRequestStatus,
      relatedProjectReference: linkedEnquiry?.reference_number ?? linkedRegistration?.registration_reference ?? "—",
      relatedProjectType: isEnquiry ? "Enquiry" : "Workshop Registration",
      clientName: linked?.full_name ?? "—",
      email: linked?.email ?? "—",
      phone: linked?.phone ?? null,
      clientNotes: row.client_notes,
      staffResponse: row.staff_response,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    };
  });

  if (!filters.search) return mapped;

  const term = filters.search.toLowerCase();
  return mapped.filter((r) =>
    `${r.referenceNumber ?? ""} ${r.clientName} ${r.email} ${r.requestTypeLabel} ${r.relatedProjectReference}`
      .toLowerCase()
      .includes(term)
  );
}

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
