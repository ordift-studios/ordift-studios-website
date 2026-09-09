import { createAdminClient } from "@/lib/supabase/admin";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). Read-only
// listing/aggregation layer for the Admin Talent Management area
// (src/app/admin/talent/page.tsx). No internal auth gate, matching the
// established precedent (masterRegistry.ts/governanceOverview.ts) —
// the calling page is the real boundary, and every underlying table
// carries its own admin-tier-only RLS regardless.

export type TalentProfileRow = {
  profileId: string;
  name: string | null;
  memberNumber: string | null;
  status: string;
  representationStatus: string;
  publicationStatus: string;
  categories: string[];
};

// FK-disambiguation fix (2026-09-09) — `model_profiles` has three FKs
// to `profiles` (`id` — the record's own owner — plus the two
// `*_status_changed_by` audit FKs added by the TALENT-SYS migrations
// on 2026-09-08), so this embed was equally ambiguous — confirmed via
// Production runtime logs: "Could not embed because more than one
// relationship was found for 'model_profiles' and 'profiles'". The
// `!model_profiles_id_fkey` hint pins it to the owner relationship,
// the only one this query ever intended — no change to which fields
// are selected or how they're mapped.
const TALENT_PROFILE_LIST_SELECT =
  "id, status, representation_status, publication_status, profiles!model_profiles_id_fkey(full_name, member_number), talent_profile_categories(talent_categories(id, name))";

function mapTalentProfileRow(row: {
  id: string;
  status: string;
  representation_status: string;
  publication_status: string;
  profiles: unknown;
  talent_profile_categories: unknown;
}): TalentProfileRow {
  const profile = row.profiles as unknown as { full_name: string | null; member_number: string | null } | null;
  const categoryLinks = (row.talent_profile_categories as unknown as { talent_categories: { id: string; name: string } | null }[] | null) ?? [];
  return {
    profileId: row.id,
    name: profile?.full_name ?? null,
    memberNumber: profile?.member_number ?? null,
    status: row.status,
    representationStatus: row.representation_status,
    publicationStatus: row.publication_status,
    categories: categoryLinks.map((c) => c.talent_categories?.name).filter((n): n is string => Boolean(n)),
  };
}

export async function listTalentProfiles(): Promise<TalentProfileRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("model_profiles").select(TALENT_PROFILE_LIST_SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[talent] failed to list talent profiles", error.message);
    return [];
  }
  return (data ?? []).map(mapTalentProfileRow);
}

// Admin onboarding, "Add Talent" (2026-09-09) — candidates for
// createTalentProfile() (talentProfiles.ts): a profile already holding
// the existing `model` account role (granted separately, via the
// existing Users & Roles area — this module never grants roles itself)
// that doesn't yet have a model_profiles row. Read-only, no auth gate
// here either, same precedent as listTalentProfiles() above.
export type TalentOnboardingCandidate = { profileId: string; name: string | null; memberNumber: string | null };

export async function listTalentOnboardingCandidates(): Promise<TalentOnboardingCandidate[]> {
  const admin = createAdminClient();
  const [{ data: modelProfiles, error: modelRoleError }, { data: existing, error: existingError }] = await Promise.all([
    // FK-disambiguation fix (2026-09-09) — `user_roles` has two FKs to
    // `profiles` (`user_id` — membership — and `granted_by` — who
    // granted it, since migration 0001), so PostgREST can't auto-pick
    // one for this embed and was failing on every request with
    // "Could not embed because more than one relationship was found
    // for 'profiles' and 'user_roles'" (confirmed via Production
    // runtime logs) — silently swallowed into an empty candidate list
    // by the catch below, indistinguishable in the UI from "genuinely
    // no one is eligible". The `!user_roles_user_id_fkey` hint pins
    // the embed to the membership relationship, the only one this
    // query ever intended. No change to the filter/eligibility logic
    // itself — `user_id` is exactly the FK this query always meant.
    admin
      .from("profiles")
      .select("id, full_name, member_number, user_roles!user_roles_user_id_fkey!inner(roles!inner(slug))")
      .eq("user_roles.roles.slug", "model"),
    admin.from("model_profiles").select("id"),
  ]);
  if (modelRoleError || existingError) {
    console.error("[talent] failed to list onboarding candidates", modelRoleError?.message ?? existingError?.message);
    return [];
  }
  const alreadyOnboarded = new Set((existing ?? []).map((r) => r.id as string));
  return (modelProfiles ?? [])
    .filter((r) => !alreadyOnboarded.has(r.id as string))
    .map((r) => ({ profileId: r.id as string, name: (r.full_name as string | null) ?? null, memberNumber: (r.member_number as string | null) ?? null }));
}

export type TalentOpportunityRow = { id: string; title: string; status: string; categoryName: string | null; createdAt: string };

export async function listTalentOpportunitiesForAdmin(limit = 50): Promise<TalentOpportunityRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunities")
    .select("id, title, status, created_at, talent_categories(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[talent] failed to list talent opportunities", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    categoryName: (row.talent_categories as unknown as { name: string } | null)?.name ?? null,
    createdAt: row.created_at,
  }));
}

export type TalentCommercialTermsRow = { profileId: string; commissionType: string; commissionValue: string | null; currency: string | null; setAt: string | null };

export async function listTalentCommercialTermsForAdmin(): Promise<TalentCommercialTermsRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("talent_commercial_terms").select("profile_id, commission_type, commission_value, currency, set_at");
  if (error) {
    console.error("[talent] failed to list talent commercial terms", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ profileId: row.profile_id, commissionType: row.commission_type, commissionValue: row.commission_value, currency: row.currency, setAt: row.set_at }));
}

export type TalentMediaAssetRow = { id: string; profileId: string; mediaType: string; storagePath: string; caption: string | null; uploadedAt: string };

export async function listTalentMediaAssetsForAdmin(limit = 50): Promise<TalentMediaAssetRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("talent_media_assets").select("id, profile_id, media_type, storage_path, caption, uploaded_at").order("uploaded_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[talent] failed to list talent media assets", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, mediaType: row.media_type, storagePath: row.storage_path, caption: row.caption, uploadedAt: row.uploaded_at }));
}

export type TalentOverviewCounts = { totalProfiles: number; representedCount: number; categoriesCount: number; opportunitiesOpen: number; commercialTermsSetCount: number; mediaAssetsCount: number };

export async function getTalentOverviewCounts(): Promise<TalentOverviewCounts> {
  const admin = createAdminClient();
  const [{ data: profiles }, { count: categoriesCount }, { data: opportunities }, { count: termsCount }, { count: mediaCount }] = await Promise.all([
    admin.from("model_profiles").select("representation_status"),
    admin.from("talent_categories").select("id", { count: "exact", head: true }),
    admin.from("talent_opportunities").select("status"),
    admin.from("talent_commercial_terms").select("id", { count: "exact", head: true }),
    admin.from("talent_media_assets").select("id", { count: "exact", head: true }),
  ]);

  const totalProfiles = (profiles ?? []).length;
  const representedCount = (profiles ?? []).filter((p) => p.representation_status === "exclusive" || p.representation_status === "non_exclusive").length;
  const opportunitiesOpen = (opportunities ?? []).filter((o) => o.status === "open").length;

  return {
    totalProfiles,
    representedCount,
    categoriesCount: categoriesCount ?? 0,
    opportunitiesOpen,
    commercialTermsSetCount: termsCount ?? 0,
    mediaAssetsCount: mediaCount ?? 0,
  };
}

// TALENT-SYS-2B, Phase 2 (2026-09-08) — single-profile detail read for
// the per-talent admin management page (/admin/talent/[id]).
export type TalentProfileDetail = TalentProfileRow & {
  assignedCategoryIds: string[];
};

export async function getTalentProfileDetailForAdmin(profileId: string): Promise<TalentProfileDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("model_profiles").select(TALENT_PROFILE_LIST_SELECT).eq("id", profileId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[talent] failed to load talent profile detail", error.message);
    return null;
  }
  const base = mapTalentProfileRow(data);
  const categoryLinks = (data.talent_profile_categories as unknown as { talent_categories: { id: string; name: string } | null }[] | null) ?? [];
  return { ...base, assignedCategoryIds: categoryLinks.map((c) => c.talent_categories?.id).filter((id): id is string => Boolean(id)) };
}
