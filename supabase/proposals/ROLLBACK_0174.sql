-- Rollback for migration 0174 (entity expense entry fields). LOCAL / PROPOSED — not applied anywhere.
-- Safe only while NO expense row carries a value in the four new columns that must be kept (check first):
--   select count(*) from public.entity_expenses where reimbursement_intent <> 'to_be_confirmed' or payment_method is not null or related_reference is not null or notes is not null;
-- If that count is not 0, export those values before running this, or keep the columns and revert the application only.
alter table public.entity_expenses drop constraint if exists entity_expenses_reimbursement_consistent;
create or replace function private.entity_expenses_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_expenses is append-only: void a mistaken line instead' using errcode = '42501'; end if;
  if (new.employing_entity_id, new.expense_date, new.amount, new.currency, new.category, new.line_code, new.description, new.receipt_number, new.receipt_total,
      new.issuing_authority, new.request_reference, new.source_document_id, new.payer_as_shown, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.expense_date, old.amount, old.currency, old.category, old.line_code, old.description, old.receipt_number, old.receipt_total,
      old.issuing_authority, old.request_reference, old.source_document_id, old.payer_as_shown, old.recorded_by, old.created_at) then
    raise exception 'entity_expenses: a recorded expense cannot be edited; void it with a reason and record a correction' using errcode = '42501';
  end if;
  if old.status = 'void' then raise exception 'entity_expenses: a voided expense cannot be changed' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.entity_expenses_guard() from public;
alter table public.entity_expenses drop column if exists reimbursement_intent, drop column if exists payment_method, drop column if exists related_reference, drop column if exists notes;
