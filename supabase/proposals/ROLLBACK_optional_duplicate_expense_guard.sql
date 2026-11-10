-- ROLLBACK for PROPOSAL_optional_duplicate_expense_guard.sql (v2). No data change: drops the two triggers and their functions only.
begin;
drop trigger if exists entity_expenses_not_an_acquisition on public.entity_expenses;
drop trigger if exists acquisitions_not_an_expense on public.entity_equipment_acquisitions;
drop function if exists private.expense_not_an_acquisition();
drop function if exists private.acquisition_not_an_expense();
commit;
