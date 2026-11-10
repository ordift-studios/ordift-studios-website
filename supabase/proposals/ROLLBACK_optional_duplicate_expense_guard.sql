-- ROLLBACK for PROPOSAL_optional_duplicate_expense_guard.sql. No data change: drops the trigger and its function only.
begin;
drop trigger if exists entity_expenses_not_an_acquisition on public.entity_expenses;
drop function if exists private.expense_not_an_acquisition();
commit;
