-- 0174 — what an administrator needs to record a receipt-backed cost through the platform (LOCAL, not applied to any shared database).
--
-- Adds FOUR nullable-or-defaulted columns to public.entity_expenses. No existing row changes meaning: every existing row keeps its values and gets
-- reimbursement_intent = 'to_be_confirmed' (the honest "not yet decided"), and no payment_method / related_reference / notes.
--
--   reimbursement_intent  who intends what about repayment — a RECORDED INTENTION, never an obligation. Nothing here creates a payable, loan, journal or payment.
--       not_applicable        the company account paid it, so there is nothing to repay
--       to_be_confirmed       not decided yet (the default; every existing row)
--       not_reimbursable      paid by a person who does NOT expect repayment (a non-reimbursable contribution toward the company's establishment).
--                             It is NOT a loan and NOT an increase in registered share capital: the accounting treatment stays "to be confirmed".
--       reimbursement_expected paid by a person who expects to be repaid (still only an intention: no payable is created)
--   payment_method        how it was paid, only when the receipt or the payer says so
--   related_reference     the registration / licence / contract this cost belongs to, as printed (for example "Commercial License 345520")
--   notes                 free text for the reviewer
--
-- The funding source, the reimbursement intention and the accounting classification stay THREE SEPARATE columns:
--   funding_source_status (who paid)  /  reimbursement_intent (what they expect)  /  accounting_treatment (how the company's books will treat it — still free text,
--   still 'to_be_confirmed', never finalised by this migration or by the entry form).
--
-- Guard: the new descriptive columns are fixed once recorded, like the amount and the receipt; reimbursement_intent may be set ONCE, from 'to_be_confirmed'.

alter table public.entity_expenses
  add column reimbursement_intent text not null default 'to_be_confirmed'
    check (reimbursement_intent in ('not_applicable', 'to_be_confirmed', 'not_reimbursable', 'reimbursement_expected')),
  add column payment_method text check (payment_method in ('card', 'bank_transfer', 'cash', 'other')),
  add column related_reference text check (related_reference is null or length(btrim(related_reference)) between 1 and 200),
  add column notes text check (notes is null or length(notes) <= 2000);

-- An intention has to be consistent with who paid: a company-paid cost has nothing to repay; "not reimbursable" / "expected" only make sense for a person who paid.
alter table public.entity_expenses
  add constraint entity_expenses_reimbursement_consistent check (
    case reimbursement_intent
      when 'not_applicable' then funding_source_status = 'company_account'
      when 'not_reimbursable' then funding_source_status in ('founder_personal', 'other_verified')
      when 'reimbursement_expected' then funding_source_status in ('founder_personal', 'other_verified')
      else true
    end);

comment on column public.entity_expenses.reimbursement_intent is
  'Recorded intention about repayment. NOT an obligation: no payable, loan, journal or payment is created by any value. not_reimbursable is a non-reimbursable contribution, not a loan and not an increase in registered share capital.';
comment on column public.entity_expenses.related_reference is 'The registration, licence or contract this cost belongs to, as printed (free text, not a foreign key).';

create or replace function private.entity_expenses_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_expenses is append-only: void a mistaken line instead' using errcode = '42501'; end if;
  if (new.employing_entity_id, new.expense_date, new.amount, new.currency, new.category, new.line_code, new.description, new.receipt_number, new.receipt_total,
      new.issuing_authority, new.request_reference, new.source_document_id, new.payer_as_shown, new.recorded_by, new.created_at, new.payment_method, new.related_reference, new.notes)
     is distinct from
     (old.employing_entity_id, old.expense_date, old.amount, old.currency, old.category, old.line_code, old.description, old.receipt_number, old.receipt_total,
      old.issuing_authority, old.request_reference, old.source_document_id, old.payer_as_shown, old.recorded_by, old.created_at, old.payment_method, old.related_reference, old.notes) then
    raise exception 'entity_expenses: a recorded expense cannot be edited; void it with a reason and record a correction' using errcode = '42501';
  end if;
  if old.reimbursement_intent <> 'to_be_confirmed' and new.reimbursement_intent is distinct from old.reimbursement_intent then
    raise exception 'entity_expenses: the reimbursement intention was already recorded; void the line with a reason and record a correction' using errcode = '42501';
  end if;
  if old.status = 'void' then raise exception 'entity_expenses: a voided expense cannot be changed' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.entity_expenses_guard() from public;
