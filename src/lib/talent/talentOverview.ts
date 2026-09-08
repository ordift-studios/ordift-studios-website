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
  categories: string[];
};

export async function listTalentProfiles(): Promise<TalentProfileRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("model_profiles")
    .select("id, status, representation_status, profiles(full_name, member_number), talent_profile_categories(talent_categories(name))")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[talent] failed to list talent profiles", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string | null; member_number: string | null } | null;
    const categoryLinks = (row.talent_profile_categories as unknown as { talent_categories: { name: string } | null }[] | null) ?? [];
    return {
      profileId: row.id,
      name: profile?.full_name ?? null,
      memberNumber: profile?.member_number ?? null,
      status: row.status,
      representationStatus: row.representation_status,
      categories: categoryLinks.map((c) => c.talent_categories?.name).filter((n): n is string => Boolean(n)),
    };
  });
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
