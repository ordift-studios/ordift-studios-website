import { createAdminClient } from "@/lib/supabase/admin";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import type { EligiblePerson, TeamShowcaseRow, PublicProfileDetails } from "./types";

// Anyone holding one of these roles can be curated into Meet the Team
// (matches staff_details' own scope: "any internal account — staff,
// contractor, admin, super_admin — not only the staff role"). Being
// eligible never implies public visibility — see team_showcase_entries.
const ELIGIBLE_ROLES = new Set(["staff", "contractor", "admin", "super_admin"]);

// Admin -> Team's "add someone" picker. Reuses listUsersWithRoles() (the
// exact same source Users & Roles itself uses) rather than a second,
// possibly-drifting query — filtered to internal-account roles only.
export async function listEligiblePeople(): Promise<EligiblePerson[]> {
  const result = await listUsersWithRoles();
  if (!result.ok) return [];

  const eligible = result.users.filter((u) => u.roles.some((r) => ELIGIBLE_ROLES.has(r)));
  if (eligible.length === 0) return [];

  const admin = createAdminClient();
  const ids = eligible.map((u) => u.id);
  const [{ data: profiles }, { data: staffDetails }, { data: details }] = await Promise.all([
    admin.from("profiles").select("id, avatar_url").in("id", ids),
    admin.from("staff_details").select("id, department").in("id", ids),
    admin.from("public_profile_details").select("id, display_name").in("id", ids),
  ]);
  const avatarById = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url as string | null]));
  const departmentById = new Map((staffDetails ?? []).map((s) => [s.id, s.department as string | null]));
  const masterDisplayNameById = new Map((details ?? []).map((d) => [d.id, d.display_name as string | null]));

  return eligible.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    jobTitle: u.operationalTitleName,
    department: departmentById.get(u.id) ?? null,
    roles: u.roles,
    avatarUrl: avatarById.get(u.id) ?? null,
    masterDisplayName: masterDisplayNameById.get(u.id) ?? null,
  }));
}

// Admin -> Team's main list — everyone currently added to the showcase
// (visible or not), ordered exactly as they'll appear publicly.
export async function listTeamShowcaseEntries(): Promise<TeamShowcaseRow[]> {
  const admin = createAdminClient();

  const { data: entries, error } = await admin
    .from("team_showcase_entries")
    .select(
      "id, display_order, visible, is_collaborator, display_name_override, show_bio, show_department, show_specialty, show_social_handle, show_quote, show_fun_fact"
    )
    .order("display_order", { ascending: true });

  if (error || !entries) {
    console.error("[team admin] failed to load team_showcase_entries", error?.message);
    return [];
  }
  if (entries.length === 0) return [];

  const ids = entries.map((e) => e.id);
  const [{ data: profiles }, { data: details }, usersResult] = await Promise.all([
    admin.from("profiles").select("id, full_name, avatar_url, avatar_focal_x, avatar_focal_y").in("id", ids),
    admin.from("public_profile_details").select("id, display_name").in("id", ids),
    listUsersWithRoles(),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const detailsById = new Map((details ?? []).map((d) => [d.id, d]));
  const emailById = new Map(usersResult.ok ? usersResult.users.map((u) => [u.id, u.email]) : []);

  return entries.map((e): TeamShowcaseRow => {
    const profile = profileById.get(e.id);
    const detail = detailsById.get(e.id);
    return {
      id: e.id,
      displayOrder: e.display_order,
      visible: e.visible,
      isCollaborator: e.is_collaborator,
      displayNameOverride: e.display_name_override,
      showBio: e.show_bio,
      showDepartment: e.show_department,
      showSpecialty: e.show_specialty,
      showSocialHandle: e.show_social_handle,
      showQuote: e.show_quote,
      showFunFact: e.show_fun_fact,
      fullName: profile?.full_name ?? null,
      masterDisplayName: detail?.display_name ?? null,
      email: emailById.get(e.id) ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      avatarFocalX: profile?.avatar_focal_x ?? 50,
      avatarFocalY: profile?.avatar_focal_y ?? 50,
      hasPublicProfile: Boolean(detail?.display_name),
    };
  });
}

// One person's master public profile content, for the profile editor
// (Admin -> Team -> a person). Returns a blank shell (displayName
// falling back to their internal full_name as a starting suggestion,
// everything else empty) when no public_profile_details row exists yet
// — the editor form always has something sane to prefill.
export async function getPublicProfileForEdit(profileId: string): Promise<{
  details: PublicProfileDetails;
  fullName: string | null;
  masterDisplayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  avatarFocalX: number;
  avatarFocalY: number;
  jobTitle: string | null;
  department: string | null;
} | null> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, avatar_url, avatar_focal_x, avatar_focal_y")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const [{ data: detail }, { data: staff }, usersResult] = await Promise.all([
    admin
      .from("public_profile_details")
      .select("id, display_name, bio, specialty, social_handle, favorite_quote, fun_fact")
      .eq("id", profileId)
      .maybeSingle(),
    admin.from("staff_details").select("department, operational_title_id").eq("id", profileId).maybeSingle(),
    listUsersWithRoles(),
  ]);
  const email = usersResult.ok ? (usersResult.users.find((u) => u.id === profileId)?.email ?? null) : null;

  let jobTitle: string | null = null;
  if (staff?.operational_title_id) {
    const { data: title } = await admin
      .from("operational_titles")
      .select("name")
      .eq("id", staff.operational_title_id)
      .maybeSingle();
    jobTitle = title?.name ?? null;
  }

  return {
    details: {
      id: profileId,
      displayName: detail?.display_name ?? profile.full_name ?? "",
      bio: detail?.bio ?? null,
      specialty: detail?.specialty ?? null,
      socialHandle: detail?.social_handle ?? null,
      favoriteQuote: detail?.favorite_quote ?? null,
      funFact: detail?.fun_fact ?? null,
    },
    fullName: profile.full_name,
    masterDisplayName: detail?.display_name ?? null,
    email,
    avatarUrl: profile.avatar_url,
    avatarFocalX: profile.avatar_focal_x ?? 50,
    avatarFocalY: profile.avatar_focal_y ?? 50,
    jobTitle,
    department: staff?.department ?? null,
  };
}
