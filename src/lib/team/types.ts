// Meet the Team / staff-profile integration (2026-08-24). See
// supabase/migrations/0035_public_team_profiles.sql for the schema
// this mirrors: `profiles` stays the canonical staff-identity record;
// `public_profile_details` is the master public-facing content;
// `team_showcase_entries` is the curation/visibility control surface.

// What the public About page's Meet the Team carousel actually
// receives — already curated and field-gated server-side (see
// getPublicTeamMembers.ts), so this type has no "is this allowed to
// show" flags left in it: every field present here is safe to render.
export type PublicTeamMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFocalX: number;
  avatarFocalY: number;
  isCollaborator: boolean;
  bio: string | null;
  department: string | null;
  specialty: string | null;
  socialHandle: string | null;
  favoriteQuote: string | null;
  funFact: string | null;
};

// One row in the Admin "eligible people" picker (Admin -> Team) — a
// person who could be added to Meet the Team, whether or not they
// currently are.
export type EligiblePerson = {
  id: string;
  fullName: string | null;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  roles: string[];
  avatarUrl: string | null;
  // Set only if this person already has a Meet the Team Public Profile
  // filled in before being added to the showcase — identity-fallback
  // source only (resolveTeamIdentityLabel).
  masterDisplayName: string | null;
};

// A row already added to Meet the Team, for the curation manager's own
// list — includes both the master profile content (read-only display,
// edited elsewhere) and this entry's own control fields (editable here).
export type TeamShowcaseRow = {
  id: string;
  displayOrder: number;
  visible: boolean;
  isCollaborator: boolean;
  displayNameOverride: string | null;
  showBio: boolean;
  showDepartment: boolean;
  showSpecialty: boolean;
  showSocialHandle: boolean;
  showQuote: boolean;
  showFunFact: boolean;
  // Denormalized read-only context for the manager list — sourced from
  // profiles/public_profile_details/auth, never written back from here.
  fullName: string | null;
  masterDisplayName: string | null;
  // Identity-fallback source only (resolveTeamIdentityLabel) — auth
  // email, not stored on profiles itself; fetched via listUsersWithRoles().
  email: string | null;
  avatarUrl: string | null;
  avatarFocalX: number;
  avatarFocalY: number;
  hasPublicProfile: boolean;
};

// The full editable shape of one person's public profile (Admin ->
// Team -> a person's profile page). Distinct from PublicTeamMember:
// this is the raw master content, before per-showcase field gating.
export type PublicProfileDetails = {
  id: string;
  displayName: string;
  bio: string | null;
  specialty: string | null;
  socialHandle: string | null;
  favoriteQuote: string | null;
  funFact: string | null;
};
