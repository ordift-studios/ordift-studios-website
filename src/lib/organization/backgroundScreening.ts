import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";

// Ordift Studios — Organizational Structure, Authority Grants, Staff
// Onboarding & Work Email V1 (2026-09-07), Part G — Background
// Screening. Structured status/outcome only, NEVER raw sensitive
// document content — evidence_reference is a pointer (e.g. an external
// checker's case reference), not a file. Read is Super-Admin-only at
// the RLS layer (public.background_screenings has no admin-tier
// policy at all, only super_admin) — this module's own write-path
// authorization matches that exactly, so there is no path (even a bug
// here) that could expose this to the general Admin/Staff tier: the
// database itself refuses it first.

export const BACKGROUND_SCREENING_CATEGORIES = [
  "identity_verification",
  "employment_history",
  "education",
  "professional_qualification",
  "references",
  "right_to_work",
  "role_licence",
  "criminal_history",
] as const;
export type BackgroundScreeningCategory = (typeof BACKGROUND_SCREENING_CATEGORIES)[number];

export const BACKGROUND_SCREENING_STATUSES = [
  "pending",
  "clear",
  "review_required",
  "unable_to_verify",
  "adverse_information_identified",
  "management_approved_following_review",
  "not_approved",
] as const;
export type BackgroundScreeningStatus = (typeof BACKGROUND_SCREENING_STATUSES)[number];

export type BackgroundScreening = {
  id: string;
  profileId: string;
  category: string;
  jurisdiction: string | null;
  status: string;
  evidenceReference: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  notes: string | null;
  createdAt: string;
};

const SELECT = "id, profile_id, category, jurisdiction, status, evidence_reference, decided_by, decided_at, notes, created_at";

function mapRow(r: {
  id: string;
  profile_id: string;
  category: string;
  jurisdiction: string | null;
  status: string;
  evidence_reference: string | null;
  decided_by: string | null;
  decided_at: string | null;
  notes: string | null;
  created_at: string;
}): BackgroundScreening {
  return {
    id: r.id,
    profileId: r.profile_id,
    category: r.category,
    jurisdiction: r.jurisdiction,
    status: r.status,
    evidenceReference: r.evidence_reference,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// Pure — the only automatic-rejection rule this system enforces is "no
// automatic rejection": adverse_information_identified on its own is
// NEVER treated as a decision — it always requires an explicit
// management_approved_following_review or not_approved decision from a
// human. Exported for direct unit testing.
export function requiresManagementDecision(status: BackgroundScreeningStatus | string): boolean {
  return status === "adverse_information_identified" || status === "review_required" || status === "unable_to_verify";
}

async function requireSuperAdmin(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSuperAdminId(actorUserId)) return { ok: true };
  return { ok: false, error: "Background screening is Super-Admin-only — ordinary Admin/Staff access is deliberately restricted." };
}

export async function listBackgroundScreeningsForProfile(profileId: string, actorUserId: string): Promise<BackgroundScreening[]> {
  const auth = await requireSuperAdmin(actorUserId);
  if (!auth.ok) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("background_screenings").select(SELECT).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load background_screenings", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function recordBackgroundScreening(params: {
  profileId: string;
  category: string;
  jurisdiction?: string | null;
  status: string;
  evidenceReference?: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireSuperAdmin(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const decided = params.status !== "pending";
  const { data, error } = await admin
    .from("background_screenings")
    .insert({
      profile_id: params.profileId,
      category: params.category,
      jurisdiction: params.jurisdiction ?? null,
      status: params.status,
      evidence_reference: params.evidenceReference ?? null,
      notes: params.notes ?? null,
      decided_by: decided ? params.actorUserId : null,
      decided_at: decided ? new Date().toISOString() : null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to record background_screening", error?.message);
    return { ok: false, error: "Failed to record the screening decision." };
  }

  // Sensitive — metadata deliberately excludes notes/evidenceReference
  // content, recording only the category/status transition itself.
  await logActivity({
    actorUserId: params.actorUserId,
    action: "background_screening.recorded",
    entityType: "user",
    entityId: params.profileId,
    metadata: { category: params.category, status: params.status },
  });

  return { ok: true, id: data.id };
}
