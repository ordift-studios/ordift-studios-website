import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { isValidRepresentationTransition, type RepresentationStatus } from "./talentRepresentation";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). DB-backed
// representation-state and category-assignment layer. Gated by the
// new, DORMANT talent.* capabilities — zero authority_grants rows
// exist for any of them in Production, so Super Admin is the only
// actor who can pass today (authorizeWithSuperAdminOverride()).

async function requireProfileAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.profileAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent profiles." };
  return { ok: true };
}

async function requireRepresentationAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.representationAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent representation." };
  return { ok: true };
}

// Atomic compare-and-swap — same idempotency pattern used throughout
// this codebase (transitionAgreementStatus(), advanceOnboardingStage(),
// etc.).
export async function setRepresentationStatus(params: {
  profileId: string;
  toStatus: RepresentationStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireRepresentationAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("model_profiles").select("id, representation_status").eq("id", params.profileId).maybeSingle();
  if (!existing) return { ok: false, error: "No model profile exists for this person yet." };

  const fromStatus = existing.representation_status as RepresentationStatus;
  if (!isValidRepresentationTransition(fromStatus, params.toStatus)) {
    return { ok: false, error: `Cannot move representation status from "${fromStatus}" to "${params.toStatus}".` };
  }

  const { error } = await admin
    .from("model_profiles")
    .update({ representation_status: params.toStatus, representation_status_changed_at: new Date().toISOString(), representation_status_changed_by: params.actorUserId })
    .eq("id", params.profileId)
    .eq("representation_status", fromStatus);
  if (error) {
    console.error("[talent] failed to transition representation status", error.message);
    return { ok: false, error: "Failed to update representation status." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "talent.representation.status_changed",
    entityType: "model_profile",
    entityId: params.profileId,
    metadata: { fromStatus, toStatus: params.toStatus },
  });

  return { ok: true };
}

export type TalentCategory = { id: string; slug: string; name: string; active: boolean; sortOrder: number };

export async function listTalentCategories(): Promise<TalentCategory[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("talent_categories").select("id, slug, name, active, sort_order").order("sort_order", { ascending: true });
  if (error) {
    console.error("[talent] failed to list talent categories", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, name: r.name, active: r.active, sortOrder: r.sort_order }));
}

// Adds a new category to the lookup — never seeds a default taxonomy;
// every row reflects a real classification an administrator entered.
export async function createTalentCategory(params: { slug: string; name: string; actorUserId: string }): Promise<{ ok: true; categoryId: string } | { ok: false; error: string }> {
  const auth = await requireProfileAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin.from("talent_categories").insert({ slug: params.slug, name: params.name }).select("id").single();
  if (error || !data) {
    console.error("[talent] failed to create talent category", error?.message);
    return { ok: false, error: "Failed to create the talent category." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.category.created", entityType: "talent_category", entityId: data.id, metadata: { slug: params.slug, name: params.name } });
  return { ok: true, categoryId: data.id };
}

export async function assignTalentCategory(params: { profileId: string; categoryId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireProfileAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("talent_profile_categories").insert({ profile_id: params.profileId, category_id: params.categoryId, created_by: params.actorUserId });
  if (error) {
    console.error("[talent] failed to assign talent category", error.message);
    return { ok: false, error: "Failed to assign the category." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.category.assigned", entityType: "profile", entityId: params.profileId, metadata: { categoryId: params.categoryId } });
  return { ok: true };
}

export async function removeTalentCategory(params: { profileId: string; categoryId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireProfileAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("talent_profile_categories").delete().eq("profile_id", params.profileId).eq("category_id", params.categoryId);
  if (error) {
    console.error("[talent] failed to remove talent category", error.message);
    return { ok: false, error: "Failed to remove the category." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.category.removed", entityType: "profile", entityId: params.profileId, metadata: { categoryId: params.categoryId } });
  return { ok: true };
}
