import { contentRepository } from "@/lib/content";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { createClient } from "@/lib/supabase/server";
import {
  crmStageLabel,
  getEnquiryByIdForUser,
  getWorkshopRegistrationByIdForUser,
} from "@/lib/portal/data";
import { crmStageProgress, nextCrmStage } from "@/lib/portal/dashboard";
import type { ProjectRequestStatus } from "@/lib/admin/projectRequests";

// The reusable Project Workspace's data layer — every tab reads through
// here, never queries a table directly, so a future project kind
// (vendor engagement, model booking, a future business module) only
// needs a new branch in these functions, not a new UI.

export type ProjectKind = "enquiry" | "workshop";

export function isProjectKind(value: string): value is ProjectKind {
  return value === "enquiry" || value === "workshop";
}

// ============================================================
// Overview
// ============================================================

export type WorkspaceOverview = {
  kind: ProjectKind;
  id: string;
  title: string;
  projectType: string;
  statusLabel: string;
  nextMilestoneLabel: string | null;
  progress: { step: number; total: number } | null;
  submittedAt: string;
  paymentStatus: string | null;
};

export async function getWorkspaceOverview(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<WorkspaceOverview | null> {
  if (kind === "enquiry") {
    const enquiry = await getEnquiryByIdForUser(id, userId);
    if (!enquiry) return null;
    const next = nextCrmStage(enquiry.crmStage);
    return {
      kind,
      id: enquiry.id,
      title: `${pathwayLabel(enquiry.service)} — ${enquiry.referenceNumber}`,
      projectType: pathwayLabel(enquiry.service),
      statusLabel: crmStageLabel(enquiry.crmStage),
      nextMilestoneLabel: next ? crmStageLabel(next) : null,
      progress: crmStageProgress(enquiry.crmStage),
      submittedAt: enquiry.submittedAt,
      paymentStatus: enquiry.paymentStatus,
    };
  }

  const registration = await getWorkshopRegistrationByIdForUser(id, userId);
  if (!registration) return null;
  // Workshop registrations don't have a CRM-style pipeline — progress/
  // next-milestone are null (not fabricated) rather than reusing the
  // enquiry pipeline, which doesn't apply here.
  return {
    kind,
    id: registration.id,
    title: registration.workshopTitle,
    projectType: "Workshop",
    statusLabel:
      registration.registrationStatus === "Waitlisted" && registration.waitingListPosition
        ? `Waitlisted (position ${registration.waitingListPosition})`
        : registration.registrationStatus,
    nextMilestoneLabel: null,
    progress: null,
    submittedAt: registration.registrationDate,
    paymentStatus: registration.paymentStatus,
  };
}

// ============================================================
// Booking Details
// ============================================================

export type WorkspaceBookingDetails = {
  service: string | null;
  location: string | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  instructors: string[];
  registrationStatus: string | null;
  waitingListPosition: number | null;
};

export async function getWorkspaceBookingDetails(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<WorkspaceBookingDetails | null> {
  if (kind === "enquiry") {
    const enquiry = await getEnquiryByIdForUser(id, userId);
    if (!enquiry) return null;
    // Location/schedule genuinely don't exist for enquiries in the
    // frozen schema — null, not invented. Real scheduling is a later
    // version (v1.2.x — Scheduling & Calendar).
    return {
      service: pathwayLabel(enquiry.service),
      location: null,
      scheduleStart: null,
      scheduleEnd: null,
      instructors: [],
      registrationStatus: null,
      waitingListPosition: null,
    };
  }

  const registration = await getWorkshopRegistrationByIdForUser(id, userId);
  if (!registration) return null;

  const workshop = await contentRepository.getWorkshopBySlug(registration.workshopSlug);
  let location: string | null = null;
  let instructors: string[] = [];
  if (workshop) {
    const [venues, allInstructors] = await Promise.all([
      contentRepository.getVenues(),
      contentRepository.getInstructors(),
    ]);
    const venue = workshop.venueId ? (venues.find((v) => v.id === workshop.venueId) ?? null) : null;
    location = venue ? (venue.addressLine ?? "Online") : null;
    instructors = allInstructors.filter((i) => workshop.instructorIds.includes(i.id)).map((i) => i.name);
  }

  return {
    service: null,
    location,
    scheduleStart: workshop?.startDate ?? null,
    scheduleEnd: workshop?.endDate ?? null,
    instructors,
    registrationStatus: registration.registrationStatus,
    waitingListPosition: registration.waitingListPosition,
  };
}

// ============================================================
// Timeline (activity_log, client-read-own since migration 0006)
// ============================================================

export type TimelineEntry = {
  id: string;
  label: string;
  timestamp: string;
};

// Curated on purpose — only actions that mean something to a client are
// shown; e.g. "enquiry.note_added" is intentionally excluded here (the
// note's content, when client-visible, belongs in the Updates tab, not
// as a content-free ping in the Timeline).
const TIMELINE_ACTION_LABELS: Record<string, (metadata: Record<string, unknown>) => string> = {
  "enquiry.stage_change": (m) => `Status updated to ${crmStageLabel(String(m.stage ?? ""))}`,
  "booking.status_change": (m) =>
    m.registrationStatus ? `Booking updated — ${String(m.registrationStatus)}` : "Booking updated",
  "deliverable.published": (m) => (m.title ? `New deliverable published — ${String(m.title)}` : "New deliverable published"),
  "project_request.decided": (m) =>
    m.status ? `Request ${String(m.status)}` : "A request was decided",
};

export async function getWorkspaceTimeline(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<TimelineEntry[]> {
  const entries: TimelineEntry[] = [];

  if (kind === "enquiry") {
    const enquiry = await getEnquiryByIdForUser(id, userId);
    if (!enquiry) return [];
    entries.push({ id: `${id}-submitted`, label: "Enquiry submitted", timestamp: enquiry.submittedAt });
  } else {
    const registration = await getWorkshopRegistrationByIdForUser(id, userId);
    if (!registration) return [];
    entries.push({ id: `${id}-registered`, label: "Registered", timestamp: registration.registrationDate });
  }

  const entityType = kind === "enquiry" ? "enquiry" : "workshop_registration";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action, metadata, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[portal] failed to load workspace timeline", error.message);
  } else {
    for (const row of data ?? []) {
      const labelFn = TIMELINE_ACTION_LABELS[row.action];
      if (!labelFn) continue;
      entries.push({
        id: row.id,
        label: labelFn((row.metadata as Record<string, unknown>) ?? {}),
        timestamp: row.created_at,
      });
    }
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ============================================================
// Updates (enquiry_notes, audience = 'client', since migration 0006)
// ============================================================

export type ClientUpdate = {
  id: string;
  authorName: string | null;
  note: string;
  createdAt: string;
};

export async function getClientUpdates(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<ClientUpdate[]> {
  // No equivalent mechanism exists for workshop registrations yet — an
  // honest empty list, not a placeholder claiming otherwise.
  if (kind !== "enquiry") return [];

  const enquiry = await getEnquiryByIdForUser(id, userId);
  if (!enquiry) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiry_notes")
    .select("id, note, created_at, profiles(full_name)")
    .eq("enquiry_id", id)
    .eq("audience", "client")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[portal] failed to load client updates", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    authorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    note: row.note,
    createdAt: row.created_at,
  }));
}

// ============================================================
// Deliverables (staff-published reference links, since migration 0007)
// ============================================================

export type ClientDeliverable = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  categoryLabel: string;
  publishedByName: string | null;
  publishedAt: string;
};

export async function getClientDeliverables(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<ClientDeliverable[]> {
  const owner =
    kind === "enquiry" ? await getEnquiryByIdForUser(id, userId) : await getWorkshopRegistrationByIdForUser(id, userId);
  if (!owner) return [];

  const entityType = kind === "enquiry" ? "enquiry" : "workshop_registration";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("id, title, description, url, thumbnail_url, published_at, deliverable_categories(label), profiles(full_name)")
    .eq("entity_type", entityType)
    .eq("entity_id", id)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[portal] failed to load deliverables", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    categoryLabel: (row.deliverable_categories as unknown as { label: string } | null)?.label ?? "Other",
    publishedByName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    publishedAt: row.published_at,
  }));
}

// ============================================================
// Requests (client-submitted, staff-decided, since migration 0008)
// ============================================================

export type ClientProjectRequest = {
  id: string;
  requestTypeLabel: string;
  status: ProjectRequestStatus;
  clientNotes: string | null;
  staffResponse: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function getClientProjectRequests(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<ClientProjectRequest[]> {
  const owner =
    kind === "enquiry" ? await getEnquiryByIdForUser(id, userId) : await getWorkshopRegistrationByIdForUser(id, userId);
  if (!owner) return [];

  const entityType = kind === "enquiry" ? "enquiry" : "workshop_registration";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_requests")
    .select("id, status, client_notes, staff_response, decided_at, created_at, request_types(label)")
    .eq("entity_type", entityType)
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[portal] failed to load project requests", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    requestTypeLabel: (row.request_types as unknown as { label: string } | null)?.label ?? "Request",
    status: row.status as ProjectRequestStatus,
    clientNotes: row.client_notes,
    staffResponse: row.staff_response,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  }));
}
