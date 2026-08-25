// Ordift Organizational & Administrative Architecture V1, Phase 1
// (2026-08-25). Departments and Positions are structural definitions —
// see supabase/migrations/0037_org_departments_positions.sql for the
// full design rationale. Nothing here is wired to staff_details,
// user_roles, or grade assignment yet; that's a later, separately
// authorized phase.

export type Department = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  headProfileId: string | null;
  active: boolean;
  sortOrder: number;
};

export type Position = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  departmentId: string;
  departmentName: string;
  operationalTitleId: string | null;
  operationalTitleName: string | null;
  defaultGradeId: string;
  defaultGradeName: string;
  defaultRoleSlug: string | null;
  // Ordift Organizational & Administrative Architecture V1, Phase 3
  // (2026-08-25) — see supabase/migrations/0042_phase3_callsigns_authority_reporting.sql.
  callSign: string | null;
  reportsToPositionId: string | null;
  reportsToPositionName: string | null;
  active: boolean;
  sortOrder: number;
};

// Dropdown option shapes for the Position creation form.
export type DepartmentOption = { id: string; name: string };
export type OperationalTitleOption = { id: string; name: string };
export type GradeOption = { id: string; code: string; name: string };
export type RoleOption = { slug: string; name: string };
