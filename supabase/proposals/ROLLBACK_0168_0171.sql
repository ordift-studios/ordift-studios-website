-- FORWARD-RECOVERY / ROLLBACK for migrations 0168-0171. Run ONLY on the Founder's instruction. Reverse order; removes only what those four migrations created.
-- Refuses to run if ANY of the new tables holds a row (they are append-only audit records: once real data exists, recovery is a corrective migration, not deletion).
-- It does not touch the migration ledger: afterwards run `supabase migration repair --status reverted 0171 0170 0169 0168` (CLI) so the ledger agrees.
begin;
do $$ declare t text; n bigint; total bigint := 0; begin
  foreach t in array array['enquiry_discount_approvals','enquiry_price_communications','enquiry_followups','enquiry_conversions','portfolio_candidates','portfolio_collections','portfolio_collection_items','marketing_permission_requests','marketing_permission_records','portfolio_internal_reviews','portfolio_use_events'] loop
    execute format('select count(*) from public.%I', t) into n; total := total + n;
  end loop;
  if total > 0 then raise exception 'rollback refused: the new tables hold % row(s)', total; end if;
end $$;
-- 0171
drop view if exists public.portfolio_uses_needing_review;
drop function if exists public.portfolio_standing(uuid[]);
drop function if exists public.portfolio_use_eligibility(uuid, text, date);
drop table if exists public.portfolio_use_events, public.portfolio_internal_reviews;
drop function if exists private.portfolio_review_guard(), private.portfolio_use_guard();
-- 0170
drop function if exists public.marketing_permission_state(uuid, text, date);
drop table if exists public.marketing_permission_records, public.marketing_permission_requests;
drop function if exists private.marketing_permission_guard(), private.marketing_permission_after(), private.marketing_permission_request_guard(), private.destination_usage_right(text);
-- 0169
drop table if exists public.portfolio_collection_items, public.portfolio_collections, public.portfolio_candidates;
drop function if exists private.portfolio_collection_item_guard(), private.job_reference(text, uuid), private.project_file_job(uuid), private.is_portfolio_authority(uuid), private.portfolio_append_only();
-- 0168
drop function if exists public.reschedule_enquiry_followup(uuid, timestamptz, uuid, text, uuid);
drop table if exists public.enquiry_conversions, public.enquiry_followups, public.enquiry_price_communications, public.enquiry_discount_approvals;
drop function if exists private.enquiry_comm_before_insert(), private.enquiry_append_only(), private.enquiry_discount_guard(), private.enquiry_followup_guard();
commit;
