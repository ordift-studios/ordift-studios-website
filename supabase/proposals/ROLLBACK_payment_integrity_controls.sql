-- ROLLBACK for PROPOSAL_payment_integrity_controls.sql. Restores the original verification function (as in migration 0151), removes the two triggers and their functions, the two review-case functions
-- and the review-case table, and the bank_transaction_reference column.
-- WHAT THIS DISCARDS, AND HOW TO KEEP IT: (1) review cases opened since the proposal was applied (export payment_review_cases first if any are open or worth keeping);
-- (2) bank references written to bank_transaction_reference since: they are COPIED into gateway_reference first for rows where it is empty (the pre-proposal convention), so no bank reference is lost.
-- No payment row, verification history, completion claim or audit entry is deleted or edited otherwise.
begin;
update public.payments set gateway_reference = bank_transaction_reference where payment_method = 'bank_transfer' and gateway_reference is null and bank_transaction_reference is not null;
drop trigger if exists payments_bank_completion_guard on public.payments;
drop trigger if exists payments_card_overcollection_flag on public.payments;
drop function if exists private.payments_bank_completion_guard();
drop function if exists private.payments_card_overcollection_flag();
create or replace function public.verify_bank_transfer_payment(
  p_payment_id uuid,
  p_decision text,
  p_verifier uuid,
  p_received_amount numeric,
  p_received_currency text,
  p_bank_reference text,
  p_received_date date,
  p_independent_check boolean,
  p_internal_notes text,
  p_client_message text,
  p_acknowledge_excess boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_credited numeric(12, 2);
  v_excess numeric(12, 2) := 0;
  v_partial boolean := false;
  v_due numeric;
  v_paid numeric;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then raise exception 'invalid_decision'; end if;

  if p_verifier is null or not private.can_verify_bank_transfers(p_verifier) then raise exception 'verifier_not_authorized'; end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_pay.payment_method <> 'bank_transfer' then raise exception 'not_bank_transfer'; end if;
  if v_pay.status <> 'awaiting_verification' then raise exception 'not_awaiting_verification'; end if;
  -- separation of duties: whoever submitted the evidence or is the payer cannot verify it
  if p_verifier = v_pay.user_id or p_verifier = v_pay.submitted_by then raise exception 'verifier_is_submitter'; end if;

  if p_decision = 'rejected' then
    if char_length(btrim(coalesce(p_internal_notes, ''))) < 5 then raise exception 'reason_required'; end if;
    update public.payments set status = 'rejected', reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = btrim(p_internal_notes), client_visible_note = nullif(btrim(coalesce(p_client_message, '')), '')
     where id = p_payment_id;
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, independent_check_confirmed, internal_notes, client_message)
      values (p_payment_id, 'rejected', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, coalesce(p_independent_check, false), btrim(p_internal_notes), nullif(btrim(coalesce(p_client_message, '')), ''));
    return jsonb_build_object('decision', 'rejected', 'status', 'rejected');
  end if;

  if p_decision = 'info_requested' then
    if char_length(btrim(coalesce(p_client_message, ''))) < 5 then raise exception 'message_required'; end if;
    update public.payments set status = 'additional_info_required', reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''), client_visible_note = btrim(p_client_message)
     where id = p_payment_id;
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, independent_check_confirmed, internal_notes, client_message)
      values (p_payment_id, 'info_requested', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, coalesce(p_independent_check, false), nullif(btrim(coalesce(p_internal_notes, '')), ''), btrim(p_client_message));
    return jsonb_build_object('decision', 'info_requested', 'status', 'additional_info_required');
  end if;

  -- ---- approved: only after the verifier states the receiving account was independently checked
  if not coalesce(p_independent_check, false) then raise exception 'independent_check_required'; end if;
  if p_received_amount is null or p_received_amount <= 0 then raise exception 'received_amount_required'; end if;
  if p_received_currency is null or p_received_currency <> v_pay.payment_currency then raise exception 'currency_mismatch'; end if;
  if char_length(btrim(coalesce(p_bank_reference, ''))) < 3 then raise exception 'bank_reference_required'; end if;
  if p_received_date is null or p_received_date > current_date + 1 then raise exception 'received_date_invalid'; end if;
  if v_pay.receiving_bank_account_id is null then raise exception 'no_receiving_account'; end if;

  p_received_amount := round(p_received_amount, 2);
  if p_received_amount < v_pay.converted_amount - 0.005 then
    v_partial := true;
    v_credited := round(p_received_amount / v_pay.exchange_rate, 2);
  else
    v_credited := v_pay.reference_amount_usd;
    v_excess := greatest(round(p_received_amount - v_pay.converted_amount, 2), 0);
    if v_excess > 0.005 and not coalesce(p_acknowledge_excess, false) then raise exception 'excess_not_acknowledged'; end if;
  end if;
  if v_credited <= 0 then raise exception 'credit_too_small'; end if;

  -- never post more than the receivable still owes
  if v_pay.entity_type = 'enquiry' then
    select amount_due into v_due from public.enquiries where id = v_pay.entity_id::uuid;
  else
    select amount_due into v_due from public.workshop_registrations where id = v_pay.entity_id::uuid;
  end if;
  if v_due is null or v_due <= 0 then raise exception 'no_receivable'; end if;
  select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) into v_paid
    from public.payments where entity_type = v_pay.entity_type and entity_id = v_pay.entity_id and status = 'completed';
  if v_credited > greatest(v_due - v_paid, 0) + 0.005 then raise exception 'would_overpay_receivable'; end if;

  begin
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, received_amount, received_currency, bank_reference, received_date, independent_check_confirmed,
        credited_reference_usd, excess_received, internal_notes, client_message)
      values (p_payment_id, 'approved', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, p_received_amount, p_received_currency, btrim(p_bank_reference), p_received_date, true,
        v_credited, v_excess, nullif(btrim(coalesce(p_internal_notes, '')), ''), nullif(btrim(coalesce(p_client_message, '')), ''));
  exception when unique_violation then
    raise exception 'duplicate_bank_reference';
  end;

  update public.payments set
      status = 'completed',
      reference_amount_usd = v_credited,
      converted_amount = case when v_partial then p_received_amount else converted_amount end,
      amount_collected = p_received_amount,
      settlement_currency = p_received_currency,
      gateway_reference = btrim(p_bank_reference),
      payment_type = case when v_partial and payment_type in ('full', 'balance') then 'partial' else payment_type end,
      reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''), client_visible_note = null
    where id = p_payment_id;

  return jsonb_build_object('decision', 'approved', 'status', 'completed', 'credited_reference_usd', v_credited, 'excess_received', v_excess, 'partial', v_partial);
end;
$$;
revoke all on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) to service_role;
drop function if exists public.open_payment_review_case(uuid, text, jsonb, text);
drop function if exists public.resolve_payment_review_case(uuid, uuid, text, text);
drop table if exists public.payment_review_cases;
alter table public.payments drop column if exists bank_transaction_reference;
commit;
