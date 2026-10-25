-- PROPOSED - NOT EXECUTED. Needs the Founder's separate written approval AND a fresh verified backup immediately before (R8). All-or-nothing in ONE transaction.
-- Removes ONLY the records created by the persistent-enquiries test: enquiry ENQ-TEST-PERSIST-001 and what hangs off it. It refuses to run unless every precondition matches the inventory.
-- The communication, discount, follow-up and conversion tables are append-only by trigger, so each guard trigger is disabled ONLY for the specific delete and re-enabled before the end;
-- the block verifies all of them are enabled again, and any error rolls everything back (including the trigger changes). The audit log is never touched: a full JSON snapshot of
-- every removed row is written into it first, so the evidence outlives the records. The quotation sequence is NOT reset (ORD-QUO-2026-000006 stays a documented gap).
begin;
do $$
declare
  e uuid := 'a0cbcb39-7798-47e2-864c-b01d02afbaff'; q uuid := '900f800c-51b5-4e4b-841b-0c9fe94bd950'; snap jsonb; n int; bad int;
begin
  -- 1. preconditions: exactly the inventoried records, nothing else attached, nothing financial
  if not exists (select 1 from public.enquiries where id = e and reference_number = 'ENQ-TEST-PERSIST-001' and is_test and amount_due is null and amount_paid is null and crm_stage = 'new_lead' and user_id is null and contact_id is null and organisation_id is null) then raise exception 'precondition: enquiry is not the untouched labelled test enquiry'; end if;
  if (select count(*) from public.client_quotations where enquiry_id = e) <> 1 or not exists (select 1 from public.client_quotations where id = q and quotation_reference = 'ORD-QUO-2026-000006' and status = 'draft' and issued_at is null and accepted_at is null and crew_support_request_id is null) then raise exception 'precondition: quotation set differs from the inventory'; end if;
  if (select count(*) from public.client_quotation_items where quotation_id = q) <> 1 then raise exception 'precondition: item count differs'; end if;
  if (select count(*) from public.enquiry_price_communications where enquiry_id = e) <> 3 or (select count(*) from public.enquiry_discount_approvals where enquiry_id = e) <> 1
     or (select count(*) from public.enquiry_conversions where enquiry_id = e) <> 1 or (select count(*) from public.enquiry_followups where enquiry_id = e) > 1 then raise exception 'precondition: persistent-enquiry record counts differ'; end if;
  if (select count(*) from public.payments where entity_id::text = e::text) + (select count(*) from public.enquiry_amount_events where enquiry_id = e) + (select count(*) from public.enquiry_notes where enquiry_id = e)
     + (select count(*) from public.crew_support_requests where enquiry_id = e) + (select count(*) from public.enquiries where amount_due_quotation_id = q) <> 0 then raise exception 'precondition: something financial or operational references these records'; end if;
  if exists (select 1 from public.agreements where primary_context_reference in ('ENQ-TEST-PERSIST-001', 'ORD-QUO-2026-000006')) then raise exception 'precondition: an agreement references these records'; end if;

  -- 2. evidence first: a complete snapshot of what is about to be removed, kept in the audit log
  snap := jsonb_build_object(
    'enquiry', (select to_jsonb(x) from public.enquiries x where id = e),
    'quotation', (select to_jsonb(x) from public.client_quotations x where id = q),
    'quotation_items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.client_quotation_items x where quotation_id = q),
    'price_communications', (select coalesce(jsonb_agg(to_jsonb(x) order by revision_number), '[]') from public.enquiry_price_communications x where enquiry_id = e),
    'discount_approvals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.enquiry_discount_approvals x where enquiry_id = e),
    'conversions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.enquiry_conversions x where enquiry_id = e),
    'followups', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.enquiry_followups x where enquiry_id = e));
  insert into public.activity_log (action, entity_type, entity_id, metadata)
  values ('test_records.removed', 'enquiry', e::text, jsonb_build_object('purpose', 'removal of the persistent-enquiries test records', 'authorised_by', 'Founder (written approval to be quoted here)', 'executed_by', 'Claude Code', 'snapshot', snap));

  -- 3. remove, children first; guard triggers disabled only for these tables, only inside this transaction
  alter table public.enquiry_conversions disable trigger enquiry_conversion_append_only;
  alter table public.enquiry_price_communications disable trigger enquiry_comm_append_only;
  alter table public.enquiry_discount_approvals disable trigger enquiry_discount_no_delete;
  alter table public.enquiry_followups disable trigger enquiry_followup_no_delete;
  delete from public.enquiry_conversions where enquiry_id = e;
  delete from public.enquiry_price_communications where enquiry_id = e;
  delete from public.enquiry_discount_approvals where enquiry_id = e;
  delete from public.enquiry_followups where enquiry_id = e;
  delete from public.client_quotations where id = q and status = 'draft';     -- its items go with it (on delete cascade)
  delete from public.enquiries where id = e and is_test;
  alter table public.enquiry_conversions enable trigger enquiry_conversion_append_only;
  alter table public.enquiry_price_communications enable trigger enquiry_comm_append_only;
  alter table public.enquiry_discount_approvals enable trigger enquiry_discount_no_delete;
  alter table public.enquiry_followups enable trigger enquiry_followup_no_delete;

  -- 4. postconditions: gone, and every guard is enabled again
  select (select count(*) from public.enquiries where id = e) + (select count(*) from public.client_quotations where id = q) + (select count(*) from public.client_quotation_items where quotation_id = q)
       + (select count(*) from public.enquiry_price_communications where enquiry_id = e) + (select count(*) from public.enquiry_discount_approvals where enquiry_id = e)
       + (select count(*) from public.enquiry_conversions where enquiry_id = e) + (select count(*) from public.enquiry_followups where enquiry_id = e) into n;
  if n <> 0 then raise exception 'postcondition: % record(s) remain', n; end if;
  select count(*) into bad from pg_trigger where tgname in ('enquiry_conversion_append_only','enquiry_comm_append_only','enquiry_discount_no_delete','enquiry_followup_no_delete') and not tgisinternal and tgenabled <> 'O';
  if bad <> 0 or (select count(*) from pg_trigger where tgname in ('enquiry_conversion_append_only','enquiry_comm_append_only','enquiry_discount_no_delete','enquiry_followup_no_delete') and tgenabled = 'O') <> 4 then raise exception 'postcondition: a guard trigger is not enabled again'; end if;
end $$;
commit;
