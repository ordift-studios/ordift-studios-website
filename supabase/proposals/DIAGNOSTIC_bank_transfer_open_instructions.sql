-- READ-ONLY. Run (by a person, against the database being checked) BEFORE applying PROPOSAL_bank_transfer_one_open_instruction.sql.
-- 1. Groups that would block the new rule: more than one OPEN bank-transfer instruction for the same client, record and payment type. Expected: no rows.
select entity_type, entity_id, user_id, payment_type, count(*) as open_instructions, array_agg(record_id order by created_at) as records, min(created_at) as oldest, max(created_at) as newest
  from public.payments
 where payment_method = 'bank_transfer' and status = 'pending' and user_id is not null
 group by entity_type, entity_id, user_id, payment_type
having count(*) > 1
 order by oldest;
-- 2. For context: how many bank-transfer instructions are open right now, and how old the oldest one is.
select count(*) as open_bank_transfer_instructions, min(created_at) as oldest_open from public.payments where payment_method = 'bank_transfer' and status = 'pending';
