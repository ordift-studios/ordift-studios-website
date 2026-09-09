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
//
// talent_profile_categories is deliberately NOT embedded here (see
// fetchCategoryLinksByProfileId below) — there is no FK PostgREST can
// use: talent_profile_categories.profile_id references profiles(id),
// never model_profiles(id) (confirmed by direct schema inspection).
// model_profiles.id and profiles.id share the same value — model_profiles
// itself FKs to profiles — but that's value equivalence, not a schema
// relationship between model_profiles and talent_profile_categories.
// Trying to embed it here always failed once the profiles-embed
// ambiguity above stopped masking it: "Could not find a relationship
// between 'model_profiles' and 'talent_profile_categories' in the
// schema cache" (confirmed via Production runtime logs).
const TALENT_PROFILE_SELECT =
  "id, status, representation_status, publication_status, profiles!model_profiles_id_fkey(full_name, member_number)";

type CategoryLink = { id: string; name: string };

// Fetched as its own query and joined in application code by
// profile_id/id (2026-09-09 fix) — the same "fetch separately, combine
// with a Set/Map" pattern already used for `alreadyOnboarded` in
// listTalentOnboardingCandidates() below, applied here because no FK
// path exists to embed through (see TALENT_PROFILE_SELECT's comment).
// talent_profile_categories -> talent_categories IS a real, valid,
// unambiguous FK (confirmed by schema inspection) — only the
// model_profiles side was ever the problem. `profileId` narrows to one
// profile for getTalentProfileDetailForAdmin(); omitted, it loads
// every link at once for listTalentProfiles()'s roster pass.
async function fetchCategoryLinksByProfileId(
  admin: ReturnType<typeof createAdminClient>,
  profileId?: string
): Promise<Map<string, CategoryLink[]>> {
  const base = admin.from("talent_profile_categories").select("profile_id, talent_categories(id, name)");
  const { data, error } = await (profileId ? base.eq("profile_id", profileId) : base);
  if (error) {
    console.error("[talent] failed to load talent category links", error.message);
    return new Map();
  }
  const map = new Map<string, CategoryLink[]>();
  for (const row of data ?? []) {
    const category = row.talent_categories as unknown as CategoryLink | null;
    if (!category) continue;
    const key = row.profile_id as string;
    const list = map.get(key) ?? [];
    list.push(category);
    map.set(key, list);
  }
  return map;
}

function mapTalentProfileRow(
  row: {
    id: string;
    status: string;
    representation_status: string;
    publication_status: string;
    profiles: unknown;
  },
  categories: CategoryLink[]
): TalentProfileRow {
  const profile = row.profiles as unknown as { full_name: string | null; member_number: string | null } | null;
  return {
    profileId: row.id,
    name: profile?.full_name ?? null,
    memberNumber: profile?.member_number ?? null,
    status: row.status,
    representationStatus: row.representation_status,
    publicationStatus: row.publication_status,
    categories: categories.map((c) => c.name),
  };
}

export async function listTalentProfiles(): Promise<TalentProfileRow[]> {
  const admin = createAdminClient();
  const [{ data, error }, categoryLinksByProfileId] = await Promise.all([
    admin.from("model_profiles").select(TALENT_PROFILE_SELECT).order("created_at", { ascending: false }),
    fetchCategoryLinksByProfileId(admin),
  ]);
  if (error) {
    console.error("[talent] failed to list talent profiles", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapTalentProfileRow(row, categoryLinksByProfileId.get(row.id) ?? []));
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

// Commercial Terms Admin UI (2026-09-09) — single-profile read for
// /admin/talent/[id]'s new Commercial Terms section, the same
// per-profile pattern getTalentProfileDetailForAdmin() already uses.
// notes is included here (unlike the cross-talent listTalentCommercialTermsForAdmin()
// above, which is deliberately narrower for the aggregate overview
// table) since the per-profile detail view is the one place notes are
// actually shown. commissionValue is returned as-is (Postgres numeric
// arrives as a string) — no rounding/formatting decision made here.
export type TalentCommercialTermsDetail = {
  commissionType: string;
  commissionValue: string | null;
  currency: string | null;
  notes: string | null;
  setAt: string | null;
};

export async function getCommercialTermsForProfile(profileId: string): Promise<TalentCommercialTermsDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_commercial_terms")
    .select("commission_type, commission_value, currency, notes, set_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[talent] failed to load commercial terms for profile", error.message);
    return null;
  }
  if (!data) return null;
  return { commissionType: data.commission_type, commissionValue: data.commission_value, currency: data.currency, notes: data.notes, setAt: data.set_at };
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
  const [{ data, error }, categoryLinksByProfileId] = await Promise.all([
    admin.from("model_profiles").select(TALENT_PROFILE_SELECT).eq("id", profileId).maybeSingle(),
    fetchCategoryLinksByProfileId(admin, profileId),
  ]);
  if (error || !data) {
    if (error) console.error("[talent] failed to load talent profile detail", error.message);
    return null;
  }
  const categories = categoryLinksByProfileId.get(profileId) ?? [];
  const base = mapTalentProfileRow(data, categories);
  return { ...base, assignedCategoryIds: categories.map((c) => c.id) };
}

// ============================================================
// Opportunity Candidacy Admin UI (2026-09-09) — read layer over
// talent_opportunities and the new talent_opportunity_candidates
// (migration 0075).
// ============================================================

export type TalentOpportunityDetail = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  status: string;
  createdAt: string;
};

// talent_opportunities has exactly one FK to talent_categories
// (category_id) — no ambiguity, no hint needed here (unlike the
// model_profiles/profiles embeds elsewhere in this file).
export async function getOpportunityDetailForAdmin(opportunityId: string): Promise<TalentOpportunityDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunities")
    .select("id, title, description, category_id, status, created_at, talent_categories(name)")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[talent] failed to load opportunity detail", error.message);
    return null;
  }
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    categoryId: data.category_id,
    categoryName: (data.talent_categories as unknown as { name: string } | null)?.name ?? null,
    status: data.status,
    createdAt: data.created_at,
  };
}

export type TalentOpportunityCandidateRow = { candidacyId: string; profileId: string; name: string | null; memberNumber: string | null; status: string; createdAt: string };

// FK-disambiguation reminder applied from the start this time (2026-09-09)
// — talent_opportunity_candidates has exactly one FK to model_profiles
// (profile_id), so that outer embed needs no hint, but model_profiles
// itself still has three FKs to profiles (id, representation_status_changed_by,
// publication_status_changed_by — see talentOverview.ts's own
// TALENT_PROFILE_SELECT comment for the original incident), so the
// NESTED profiles embed inside model_profiles still needs
// !model_profiles_id_fkey to avoid reproducing that exact
// "Could not embed because more than one relationship was found" error.
export async function listCandidatesForOpportunity(opportunityId: string): Promise<TalentOpportunityCandidateRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunity_candidates")
    .select("id, profile_id, status, created_at, model_profiles(profiles!model_profiles_id_fkey(full_name, member_number))")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[talent] failed to list opportunity candidates", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const modelProfile = row.model_profiles as unknown as { profiles: { full_name: string | null; member_number: string | null } | null } | null;
    return {
      candidacyId: row.id,
      profileId: row.profile_id,
      name: modelProfile?.profiles?.full_name ?? null,
      memberNumber: modelProfile?.profiles?.member_number ?? null,
      status: row.status,
      createdAt: row.created_at,
    };
  });
}

export type TalentProfileCandidacyRow = { candidacyId: string; opportunityId: string; opportunityTitle: string; status: string; createdAt: string };

// talent_opportunity_candidates has exactly one FK to talent_opportunities
// (opportunity_id) — no ambiguity, no hint needed.
export async function listCandidaciesForProfile(profileId: string): Promise<TalentProfileCandidacyRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_opportunity_candidates")
    .select("id, opportunity_id, status, created_at, talent_opportunities(title)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[talent] failed to list candidacies for profile", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    candidacyId: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: (row.talent_opportunities as unknown as { title: string } | null)?.title ?? "—",
    status: row.status,
    createdAt: row.created_at,
  }));
}

export type TalentCandidateOption = { profileId: string; name: string | null; memberNumber: string | null };

// Same "fetch separately, combine with a Set" pattern as
// listTalentOnboardingCandidates() above — every existing talent minus
// whoever is already a candidate for THIS specific opportunity, so the
// Add Candidate form only ever offers people not already added
// (duplicate protection's primary layer; the DB unique constraint,
// surfaced via addCandidateToOpportunity()'s 23505 handling, is the
// backstop).
export async function listAvailableCandidatesForOpportunity(opportunityId: string): Promise<TalentCandidateOption[]> {
  const admin = createAdminClient();
  const [{ data: allProfiles, error: profilesError }, { data: existing, error: existingError }] = await Promise.all([
    admin.from("model_profiles").select("id, profiles!model_profiles_id_fkey(full_name, member_number)"),
    admin.from("talent_opportunity_candidates").select("profile_id").eq("opportunity_id", opportunityId),
  ]);
  if (profilesError || existingError) {
    console.error("[talent] failed to list available opportunity candidates", profilesError?.message ?? existingError?.message);
    return [];
  }
  const alreadyCandidates = new Set((existing ?? []).map((r) => r.profile_id as string));
  return (allProfiles ?? [])
    .filter((r) => !alreadyCandidates.has(r.id as string))
    .map((r) => {
      const profile = r.profiles as unknown as { full_name: string | null; member_number: string | null } | null;
      return { profileId: r.id as string, name: profile?.full_name ?? null, memberNumber: profile?.member_number ?? null };
    });
}
