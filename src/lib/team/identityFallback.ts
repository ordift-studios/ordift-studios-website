// Meet the Team Admin identity fallback (2026-08-24) — replaces the
// "Unnamed account" / "No job title/department on record" wording that
// showed for any account without full internal staff data filled in
// yet. Shared by /admin/team (the curation list + "Add to Team"
// picker) and /admin/team/[id]/profile (the editor header) so both
// screens degrade the same way.
//
// Requested priority: (1) staff/internal account name, (2) the
// account/legal/profile name already on the user record. This schema
// has no field distinct from profiles.full_name for either of
// those — there's a single internal name per account, not a separate
// "staff name" vs "legal name" — so steps 1 and 2 collapse to the same
// source here. (3) their Meet the Team Public Profile display name,
// (4) their account email, (5) only if genuinely nothing exists, a
// neutral administrative label. Never "Unnamed account".
export function resolveTeamIdentityLabel(person: {
  fullName?: string | null;
  masterDisplayName?: string | null;
  email?: string | null;
}): string {
  return person.fullName || person.masterDisplayName || person.email || "Profile not completed";
}

// Job Title/Department pairing for the same screens — both when
// present, whichever one exists when only one is set, and a softer
// administrative label (replacing "No job title/department on
// record") when neither has been assigned yet. Recomputed from live
// data on every render, so assigning a Job Title/Department later in
// Users & Roles updates this automatically with no Meet the Team
// re-edit required.
export function resolveTeamRoleLabel(person: { jobTitle?: string | null; department?: string | null }): string {
  const parts = [person.jobTitle, person.department].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" · ") : "Role details not yet assigned";
}
