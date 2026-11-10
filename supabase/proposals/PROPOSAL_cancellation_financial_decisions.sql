-- PROPOSAL (LOCAL ONLY - not applied to Production; needs the Founder's separate approval). Controlled final-cancellation money workflow, 10 Nov 2026.
-- Requires PROPOSAL_booking_notices_v2.sql (it reads the cancellation outcome). Additive: one table, one guard trigger, four functions. Nothing existing is changed.
-- WHAT: after a FINAL cancellation, any decision about money (a refund, a write-off of an unpaid balance, or "no adjustment needed") is a RECORD with its reason and supporting evidence, requested by an Admin or Super Admin and
-- AUTHORISED OR DECLINED BY A DIFFERENT SUPER ADMIN (separation of duties; a Super Admin cannot authorise their own request). A later Super Admin step records that the authorised action was carried out, with its external reference.
-- WHAT IT NEVER DOES: move money, create or edit a payment row, change amount_paid / payment_status / amount_due, edit the quotation, or close the project. It records decisions and evidence only; the payment itself is made, and entered in the ledger,
-- through the existing finance processes. Every row is permanent (no delete; core fields immutable; a decision and an execution can each be recorded once) and every step writes an audit row.
-- Caps (re-checked when authorising): refunds cannot exceed what was verified paid minus other open or authorised refunds; write-offs cannot exceed the unpaid balance minus other open or authorised write-offs.
-- Rollback: ROLLBACK_cancellation_financial_decisions.sql (drops the table: export it first, it is an evidence record).
begin;
do $$ begin
  if to_regclass('public.booking_notification_jobs') is null or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'enquiry_booking_confirmations' and column_name = 'cancellation_outcome') then raise exception 'ordift:requires_booking_notices_v2'; end if;
end $$;

create or replace function private.booking_actor_level(p uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when bool_or(r.slug = 'super_admin') then 'super_admin' when bool_or(r.slug = 'admin') then 'admin' end
    from public.user_roles ur join public.roles r on r.id = ur.role_id join public.profiles pr on pr.id = ur.user_id where ur.user_id = p and pr.access_status = 'active' and r.slug in ('super_admin', 'admin')
$$;
revoke all on function private.booking_actor_level(uuid) from public, anon, authenticated;

create table public.cancellation_financial_decisions (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id),
  confirmation_id uuid not null references public.enquiry_booking_confirmations(id),
  kind text not null check (kind in ('no_adjustment', 'refund', 'write_off')),
  amount_usd numeric(12, 2),
  reason text not null check (char_length(btrim(reason)) >= 10),
  evidence_ref text not null check (char_length(btrim(evidence_ref)) >= 10 and evidence_ref !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+' and evidence_ref !~ '[0-9]{7}' and evidence_ref !~ '\+[0-9][0-9 -]{7,}'),
  paid_usd_at_request numeric(12, 2) not null, outstanding_usd_at_request numeric(12, 2) not null,
  status text not null default 'requested' check (status in ('requested', 'authorised', 'declined')),
  requested_by uuid not null references public.profiles(id), requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id), decided_at timestamptz, decision_note text,
  executed_reference text, executed_by uuid references public.profiles(id), executed_at timestamptz,
  constraint cfd_amount_shape check ((kind = 'no_adjustment' and amount_usd is null) or (kind <> 'no_adjustment' and amount_usd is not null and amount_usd > 0)),
  constraint cfd_decision_shape check ((status = 'requested' and decided_by is null and decided_at is null and decision_note is null) or (status <> 'requested' and decided_by is not null and decided_at is not null and char_length(btrim(coalesce(decision_note, ''))) >= 10)),
  constraint cfd_separation check (decided_by is null or decided_by <> requested_by),
  constraint cfd_execution_shape check ((executed_at is null and executed_by is null and executed_reference is null) or (status = 'authorised' and executed_at is not null and executed_by is not null and char_length(btrim(coalesce(executed_reference, ''))) >= 6))
);
create index cancellation_financial_decisions_enquiry_idx on public.cancellation_financial_decisions (enquiry_id, requested_at desc);
alter table public.cancellation_financial_decisions enable row level security;
revoke all on public.cancellation_financial_decisions from public, anon, authenticated;
grant select on public.cancellation_financial_decisions to service_role;                                  -- reads only; every write is through the functions below

create or replace function private.cancellation_financial_decisions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'ordift:financial_decisions_are_permanent'; end if;
  if (new.id, new.enquiry_id, new.confirmation_id, new.kind, new.amount_usd, new.reason, new.evidence_ref, new.paid_usd_at_request, new.outstanding_usd_at_request, new.requested_by, new.requested_at)
     is distinct from (old.id, old.enquiry_id, old.confirmation_id, old.kind, old.amount_usd, old.reason, old.evidence_ref, old.paid_usd_at_request, old.outstanding_usd_at_request, old.requested_by, old.requested_at) then raise exception 'ordift:financial_request_is_fixed'; end if;
  if old.status <> 'requested' and (new.status, new.decided_by, new.decided_at, new.decision_note) is distinct from (old.status, old.decided_by, old.decided_at, old.decision_note) then raise exception 'ordift:financial_decision_is_final'; end if;
  if old.executed_at is not null then raise exception 'ordift:financial_execution_is_final'; end if;
  return new;
end $$;
create trigger cancellation_financial_decisions_guard before update or delete on public.cancellation_financial_decisions for each row execute function private.cancellation_financial_decisions_guard();

-- headroom for one enquiry: how much more can be asked for (refund against verified paid, write-off against the unpaid balance), counting requests that are open or authorised
create or replace function private.cancellation_financial_headroom(p_enquiry uuid, p_kind text, p_exclude uuid default null) returns numeric language sql stable security definer set search_path = '' as $$
  select greatest(0, case p_kind when 'refund' then coalesce(e.amount_paid, 0) else greatest(coalesce(e.amount_due, 0) - coalesce(e.amount_paid, 0), 0) end
     - coalesce((select sum(d.amount_usd) from public.cancellation_financial_decisions d where d.enquiry_id = e.id and d.kind = p_kind and d.status <> 'declined' and d.id is distinct from p_exclude), 0))
    from public.enquiries e where e.id = p_enquiry
$$;
revoke all on function private.cancellation_financial_headroom(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.request_cancellation_financial_action(p_enquiry uuid, p_kind text, p_amount numeric, p_reason text, p_evidence text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare lvl text := private.booking_actor_level(p_actor); last public.enquiry_booking_confirmations%rowtype; enq public.enquiries%rowtype; v_id uuid := gen_random_uuid(); v_room numeric;
begin
  if lvl is null then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  if p_kind not in ('no_adjustment', 'refund', 'write_off') then raise exception 'ordift:financial_kind'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:financial_reason'; end if;
  if char_length(btrim(coalesce(p_evidence, ''))) < 10 or p_evidence ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+' or p_evidence ~ '[0-9]{7}' or p_evidence ~ '\+[0-9][0-9 -]{7,}' then raise exception 'ordift:financial_evidence'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || p_enquiry::text));
  select * into last from public.enquiry_booking_confirmations where enquiry_id = p_enquiry order by version desc limit 1;
  if not found or last.kind <> 'cancelled' or last.cancellation_outcome is distinct from 'final' then raise exception 'ordift:financial_needs_final_cancellation'; end if;
  select * into enq from public.enquiries where id = p_enquiry;
  if p_kind = 'no_adjustment' then
    if p_amount is not null then raise exception 'ordift:financial_amount'; end if;
  else
    if p_amount is null or p_amount <= 0 then raise exception 'ordift:financial_amount'; end if;
    v_room := private.cancellation_financial_headroom(p_enquiry, p_kind);
    if p_amount > v_room then raise exception 'ordift:financial_over_cap'; end if;
  end if;
  insert into public.cancellation_financial_decisions (id, enquiry_id, confirmation_id, kind, amount_usd, reason, evidence_ref, paid_usd_at_request, outstanding_usd_at_request, requested_by)
    values (v_id, p_enquiry, last.id, p_kind, round(p_amount, 2), btrim(p_reason), btrim(p_evidence), coalesce(enq.amount_paid, 0), greatest(coalesce(enq.amount_due, 0) - coalesce(enq.amount_paid, 0), 0), p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancellation_financial_requested', 'enquiry', p_enquiry::text, jsonb_build_object('decisionId', v_id, 'kind', p_kind, 'amountUsd', round(p_amount, 2), 'requesterLevel', lvl));
  return v_id;
end $$;

create or replace function public.decide_cancellation_financial_action(p_id uuid, p_decision text, p_note text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.cancellation_financial_decisions%rowtype;
begin
  if private.booking_actor_level(p_actor) is distinct from 'super_admin' then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  if p_decision not in ('authorised', 'declined') then raise exception 'ordift:financial_decision'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'ordift:financial_note'; end if;
  select * into d from public.cancellation_financial_decisions where id = p_id for update;
  if not found then raise exception 'ordift:financial_missing'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || d.enquiry_id::text));
  if d.status <> 'requested' then raise exception 'ordift:financial_decision_is_final'; end if;
  if d.requested_by = p_actor then raise exception 'ordift:financial_separation_of_duties'; end if;
  if p_decision = 'authorised' and d.kind <> 'no_adjustment' and d.amount_usd > private.cancellation_financial_headroom(d.enquiry_id, d.kind, d.id) then raise exception 'ordift:financial_over_cap'; end if;
  update public.cancellation_financial_decisions set status = p_decision, decided_by = p_actor, decided_at = now(), decision_note = btrim(p_note) where id = p_id;
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancellation_financial_' || p_decision, 'enquiry', d.enquiry_id::text, jsonb_build_object('decisionId', p_id, 'kind', d.kind, 'amountUsd', d.amount_usd));
end $$;

create or replace function public.record_cancellation_financial_execution(p_id uuid, p_reference text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.cancellation_financial_decisions%rowtype;
begin
  if private.booking_actor_level(p_actor) is distinct from 'super_admin' then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 6 or p_reference ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+' or p_reference ~ '[0-9]{7}' or p_reference ~ '\+[0-9][0-9 -]{7,}' then raise exception 'ordift:financial_reference'; end if;
  select * into d from public.cancellation_financial_decisions where id = p_id for update;
  if not found then raise exception 'ordift:financial_missing'; end if;
  if d.status <> 'authorised' then raise exception 'ordift:financial_not_authorised'; end if;
  if d.executed_at is not null then raise exception 'ordift:financial_execution_is_final'; end if;
  update public.cancellation_financial_decisions set executed_reference = btrim(p_reference), executed_by = p_actor, executed_at = now() where id = p_id;
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancellation_financial_executed', 'enquiry', d.enquiry_id::text, jsonb_build_object('decisionId', p_id, 'kind', d.kind, 'amountUsd', d.amount_usd));
end $$;

revoke all on function public.request_cancellation_financial_action(uuid, text, numeric, text, text, uuid), public.decide_cancellation_financial_action(uuid, text, text, uuid), public.record_cancellation_financial_execution(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.request_cancellation_financial_action(uuid, text, numeric, text, text, uuid), public.decide_cancellation_financial_action(uuid, text, text, uuid), public.record_cancellation_financial_execution(uuid, text, uuid) to service_role;
commit;
