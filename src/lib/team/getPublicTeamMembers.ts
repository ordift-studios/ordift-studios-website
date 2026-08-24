import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicTeamMember } from "./types";

// The ONE public read path for Meet the Team (src/app/about/page.tsx).
// Deliberately uses the service-role admin client rather than a new
// `anon` grant/RLS policy — see the header comment in
// supabase/migrations/0035_public_team_profiles.sql for why. This
// function is the sole gate between that unrestricted server-side read
// and the rendered page: it must never return a field that hasn't
// passed both team_showcase_entries.visible and that entry's own
// per-field show_* flag.
//
// Separate queries joined in JS (Map lookups) rather than a PostgREST
// embed — matches the established pattern in src/lib/portal/adminData.ts
// rather than introducing a new query style for this one feature.
export async function getPublicTeamMembers(): Promise<PublicTeamMember[]> {
  const admin = createAdminClient();

  const { data: entries, error } = await admin
    .from("team_showcase_entries")
    .select(
      "id, display_order, is_collaborator, display_name_override, show_bio, show_department, show_specialty, show_social_handle, show_quote, show_fun_fact"
    )
    .eq("visible", true)
    .order("display_order", { ascending: true });

  if (error || !entries || entries.length === 0) {
    if (error) console.error("[team] failed to load team_showcase_entries", error.message);
    return [];
  }

  const ids = entries.map((e) => e.id);
  const [{ data: profiles }, { data: details }, { data: staffDetails }] = await Promise.all([
    admin.from("profiles").select("id, avatar_url, avatar_focal_x, avatar_focal_y").in("id", ids),
    admin.from("public_profile_details").select("id, display_name, bio, specialty, social_handle, favorite_quote, fun_fact").in("id", ids),
    admin.from("staff_details").select("id, department").in("id", ids),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const detailsById = new Map((details ?? []).map((d) => [d.id, d]));
  const staffById = new Map((staffDetails ?? []).map((s) => [s.id, s]));

  return entries
    .map((entry): PublicTeamMember | null => {
      const detail = detailsById.get(entry.id);
      // No master public profile filled in yet — nothing safe to show,
      // regardless of visible=true (an admin can toggle visible before
      // the profile content exists; this just quietly excludes it
      // rather than rendering an empty card).
      if (!detail?.display_name) return null;

      const profile = profileById.get(entry.id);
      const staff = staffById.get(entry.id);

      return {
        id: entry.id,
        displayName: entry.display_name_override || detail.display_name,
        avatarUrl: profile?.avatar_url ?? null,
        avatarFocalX: profile?.avatar_focal_x ?? 50,
        avatarFocalY: profile?.avatar_focal_y ?? 50,
        isCollaborator: entry.is_collaborator,
        bio: entry.show_bio ? (detail.bio ?? null) : null,
        department: entry.show_department ? (staff?.department ?? null) : null,
        specialty: entry.show_specialty ? (detail.specialty ?? null) : null,
        socialHandle: entry.show_social_handle ? (detail.social_handle ?? null) : null,
        favoriteQuote: entry.show_quote ? (detail.favorite_quote ?? null) : null,
        funFact: entry.show_fun_fact ? (detail.fun_fact ?? null) : null,
      };
    })
    .filter((m): m is PublicTeamMember => m !== null);
}
