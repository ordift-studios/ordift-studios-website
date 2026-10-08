import { createAdminClient } from "@/lib/supabase/admin";
import { getAllEnquiries } from "@/lib/portal/data";

// Creative & Production Live Operations (Task 13, 2026-09-18) — an
// operational layer over the SAME real enquiries.crm_stage state
// machine the Enquiries CRM already uses (never a second project-
// management database, never an invented stage). Scoped to
// crm_stage='booked' onward — earlier stages are sales/CRM pipeline,
// already covered by /admin/enquiries itself.
//
// Genuine gap, not fabricated: enquiries has no shoot-date/due-date/
// delivery-date column today, so "upcoming shoots," "due date," and
// "overdue" cannot be honestly computed — this module reports what
// IS real (client, service, stage, submitted date, assigned staff)
// and does not invent the rest.

const ACTIVE_STAGES = new Set(["booked", "in_progress", "delivered"]);

const STAGE_GROUP_LABEL: Record<string, string> = {
  booked: "Booked — Not Yet Started",
  in_progress: "In Progress",
  delivered: "Delivered — Awaiting Final Confirmation",
};

export type LiveProductionJob = {
  id: string;
  referenceNumber: string;
  clientName: string;
  service: string;
  stage: string;
  stageGroupLabel: string;
  submittedAt: string;
  assignedStaffNames: string[];
  // Creative Crew Support jobs: the real dates/place from the request and
  // the crew who ACCEPTED (from the slots), so the board shows them without
  // a second project record. Undefined for every other job.
  crewSupport?: { requestId: string; startDate: string; endDate: string; location: string; crewNames: string[] };
};

export async function listLiveProductionJobs(): Promise<LiveProductionJob[]> {
  const enquiries = await getAllEnquiries({}, 200);
  const active = enquiries.filter((e) => ACTIVE_STAGES.has(e.crmStage));
  if (active.length === 0) return [];

  const admin = createAdminClient();
  const ids = active.map((e) => e.id);
  const { data: assignments } = await admin
    .from("project_assignments")
    .select("entity_id, user_id, profiles!project_assignments_user_id_fkey(full_name)")
    .eq("entity_type", "enquiry")
    .in("entity_id", ids)
    .in("status", ["active", "invited"]);

  const namesByEntityId = new Map<string, string[]>();
  for (const row of (assignments ?? []) as unknown as { entity_id: string; profiles: { full_name: string | null } | null }[]) {
    const name = row.profiles?.full_name;
    if (!name) continue;
    const list = namesByEntityId.get(row.entity_id) ?? [];
    list.push(name);
    namesByEntityId.set(row.entity_id, list);
  }

  const crewByEnquiry = new Map<string, NonNullable<LiveProductionJob["crewSupport"]>>();
  const { data: crewRequests } = await admin.from("crew_support_requests").select("id, enquiry_id, start_date, end_date, location").in("enquiry_id", ids);
  if (crewRequests?.length) {
    const { data: slots } = await admin.from("crew_support_slots").select("request_id, assignee:profiles!crew_support_slots_assignee_profile_id_fkey(full_name)").in("request_id", crewRequests.map((r) => r.id as string)).eq("status", "assigned");
    for (const r of crewRequests) {
      const names = ((slots ?? []) as unknown as { request_id: string; assignee: { full_name: string | null } | null }[]).filter((x) => x.request_id === r.id).map((x) => x.assignee?.full_name).filter((n): n is string => Boolean(n));
      crewByEnquiry.set(r.enquiry_id as string, { requestId: r.id as string, startDate: r.start_date as string, endDate: r.end_date as string, location: r.location as string, crewNames: names });
    }
  }

  return active
    .map((e) => ({
      id: e.id,
      referenceNumber: e.referenceNumber,
      clientName: e.fullName,
      service: e.service,
      stage: e.crmStage,
      stageGroupLabel: STAGE_GROUP_LABEL[e.crmStage] ?? e.crmStage,
      submittedAt: e.submittedAt,
      assignedStaffNames: [...(namesByEntityId.get(e.id) ?? []), ...(crewByEnquiry.get(e.id)?.crewNames ?? [])],
      crewSupport: crewByEnquiry.get(e.id),
    }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
