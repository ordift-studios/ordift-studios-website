-- PROPOSED - NOT EXECUTED. Needs the Founder's separate written approval. One row, one audit entry, all-or-nothing.
-- Purpose: ORD-QUO-2026-000006 was created from a TEST enquiry before test-inheritance shipped, so it carries is_test = false. Mark it as the test record it is.
-- Safe because: it is a DRAFT (never issued/accepted), nothing references it (no amount due, payment, amount event or agreement), and the only triggers on the table
-- are the directory-link guard (does not apply here) and updated_at. It changes no price, status, history, discount or conversion record.
begin;
do $$
declare q uuid := '900f800c-51b5-4e4b-841b-0c9fe94bd950'; e uuid := 'a0cbcb39-7798-47e2-864c-b01d02afbaff'; n int;
begin
  if not exists (select 1 from public.client_quotations where id = q and quotation_reference = 'ORD-QUO-2026-000006' and enquiry_id = e and status = 'draft' and is_test = false
                   and crew_support_request_id is null and issued_at is null and accepted_at is null) then
    raise exception 'precondition failed: the quotation is not in the expected state; nothing was changed';
  end if;
  if not exists (select 1 from public.enquiries where id = e and reference_number = 'ENQ-TEST-PERSIST-001' and is_test) then
    raise exception 'precondition failed: the enquiry is not the labelled test enquiry; nothing was changed';
  end if;
  if exists (select 1 from public.enquiries where amount_due_quotation_id = q) or exists (select 1 from public.enquiry_amount_events where quotation_id = q or quotation_before = q) then
    raise exception 'precondition failed: the quotation is referenced by an amount due; nothing was changed';
  end if;
  update public.client_quotations set is_test = true where id = q and is_test = false;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected exactly 1 row, updated %', n; end if;
  insert into public.activity_log (action, entity_type, entity_id, metadata)
  values ('client_quotation.test_flag_corrected', 'client_quotation', q::text, jsonb_build_object('reference', 'ORD-QUO-2026-000006', 'enquiry_reference', 'ENQ-TEST-PERSIST-001',
    'before', jsonb_build_object('is_test', false), 'after', jsonb_build_object('is_test', true),
    'reason', 'created from a test enquiry before test-classification inheritance was deployed (commit e6e4564)', 'authorised_by', 'Founder (written approval to be quoted here)', 'executed_by', 'Claude Code'));
end $$;
commit;
