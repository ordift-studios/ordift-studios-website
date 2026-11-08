-- PROPOSAL (NOT a numbered migration, NOT applied anywhere, OPTIONAL and independently approvable): refuse an entity_expenses line that repeats an equipment acquisition's invoice.
-- Separate from PROPOSAL_equipment_acquisitions_and_financing.sql so the Founder can approve it on its own. It DEPENDS on that proposal (it reads entity_equipment_acquisitions) and it changes the behaviour of a LIVE table
-- (entity_expenses, 0159/0174): a new before-insert trigger. Existing rows are untouched; only a new expense line with the same entity, receipt number and issuing authority as a recorded acquisition's invoice is refused.
-- Rollback: ROLLBACK_optional_duplicate_expense_guard.sql (drops the trigger and its function; no data change). Rehearsal: rehearse_optional_expense_guard.sh.

begin;

create or replace function private.expense_not_an_acquisition() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.entity_equipment_acquisitions a where a.employing_entity_id = new.employing_entity_id and a.status = 'recorded'
             and btrim(a.invoice_number) = btrim(new.receipt_number) and lower(btrim(a.supplier_name)) = lower(btrim(new.issuing_authority))) then
    raise exception 'this invoice is already recorded as an equipment acquisition; it cannot also be recorded as an expense' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function private.expense_not_an_acquisition() from public, anon, authenticated;
create trigger entity_expenses_not_an_acquisition before insert on public.entity_expenses for each row execute function private.expense_not_an_acquisition();


commit;
