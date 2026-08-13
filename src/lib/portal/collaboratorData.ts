import { createClient } from "@/lib/supabase/server";
import { crmStageLabel } from "@/lib/portal/data";

// Data layer for the Contractor/Collaborator portal (migration 0009).
// Deliberately separate from src/lib/portal/workspace.ts (the Client
// Project Workspace) rather than sharing it — that file's functions
// filter explicitly by `.eq("user_id", userId)` (ownership), which
// would never match a collaborator who doesn't own the project. Here,
// every query instead relies on RLS itself (the "contractor read
// assigned" policies added in migration 0009) as the actual boundary —
// the session client already only returns what private.has_project_access()
// allows, so there's no app-level filter to get wrong or duplicate.
// This keeps the tested, shipped Client Workspace code completely
// untouched.

export type ProjectKind = "enquiry" | "workshop";

export function isProjectKind(value: string): value is ProjectKind {
  return value === "enquiry" || value === "workshop";
}

function toEntityType(kind: ProjectKind): "enquiry" | "workshop_registration" {
  return kind === "enquiry" ? "enquiry" : "workshop_registration";
}

export type MyAssignment = {
  id: string;
  kind: ProjectKind;
  entityId: string;
  label: string;
  status: string;
  roleNote: string | null;
  accessExpiresAt: string | null;
};

// Own project_assignments rows, resolved to a human label by joining
// through to whichever project table the assignment points at. Only
// 'active' assignments are surfaced — invited/completed/removed/
// withdrawn aren't things the collaborator should be acting on today.
export async function getMyActiveAssignments(userId: string): Promise<MyAssignment[]> {
  const supabase = await createClient();
  const { data: assignments, error } = await supabase
    .from("project_assignments")
    .select("id, entity_type, entity_id, status, role_note, access_expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false });

  if (error || !assignments) {
    if (error) console.error("[portal collaborator] failed to load assignments", error.message);
    return [];
  }

  const results: MyAssignment[] = [];
  for (const a of assignments) {
    const kind: ProjectKind = a.entity_type === "enquiry" ? "enquiry" : "workshop";
    let label = "Project";
    if (a.entity_type === "enquiry") {
      const { data } = await supabase
        .from("enquiries")
        .select("reference_number, service")
        .eq("id", a.entity_id)
        .maybeSingle();
      if (data) label = `${data.reference_number} — ${data.service}`;
    } else {
      const { data } = await supabase
        .from("workshop_registrations")
        .select("registration_reference, workshop_title")
        .eq("id", a.entity_id)
        .maybeSingle();
      if (data) label = `${data.registration_reference} — ${data.workshop_title}`;
    }
    results.push({
      id: a.id,
      kind,
      entityId: a.entity_id,
      label,
      status: a.status,
      roleNote: a.role_note,
      accessExpiresAt: a.access_expires_at,
    });
  }
  return results;
}

export type AssignedProjectOverview = {
  kind: ProjectKind;
  id: string;
  title: string;
  statusLabel: string;
  submittedAt: string;
};

// No userId param, unlike the Client Workspace's equivalent — RLS
// (private.has_project_access()) is the only thing deciding whether
// this returns a row at all.
export async function getAssignedProjectOverview(kind: ProjectKind, id: string): Promise<AssignedProjectOverview | null> {
  const supabase = await createClient();
  if (kind === "enquiry") {
    const { data } = await supabase
      .from("enquiries")
      .select("id, reference_number, service, crm_stage, submitted_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      kind,
      id: data.id,
      title: `${data.service} — ${data.reference_number}`,
      statusLabel: crmStageLabel(data.crm_stage),
      submittedAt: data.submitted_at,
    };
  }

  const { data } = await supabase
    .from("workshop_registrations")
    .select("id, registration_reference, workshop_title, registration_status, registration_date")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    kind,
    id: data.id,
    title: data.workshop_title,
    statusLabel: data.registration_status,
    submittedAt: data.registration_date,
  };
}

export type AssignedDeliverable = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  categoryLabel: string;
  publishedAt: string;
};

export async function getAssignedDeliverables(kind: ProjectKind, id: string): Promise<AssignedDeliverable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("id, title, description, url, published_at, deliverable_categories(label)")
    .eq("entity_type", toEntityType(kind))
    .eq("entity_id", id)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[portal collaborator] failed to load deliverables", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    categoryLabel: (row.deliverable_categories as unknown as { label: string } | null)?.label ?? "Other",
    publishedAt: row.published_at,
  }));
}

export type ProjectUpdate = {
  id: string;
  authorName: string | null;
  note: string;
  linkUrl: string | null;
  createdAt: string;
};

export async function getProjectUpdates(kind: ProjectKind, id: string): Promise<ProjectUpdate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_updates")
    .select("id, note, link_url, created_at, profiles(full_name)")
    .eq("entity_type", toEntityType(kind))
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[portal collaborator] failed to load project_updates", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    authorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    note: row.note,
    linkUrl: row.link_url,
    createdAt: row.created_at,
  }));
}
