-- READ-ONLY. Run (by a person, against the database being checked) BEFORE applying PROPOSAL_card_gateway_reference_unique.sql.
-- 1. Card references used by more than one row. Expected: no rows.
select provider, gateway_reference, count(*) as rows, array_agg(record_id order by created_at) as records, array_agg(status order by created_at) as statuses
  from public.payments where payment_method = 'gateway' and gateway_reference is not null group by provider, gateway_reference having count(*) > 1;
-- 2. For context: bank-transfer rows that carry a bank reference in gateway_reference (written before bank_transaction_reference existed). These stay as they are.
select count(*) as bank_rows_with_reference_in_gateway_reference from public.payments where payment_method = 'bank_transfer' and gateway_reference is not null;
-- 3. For context: card references that also appear on a bank-transfer row (would have been ambiguous for a webhook lookup before the lookup was restricted to card rows).
select p.gateway_reference, array_agg(distinct p.payment_method) from public.payments p where p.gateway_reference is not null group by p.gateway_reference having count(distinct p.payment_method) > 1;
