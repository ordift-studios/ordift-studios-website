-- PROPOSAL (NOT a numbered migration, NOT applied to Production, NOT for Production without separate approval): open payment instructions on one record may not, together, exceed what is still owed.
-- Rollback: ROLLBACK_payment_open_commitments_guard.sql. Rehearsals: rehearse_payment_open_commitments.sh and rehearse_payment_open_commitments_concurrency.py.
--
-- THE GAP (decision A in DECISIONS_payment_policy_options_2026_11_09.md, now authorised). Each payment start was bounded by the outstanding balance on its own, so a deposit and a full-balance instruction (or a
-- card attempt and a bank instruction) could both be open and both be paid, over-collecting.
--
-- THE RULE. When a payment instruction is CREATED, or its amount is RAISED while it is still open, the amount may not exceed:
--       amount due  -  completed payments (refunds subtract)  -  the other instructions that currently HOLD part of the balance.
-- An instruction HOLDS part of the balance while it is awaiting verification or needs more information (money may have moved), and while it is pending (not yet paid) and was started less than
-- private.open_instruction_hold_hours() ago (24 hours). An abandoned pending instruction therefore stops reserving the balance after a day, without anyone clearing it, and a client can also cancel an unpaid
-- bank instruction at once. The check runs under the same per-record lock as verification, so simultaneous starts of different types cannot both pass.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--   * It never blocks money that has already moved: submitting proof, resubmitting after a rejection, and every completion are not checked (a card payment the provider has collected is never refused: a total above
--     what is owed is flagged for review by the earlier over-collection trigger, and a bank credit is bounded at verification).
--   * It does not limit legitimate instalments or partial payments: sequential payments pass because completed and verified money reduces what is owed; two open partials pass if together they fit.
--   * It never alters or deletes an existing row. It only refuses a NEW commitment that does not fit.
-- Compatibility: one function and one trigger. Existing rows, constraints, indexes and the audit trail are untouched. Rows that are already over-committed stay as they are (the rule applies to new starts only).
begin;

create or replace function private.open_instruction_hold_hours() returns int language sql immutable as $$ select 24 $$;
revoke all on function private.open_instruction_hold_hours() from public, anon, authenticated, service_role;

create or replace function private.payments_open_commitment_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_due numeric; v_completed numeric; v_held numeric; v_room numeric;
begin
  if new.payment_type = 'refund' or new.status not in ('pending', 'awaiting_verification', 'additional_info_required') then return new; end if;
  if tg_op = 'UPDATE' then
    -- only a RAISED amount on a still-open instruction is a new commitment; proof submission, a resubmission after rejection, and every other change are not
    if old.status not in ('pending', 'awaiting_verification', 'additional_info_required') or new.reference_amount_usd <= old.reference_amount_usd then return new; end if;
  end if;
  if new.entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('ordift:payment-entity:' || new.entity_type || ':' || new.entity_id, 0));
  if new.entity_type = 'enquiry' then select amount_due into v_due from public.enquiries where id = new.entity_id::uuid;
  else select amount_due into v_due from public.workshop_registrations where id = new.entity_id::uuid; end if;
  if v_due is null or v_due <= 0 then return new; end if;                       -- nothing to bound against
  select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) into v_completed
    from public.payments where entity_type = new.entity_type and entity_id = new.entity_id and status = 'completed' and id <> new.id;
  select coalesce(sum(reference_amount_usd), 0) into v_held
    from public.payments where entity_type = new.entity_type and entity_id = new.entity_id and id <> new.id and payment_type <> 'refund'
     and (status in ('awaiting_verification', 'additional_info_required') or (status = 'pending' and created_at > now() - make_interval(hours => private.open_instruction_hold_hours())));
  v_room := greatest(v_due - v_completed - v_held, 0);
  if new.reference_amount_usd > v_room + 0.005 then
    raise exception 'ordift:would_exceed_outstanding' using detail = format('due %s, completed %s, held by other open instructions %s, room %s, requested %s', v_due, v_completed, v_held, v_room, new.reference_amount_usd);
  end if;
  return new;
end $$;
revoke all on function private.payments_open_commitment_guard() from public, anon, authenticated, service_role;
drop trigger if exists payments_open_commitment_guard on public.payments;
create trigger payments_open_commitment_guard before insert or update of reference_amount_usd on public.payments for each row execute function private.payments_open_commitment_guard();
commit;
