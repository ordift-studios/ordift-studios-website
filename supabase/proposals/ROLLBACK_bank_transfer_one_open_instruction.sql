-- ROLLBACK for PROPOSAL_bank_transfer_one_open_instruction.sql. Drops only the index it added. No row, function or audit record is touched.
begin;
drop index if exists public.payments_one_open_bank_transfer_instruction;
commit;
