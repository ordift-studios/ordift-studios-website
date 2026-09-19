import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";

// Workshop Learning Infrastructure V1 (2026-09-19) — against
// public.workshop_materials + the private workshop-materials Storage
// bucket (migration 0138). Visibility (admin/instructor/participant)
// is enforced HERE, server-side, before any signed URL is minted —
// never by hiding a link in the UI, and never by an authenticated
// Storage read policy (none exists for this bucket on purpose).

const BUCKET = "workshop-materials";
const SIGNED_URL_TTL_SECONDS = 300;

export type MaterialVisibility = "admin" | "instructor" | "participant";
const VISIBILITY_RANK: Record<MaterialVisibility, number> = { admin: 2, instructor: 1, participant: 0 };

export type WorkshopMaterial = {
  id: string;
  workshopId: string;
  sessionId: string | null;
  title: string;
  description: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  visibility: MaterialVisibility;
  availableFrom: string | null;
  uploadedBy: string;
  createdAt: string;
};

const SELECT = "id, workshop_id, session_id, title, description, storage_path, external_url, visibility, available_from, uploaded_by, created_at";

function mapRow(r: {
  id: string;
  workshop_id: string;
  session_id: string | null;
  title: string;
  description: string | null;
  storage_path: string | null;
  external_url: string | null;
  visibility: string;
  available_from: string | null;
  uploaded_by: string;
  created_at: string;
}): WorkshopMaterial {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    sessionId: r.session_id,
    title: r.title,
    description: r.description,
    storagePath: r.storage_path,
    externalUrl: r.external_url,
    visibility: r.visibility as MaterialVisibility,
    availableFrom: r.available_from,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

function isAvailable(m: WorkshopMaterial): boolean {
  return !m.availableFrom || m.availableFrom <= new Date().toISOString();
}

// Admin — every material for a workshop, regardless of tier/timing
// (staff need to see what's scheduled to appear later, not just what
// participants can see right now).
export async function listMaterialsForAdmin(workshopId: string): Promise<WorkshopMaterial[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_materials").select(SELECT).eq("workshop_id", workshopId).order("created_at", { ascending: false });
  if (error) {
    console.error("[workshops] failed to load materials", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

async function isEngagedOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_instructor_engagements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("workshop_id", workshopId);
  return (count ?? 0) > 0;
}

async function isRegisteredOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_registrations")
    .select("id", { count: "exact", head: true })
    .eq("workshop_id", workshopId)
    .eq("user_id", profileId)
    .neq("registration_status", "Cancelled");
  return (count ?? 0) > 0;
}

// Instructor — everything at instructor tier or wider (instructor +
// participant), for a workshop they are genuinely engaged on only.
export async function listMaterialsForInstructor(workshopId: string, actorProfileId: string): Promise<WorkshopMaterial[]> {
  if (!(await isEngagedOnWorkshop(actorProfileId, workshopId))) return [];
  const all = await listMaterialsForAdmin(workshopId);
  return all.filter((m) => VISIBILITY_RANK[m.visibility] <= VISIBILITY_RANK.instructor && isAvailable(m));
}

// Participant — participant-tier only, timing-gated, for a workshop
// they are genuinely registered on only.
export async function listMaterialsForParticipant(workshopId: string, actorProfileId: string): Promise<WorkshopMaterial[]> {
  if (!(await isRegisteredOnWorkshop(actorProfileId, workshopId))) return [];
  const all = await listMaterialsForAdmin(workshopId);
  return all.filter((m) => m.visibility === "participant" && isAvailable(m));
}

// Every download — admin, instructor, participant alike — goes through
// this one function, which re-checks visibility + ownership from
// scratch server-side before minting a short-lived signed URL. There
// is no other read path to this bucket's contents.
export async function getMaterialDownloadUrl(materialId: string, actorProfileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: material } = await admin.from("workshop_materials").select(SELECT).eq("id", materialId).maybeSingle();
  if (!material) return { ok: false, error: "Material not found." };
  const m = mapRow(material);
  if (!m.storagePath) return { ok: false, error: "This material is an external link, not a file." };

  const staffAuth = await authorizeWithSuperAdminOverride(actorProfileId, OPERATIONS_CAPABILITIES.workshopAdminister);
  const authorized =
    staffAuth.ok ||
    (m.visibility !== "admin" && (await isEngagedOnWorkshop(actorProfileId, m.workshopId))) ||
    (m.visibility === "participant" && isAvailable(m) && (await isRegisteredOnWorkshop(actorProfileId, m.workshopId)));
  if (!authorized) return { ok: false, error: "Not authorized to access this material." };

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(m.storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return { ok: false, error: "Failed to generate a download link." };
  return { ok: true, url: data.signedUrl };
}

export async function createMaterialUploadUrl(
  workshopId: string,
  filename: string,
  actorUserId: string
): Promise<{ ok: true; path: string; uploadUrl: string; token: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage this workshop's materials." };

  const admin = createAdminClient();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workshopId}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Failed to prepare the upload." };
  return { ok: true, path, uploadUrl: data.signedUrl, token: data.token };
}

export type CreateMaterialParams = {
  workshopId: string;
  sessionId?: string | null;
  title: string;
  description?: string | null;
  storagePath?: string | null;
  externalUrl?: string | null;
  visibility: MaterialVisibility;
  availableFrom?: string | null;
  actorUserId: string;
};

export async function createMaterialRecord(params: CreateMaterialParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage this workshop's materials." };
  if (!params.title.trim()) return { ok: false, error: "Title is required." };
  if (!params.storagePath && !params.externalUrl?.trim()) return { ok: false, error: "Provide an uploaded file or an external link." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_materials")
    .insert({
      workshop_id: params.workshopId,
      session_id: params.sessionId ?? null,
      title: params.title.trim(),
      description: params.description ?? null,
      storage_path: params.storagePath ?? null,
      external_url: params.externalUrl?.trim() || null,
      visibility: params.visibility,
      available_from: params.availableFrom ?? null,
      uploaded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create material", error?.message);
    return { ok: false, error: "Failed to save the material." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.material.created",
    entityType: "workshop_material",
    entityId: data.id,
    metadata: { workshopId: params.workshopId, visibility: params.visibility },
  });
  return { ok: true, id: data.id };
}

export async function deleteMaterial(materialId: string, workshopId: string, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage this workshop's materials." };

  const admin = createAdminClient();
  const { data: material } = await admin.from("workshop_materials").select("storage_path").eq("id", materialId).eq("workshop_id", workshopId).maybeSingle();
  if (!material) return { ok: false, error: "Material not found." };

  const { error } = await admin.from("workshop_materials").delete().eq("id", materialId).eq("workshop_id", workshopId);
  if (error) return { ok: false, error: "Failed to delete the material." };
  if (material.storage_path) await admin.storage.from(BUCKET).remove([material.storage_path]);

  await logActivity({ actorUserId, action: "workshop.material.deleted", entityType: "workshop_material", entityId: materialId, metadata: { workshopId } });
  return { ok: true };
}
