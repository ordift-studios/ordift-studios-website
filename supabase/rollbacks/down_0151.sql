-- ROLLBACK for migration 0151 (Direct Bank Transfer). NOT a migration: lives outside supabase/migrations.
-- Run manually in one transaction only if 0151 must be backed out, then:
--   supabase migration repair --status reverted 0151
-- GUARDS: refuses to run if any bank-transfer evidence/verification, receiving-account link, non-Ghana
-- bank account or enquiry payment market exists (it would be destroyed). A code-only problem needs
-- no SQL: roll the Vercel deployment back instead (old code ignores the new columns).
begin;
do $$
begin
  if exists (select 1 from public.bank_transfer_verifications) then raise exception 'Refusing: bank_transfer_verifications has rows'; end if;
  if exists (select 1 from public.payments where receiving_bank_account_id is not null or client_bank_reference is not null or status = 'additional_info_required') then
    raise exception 'Refusing: payments carry bank-transfer data from 0151'; end if;
  if exists (select 1 from public.enquiries where payment_country is not null) then raise exception 'Refusing: enquiries.payment_country is in use'; end if;
  if exists (select 1 from public.bank_accounts where country <> 'GH' or created_by is not null or activation_confirmed_at is not null) then
    raise exception 'Refusing: bank accounts created/activated through 0151 exist'; end if;
end $$;

drop policy if exists "payment-proofs: owner or super admin read" on storage.objects;
create policy "payment-proofs: owner or staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and ((select private.is_staff_or_admin()) or exists (
    select 1 from public.payments where payments.id::text = (storage.foldername(name))[1] and payments.user_id = auth.uid())));

delete from public.payment_country_config where country = 'QA' and gateway_provider = 'bank_transfer' and not is_active;
alter table public.enquiries drop column if exists payment_country;
drop function if exists public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean);
drop function if exists private.can_verify_bank_transfers(uuid);
drop table if exists public.bank_transfer_verifications;
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('pending', 'awaiting_verification', 'completed', 'failed', 'refunded', 'rejected'));
alter table public.payments drop column if exists receiving_bank_account_id, drop column if exists receiving_account_snapshot,
  drop column if exists client_bank_reference, drop column if exists client_transfer_date, drop column if exists client_visible_note;

drop policy if exists "bank_accounts: super admin read" on public.bank_accounts;
drop index if exists public.bank_accounts_one_default_per_market;
alter table public.bank_accounts drop constraint if exists bank_accounts_active_requires_confirmation, drop constraint if exists bank_accounts_default_requires_active, drop constraint if exists bank_accounts_personal_requires_basis;
alter table public.bank_accounts drop column if exists account_classification, drop column if exists is_default, drop column if exists activation_confirmed_by,
  drop column if exists activation_confirmed_at, drop column if exists activation_basis, drop column if exists deactivated_at, drop column if exists created_by, drop column if exists updated_by;
alter table public.bank_accounts alter column is_active set default true;
create policy "bank_accounts: readable by authenticated" on public.bank_accounts for select to authenticated using (is_active);
create policy "bank_accounts: admin manage" on public.bank_accounts for all to authenticated
  using ((select private.is_admin_or_super_admin())) with check ((select private.is_admin_or_super_admin()));
grant insert, update, delete on public.bank_accounts to authenticated;
commit;
