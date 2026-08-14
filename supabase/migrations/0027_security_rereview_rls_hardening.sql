-- Ordift Studios — Workstream I (Security Hardening Re-Review) RLS
-- fixes (2026-08-10)
--
-- Three independent findings from a second-look security audit,
-- fixed together since they're all "policy grants a broader role than
-- the app layer intends" gaps of the same shape:
--
-- 1. bank_accounts / currencies / exchange_rates / payment_country_config
--    are writable by any plain 'staff' account via direct table
--    access (private.is_staff_or_admin() covers staff, admin, and
--    super_admin since migration 0026), but
--    src/lib/payments/paymentPermissions.ts's manage_bank_accounts/
--    manage_currencies capabilities are admin/super_admin only —
--    staff only ever gets view_all_payments/approve_bank_transfer/
--    reject_bank_transfer. bank_accounts holds live bank details shown
--    to clients for wire transfers; exchange_rates directly prices
--    every Paystack checkout. There is no app UI reachable by plain
--    staff for either table today — this was only reachable via
--    direct table/PostgREST access, not a UI bug — but the RLS policy
--    itself should match the intended boundary regardless.
--
-- 2. staff_details (grade_id, operational_title_id, department) has
--    the same staff-wide write policy from 0009, extended by 0017 to
--    cover the confidential grade_id column. 0017's own comment
--    already flagged this ("enforced at the app/API layer, narrower
--    than the existing staff-wide update grant") — this migration
--    closes that gap at the RLS layer to match.
--
-- 3. workflow_statuses' collaborator self-update policy's WITH CHECK
--    only re-verifies submitted_by = auth.uid(), not status or
--    has_workflow_access — a contractor could set status/reviewed_by/
--    reviewed_at on their own row, forging a self-approval in the
--    audit trail. Low real-world severity (Sanity's own status field,
--    not this table, is the actual publish source of truth — see
--    src/lib/admin/portfolioWorkflow.ts), but this table exists
--    specifically as an audit/metadata record and shouldn't be
--    forgeable.
--
-- No new capability/permission concept introduced — this migration
-- only makes RLS match intent already expressed in
-- paymentPermissions.ts and the 0017/0023 code comments.

begin;

-- ============================================================
-- New helper: admin or super_admin, explicitly excluding plain staff.
-- private.is_staff_or_admin() (0009, extended 0026) covers staff too,
-- so it isn't narrow enough for the policies below.
-- ============================================================
create or replace function private.is_admin_or_super_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_role('admin') or private.has_role('super_admin');
$$;

revoke all on function private.is_admin_or_super_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_admin_or_super_admin() to authenticated;

-- ============================================================
-- 1. bank_accounts / currencies / exchange_rates / payment_country_config
--    — narrow write policies to admin/super_admin only.
-- ============================================================
drop policy if exists "exchange_rates: staff insert" on public.exchange_rates;
create policy "exchange_rates: admin insert" on public.exchange_rates
  for insert to authenticated
  with check ((select private.is_admin_or_super_admin()));

drop policy if exists "currencies: staff manage" on public.currencies;
create policy "currencies: admin manage" on public.currencies
  for all to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

drop policy if exists "bank_accounts: staff manage" on public.bank_accounts;
create policy "bank_accounts: admin manage" on public.bank_accounts
  for all to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

drop policy if exists "payment_country_config: staff manage" on public.payment_country_config;
create policy "payment_country_config: admin manage" on public.payment_country_config
  for all to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

-- ============================================================
-- 2. staff_details — narrow write policies to admin/super_admin only.
-- ============================================================
drop policy if exists "staff_details: staff update" on public.staff_details;
create policy "staff_details: admin update" on public.staff_details
  for update
  to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

drop policy if exists "staff_details: staff insert" on public.staff_details;
create policy "staff_details: admin insert" on public.staff_details
  for insert
  to authenticated
  with check ((select private.is_admin_or_super_admin()));

-- ============================================================
-- 3. workflow_statuses — tighten collaborator self-update WITH CHECK
--    to re-verify status/access, not just row ownership.
-- ============================================================
drop policy if exists "workflow_statuses: assigned collaborator update own draft" on public.workflow_statuses;
create policy "workflow_statuses: assigned collaborator update own draft" on public.workflow_statuses
  for update
  to authenticated
  using (
    submitted_by = auth.uid()
    and status in ('draft', 'pending_review')
    and (select private.has_workflow_access(entity_type, entity_id))
  )
  with check (
    submitted_by = auth.uid()
    and status in ('draft', 'pending_review')
    and (select private.has_workflow_access(entity_type, entity_id))
  );

commit;
