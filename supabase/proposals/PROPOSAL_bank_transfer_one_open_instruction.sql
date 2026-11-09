-- PROPOSAL (NOT a numbered migration, NOT applied anywhere, NOT for Production without separate approval): a database-enforced "one OPEN bank-transfer instruction" rule.
-- Rollback: ROLLBACK_bank_transfer_one_open_instruction.sql. Read-only check to run first: DIAGNOSTIC_bank_transfer_open_instructions.sql.
--
-- THE GAP. A client who presses "I've sent this payment" starts a bank-transfer instruction (PUT /api/payments/bank-transfer/proof). The route first looks for an OPEN instruction (status 'pending', the same
-- client, record and payment type) and reuses it; if none exists it inserts one. That is select-then-insert, so two near-simultaneous requests can both find nothing and both insert, leaving two open
-- instructions that could each be paid (TD-042 recorded this as untouched). The card path closed the same gap in migration 0028 with a partial unique index; bank transfer never got one.
--
-- THE RULE (the narrowest that closes it, and exactly the key the route already reuses on). At most ONE row per (entity_type, entity_id, user_id, payment_type) may be a bank-transfer payment in status
-- 'pending'. 'pending' is the "awaiting transfer, no proof yet" state: uploading proof moves the row to 'awaiting_verification', so it leaves the index. Everything else stays legitimate:
--   * instalments and partial payments: sequential ones are fine, because the earlier one is no longer 'pending' once its proof is in (or it is verified);
--   * a retry after a rejection or an information request: those rows are not 'pending', so a fresh instruction can start;
--   * separate payment obligations: a different payment_type (deposit, partial, balance, full), a different record, or a different client is a different key;
--   * completed, failed, rejected and refunded history of any size is untouched, and so are the verification history, the completion claims, the audit entries and every existing row.
-- It does NOT assume one payment per project. It only says: you cannot have two unpaid-and-unevidenced instructions of the same kind for the same client and record at once.
--
-- COMPATIBILITY. The migration only ADDS an index, changes no row and no function. It first counts rows that would violate it and stops with a plain message BEFORE building anything; it never deletes,
-- merges or edits existing payment rows (financial records are not "cleaned up" to make a constraint pass). If the check finds duplicates they are resolved by a person, with the audit trail intact.
begin;

do $$
declare n int;
begin
  select count(*) into n from (
    select 1 from public.payments
     where payment_method = 'bank_transfer' and status = 'pending' and user_id is not null
     group by entity_type, entity_id, user_id, payment_type
    having count(*) > 1) d;
  if n > 0 then
    raise exception 'ordift:preflight_duplicate_open_bank_transfers: % group(s) of duplicate open bank-transfer instructions exist; resolve them first (see DIAGNOSTIC_bank_transfer_open_instructions.sql). Nothing was changed.', n;
  end if;
end $$;

create unique index payments_one_open_bank_transfer_instruction
  on public.payments (entity_type, entity_id, user_id, payment_type)
  where payment_method = 'bank_transfer' and status = 'pending';

comment on index public.payments_one_open_bank_transfer_instruction is
  'One OPEN (status pending, no proof yet) bank-transfer instruction per client, record and payment type. Closes the select-then-insert race in the bank-transfer start route. History and other statuses are unrestricted.';

commit;
