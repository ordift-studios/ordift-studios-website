-- Ordift Organizational & Administrative Architecture V1, Phase 3
-- (2026-08-25): Leadership Call Signs, Executive Admin / authorization
-- layer, and the reporting-line foundation.
--
-- Purely additive. No existing table, column, policy, RLS helper
-- function, or roles/user_roles row is altered — the mature role/RLS
-- system from 0001-0027 is untouched. `roles`/`user_roles`/
-- `private.has_role()` remain the sole source of system permissions;
-- everything in this migration is either (a) descriptive metadata that
-- resolves from an existing Position, or (b) a new, separate,
-- additive authority layer that specific new code paths consult
-- explicitly — nothing here is wired into an existing RLS policy.
--
-- ============================================================
-- PART A — Leadership Call Signs
-- ============================================================
-- Attached directly to positions, not to individual people — "Person ->
-- Position -> Call Sign" is achieved for free via the existing
-- staff_details.position_id FK (no new join table needed). A person's
-- displayed Call Sign is simply their current Position's call_sign,
-- resolved the same way Grade/Department already are. Historical audit
-- rows already record position_id/position name at the time of a
-- position.assigned/position.changed event (Phase 2), so "what Call
-- Sign did this person hold on this date" remains answerable from
-- activity_log without any new column there.
--
-- IMPORTANT — only 5 of the 10 approved Call Signs are seeded here.
-- Cross-checked against the exhaustive, approved 39-Position catalogue
-- (0039_seed_org_departments_positions.sql): Group CEO/CHIEF, COO/PRIME,
-- Director-Creative&Production/MAESTRO, Director-Client-Marketing-
-- Commercial/ENVOY, and Director-Talent&Model-Management/CURATOR all
-- have an exact or unambiguous existing Position match. The other 5 —
-- CFO/VAULT, Chief Strategy Officer/ARCHITECT, Chief People-HR
-- Officer/PULSE, CTO/GEEK, and Director-Executive&Administration/
-- CHANCELLOR — have NO corresponding Position anywhere in the approved
-- catalogue (Executive & Administration's ladder is Founder&CEO -> COO
-- -> Administrative/Operations Manager, with no G8 Director tier; no
-- CFO/CSO/CPO/CTO position exists in any department). Per explicit
-- instruction not to duplicate/redesign the approved org catalogue
-- without separate authorization, and to stop and report rather than
-- guess, this migration does NOT create new Positions to force-fit
-- these 5 Call Signs, and does NOT attach them to a mismatched existing
-- Position. See the Phase 3 report for the explicit stop-and-report on
-- this. The column and constraint below are fully generic — attaching
-- the remaining 5 later is a one-line UPDATE once the corresponding
-- Positions are approved and created, no schema change needed.
alter table public.positions
  add column if not exists call_sign text;

comment on column public.positions.call_sign is
  'Approved internal leadership Call Sign for this Position (e.g. CHIEF, PRIME) — resolves automatically to whoever holds the Position via staff_details.position_id. Admin-controlled (same RLS as the rest of this table), never self-assigned. Grants zero permissions, authority, Grade, pay, staff number, or system role — display metadata only. See Ordift Organizational & Administrative Architecture V1, Phase 3, Part A.';

create unique index if not exists positions_call_sign_unique
  on public.positions (business_id, call_sign)
  where call_sign is not null;

update public.positions p set call_sign = v.call_sign
from (values
  ('founder-ceo', 'CHIEF'),
  ('chief-operating-officer-coo', 'PRIME'),
  ('creative-director', 'MAESTRO'),
  ('commercial-marketing-director', 'ENVOY'),
  ('talent-model-management-director', 'CURATOR')
) as v(position_slug, call_sign)
where p.slug = v.position_slug
  and p.call_sign is distinct from v.call_sign;

-- ============================================================
-- PART C — Reporting hierarchy
-- ============================================================
-- Two-column design, mirroring the existing Grade pattern exactly:
--   - positions.reports_to_position_id: the STRUCTURAL/default chain,
--     defined once on the org chart itself. Self-referencing, nullable
--     (the top of the chain, and any position deliberately left
--     unstructured, has no value here). Works even when a position has
--     no current occupant — "Empty leadership Positions must not break
--     the system" is satisfied by construction: the chain is a property
--     of the Position, not of any person.
--   - staff_details.manager_id: the actual resolved direct manager for
--     a real person — normally auto-resolved from their Position's
--     reports_to_position_id by finding whoever currently occupies that
--     position (see assignStaffPosition() in
--     src/lib/organization/assignPosition.ts, extended in this phase),
--     staying null if that position currently has no occupant. A
--     genuine FK to profiles, not a computed view, so it can be
--     corrected by hand for real-world exceptions the structural chain
--     doesn't cover (exactly like grade_id). Deliberately NOT
--     auto-cascaded when a person elsewhere in the chain changes
--     position — see the Phase 3 report's deferred-items section.
-- No existing staff_details row is touched by this migration — zero
-- rows currently have position_id set (confirmed live in Production at
-- the start of Phase 3), so every new column starts null for everyone.
alter table public.positions
  add column if not exists reports_to_position_id uuid references public.positions (id);

comment on column public.positions.reports_to_position_id is
  'Structural reporting chain — the Position this Position reports to, independent of who (if anyone) currently occupies either. Null at the top of the chain (Founder & CEO) and for any Position deliberately left unstructured. See Ordift Organizational & Administrative Architecture V1, Phase 3, Part C.';

alter table public.staff_details
  add column if not exists manager_id uuid references public.profiles (id);

comment on column public.staff_details.manager_id is
  'This person''s resolved direct manager — normally auto-resolved from positions.reports_to_position_id whenever this person''s position_id is assigned/changed (see assignStaffPosition()), null if the reporting position currently has no occupant. A real, persisted, admin-correctable value, not a live-computed one — mirrors grade_id''s "usually derived, but a genuine column" pattern.';

-- Approved default reporting chain for the 39-Position catalogue,
-- matching the given example exactly (Photographer -> Manager/
-- Supervisor -> Director -> COO -> Group CEO). Idempotent, slug-matched.
-- This writes only to positions.reports_to_position_id — no
-- staff_details row is touched (nobody currently occupies any
-- Position), so no real person's manager_id changes as a result of
-- this migration.
update public.positions p set reports_to_position_id = parent.id
from (values
  -- Executive & Administration: CEO (top) -> COO -> Manager -> Officer -> Assistant
  ('chief-operating-officer-coo', 'founder-ceo'),
  ('administrative-operations-manager', 'chief-operating-officer-coo'),
  ('administrative-officer', 'administrative-operations-manager'),
  ('administrative-assistant', 'administrative-officer'),
  -- Creative & Production: COO -> Creative Director -> Studio/Production Manager -> Production Supervisor -> everyone else
  ('creative-director', 'chief-operating-officer-coo'),
  ('studio-production-manager', 'creative-director'),
  ('production-supervisor', 'studio-production-manager'),
  ('senior-photographer', 'production-supervisor'),
  ('senior-videographer', 'production-supervisor'),
  ('senior-retoucher-editor', 'production-supervisor'),
  ('photographer', 'production-supervisor'),
  ('videographer', 'production-supervisor'),
  ('retoucher-photo-editor', 'production-supervisor'),
  ('video-editor', 'production-supervisor'),
  ('junior-photographer', 'production-supervisor'),
  ('junior-videographer', 'production-supervisor'),
  ('junior-editor-retoucher', 'production-supervisor'),
  ('studio-production-assistant', 'production-supervisor'),
  ('creative-production-intern', 'production-supervisor'),
  -- Client, Marketing & Commercial: COO -> Director -> Client & Marketing Manager -> Client Services Supervisor -> everyone else
  ('commercial-marketing-director', 'chief-operating-officer-coo'),
  ('client-marketing-manager', 'commercial-marketing-director'),
  ('client-services-supervisor', 'client-marketing-manager'),
  ('senior-client-relations-officer', 'client-services-supervisor'),
  ('business-development-officer', 'client-services-supervisor'),
  ('client-relations-officer', 'client-services-supervisor'),
  ('marketing-communications-officer', 'client-services-supervisor'),
  ('social-media-content-officer', 'client-services-supervisor'),
  ('junior-client-services-officer', 'client-services-supervisor'),
  ('client-services-assistant', 'client-services-supervisor'),
  ('marketing-commercial-intern', 'client-services-supervisor'),
  -- Talent & Model Management: COO -> Director -> Talent Manager -> everyone else (no G6 Supervisor tier exists here)
  ('talent-model-management-director', 'chief-operating-officer-coo'),
  ('talent-manager', 'talent-model-management-director'),
  ('senior-talent-coordinator', 'talent-manager'),
  ('talent-model-coordinator', 'talent-manager'),
  ('talent-scout', 'talent-manager'),
  ('junior-talent-coordinator', 'talent-manager'),
  ('talent-assistant', 'talent-manager'),
  ('talent-management-intern', 'talent-manager')
) as v(position_slug, parent_slug)
join public.positions parent on parent.slug = v.parent_slug
where p.slug = v.position_slug
  and p.reports_to_position_id is distinct from parent.id;

-- ============================================================
-- PART B/D — Authority grants (Executive Admin, Director-tier scoped
-- authority, and time-bound delegation, unified under one table)
-- ============================================================
-- Deliberately NOT a new `roles`/`user_roles` row and NOT a new RLS
-- policy retrofitted onto any existing table. Investigation (see the
-- Phase 3 report) found the existing WorkflowCapabilityMatrix is keyed
-- purely by RoleSlug with no per-user grant path, and confirmed which
-- specific RLS policies are genuinely Super-Admin-only today
-- (operational_titles/engagement_types/grades/member_number_classifications
-- writes, and reading others' notification_preferences) — none of
-- those are touched here, so Executive Admin does not automatically
-- inherit them. This table is a wholly new, additive authority layer
-- that new code explicitly consults (private.is_executive_admin(),
-- private.has_authority()) — the existing mature role/RLS system is
-- completely unchanged and continues to work exactly as before whether
-- or not this table has any rows in it.
--
-- One table serves three related concepts because they share the exact
-- same shape (grantor, recipient, a named authority, optional scope,
-- reason, optional expiry, revocable, audited):
--   - Executive Admin: authority = 'executive_admin', scope_department_id
--     null (global), expires_at null (standing until revoked).
--   - Director-tier scoped authority: authority = 'department_admin',
--     scope_department_id set, expires_at null (standing until revoked).
--   - Temporary delegation (Part 6): authority = any specific capability
--     name (e.g. 'approve_bank_transfer'), expires_at set, reason
--     required at the application layer.
-- `authority` is free-form text, not a DB enum/check constraint — same
-- precedent as activity_log.action (63+ distinct strings, unconstrained,
-- validated in application code) rather than creating a second,
-- hardcoded source of truth that could drift from the growing
-- WorkflowCapability TS union.
--
-- Rows are never deleted, even after revocation or expiry — permanent
-- historical record, same "never delete, only mark inactive" principle
-- already established for member_numbers/activity_log.
create table public.authority_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  authority text not null,
  scope_department_id uuid references public.departments (id),
  granted_by uuid not null references public.profiles (id),
  granted_at timestamptz not null default now(),
  reason text,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_reason text,
  created_at timestamptz not null default now()
);

comment on table public.authority_grants is
  'Additive authority layer above roles/user_roles — never a substitute for them. Represents standing Executive Admin authority, standing Director-tier department-scoped authority, and time-bound delegations under one shape. A row here never changes anyone''s Grade, Position, staff/member number, or roles/user_roles membership. See Ordift Organizational & Administrative Architecture V1, Phase 3, Parts B and D.';
comment on column public.authority_grants.authority is
  'Free-form, application-validated (not a DB enum) — ''executive_admin'', ''department_admin'', or any specific capability name being delegated. Same precedent as activity_log.action.';
comment on column public.authority_grants.scope_department_id is
  'Null = global (e.g. executive_admin). Set = scoped to one department (e.g. a Director''s standing department_admin authority, or a delegation limited to one department).';
comment on column public.authority_grants.expires_at is
  'Null = standing, active until explicitly revoked (Executive Admin, Director-tier authority). Set = a time-bound delegation (Part 6) that lapses automatically at this timestamp without requiring an explicit revoke.';

create index authority_grants_profile_id_idx on public.authority_grants (profile_id);
create index authority_grants_active_idx on public.authority_grants (profile_id, authority) where revoked_at is null;

alter table public.authority_grants enable row level security;

-- Read: a person can see their own grants (so the UI can show "you hold
-- Executive Admin"); admin/super_admin can see everyone's, matching the
-- same tier as reading Grade. No policy at all for insert/update/delete
-- — every write goes through service-role application code (see
-- src/app/admin/authority/actions.ts), same "never a direct
-- authenticated write" pattern already used for positions/departments/
-- member_numbers, so the invariants above (never touching Grade/
-- Position/roles) can't be bypassed by a direct table write.
create policy "authority_grants: read own or admin" on public.authority_grants
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.authority_grants to authenticated;
grant select, insert, update, delete on public.authority_grants to service_role;

-- ============================================================
-- Helper functions — additive, consulted only by new code. Never
-- referenced by any existing RLS policy in this migration.
-- ============================================================
create or replace function private.has_authority(p_authority text, p_department_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.authority_grants
    where profile_id = auth.uid()
      and authority = p_authority
      and (scope_department_id is null or scope_department_id = p_department_id)
      and revoked_at is null
      and effective_at <= now()
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function private.has_authority(text, uuid) from public;
revoke all on function private.has_authority(text, uuid) from anon;
grant execute on function private.has_authority(text, uuid) to authenticated;
grant execute on function private.has_authority(text, uuid) to service_role;

create or replace function private.is_executive_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_authority('executive_admin', null);
$$;

revoke all on function private.is_executive_admin() from public;
revoke all on function private.is_executive_admin() from anon;
grant execute on function private.is_executive_admin() to authenticated;
grant execute on function private.is_executive_admin() to service_role;

comment on function private.has_authority(text, uuid) is
  'Checks for an active (not revoked, not expired, already effective) authority_grants row for the calling user. p_department_id null checks only for a global grant; a non-null value also matches a department-scoped grant for that specific department. Additive — not referenced by any existing RLS policy.';
comment on function private.is_executive_admin() is
  'Shorthand for private.has_authority(''executive_admin'', null) — a global, standing grant. See Ordift Organizational & Administrative Architecture V1, Phase 3, Part B.';
