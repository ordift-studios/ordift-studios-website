-- ROLLBACK for PROPOSAL_equipment_acquisitions_and_financing.sql. Only safe while the four tables hold NO rows; if any exist they are financial evidence: export and get approval first.
begin;
do $$ begin
  if (select count(*) from public.entity_equipment_acquisitions) > 0 or (select count(*) from public.entity_financing_obligations) > 0
     or (select count(*) from public.entity_financing_instalments) > 0 or (select count(*) from public.entity_finance_events) > 0 then
    raise exception 'finance tables contain rows: do not roll back without exporting and approving';
  end if;
end $$;
drop trigger if exists entity_expenses_not_an_acquisition on public.entity_expenses;
drop function if exists private.expense_not_an_acquisition();
drop function if exists public.mark_instalment_paid(uuid, date, uuid, text, uuid);
drop function if exists public.record_equipment_acquisition(jsonb, uuid);
drop function if exists private.actor_is_super_admin(uuid);
drop table if exists public.entity_finance_events;
drop table if exists public.entity_financing_instalments;
drop table if exists public.entity_financing_obligations;
drop table if exists public.entity_equipment_acquisitions;
drop function if exists private.finance_events_guard();
drop function if exists private.instalments_total_check();
drop function if exists private.instalments_guard();
drop function if exists private.obligations_guard();
drop function if exists private.acquisitions_guard();
drop function if exists private.finance_doc_ok(uuid, uuid, text[]);
commit;
