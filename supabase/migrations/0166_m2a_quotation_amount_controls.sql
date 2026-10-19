-- Enquiry-to-booking M2a: quotation-to-amount-due controls. LOCAL PROTOTYPE, NOT APPLIED TO PRODUCTION.
--
-- ADDITIVE. Changes no existing row, stage, amount, payment, quotation, booking or notification, and backfills nothing.
--
--   1. public.enquiry_amount_events   append-only ledger of every amount-due establishment and every Super Admin override.
--   2. client_quotations_one_live_per_enquiry   at most one live ORDINARY quotation per enquiry (partial unique index).
--   3. client_quotations_currency_fk   quotation currency must exist in public.currencies (it was free text).
--   4. public.revise_ordinary_quotation()        ATOMIC revision: supersede + new version + items + link + audit in one transaction.
--   5. public.establish_enquiry_amount_due()     ATOMIC establishment from an accepted quotation, with the rate checks done on the server.
--   6. public.override_enquiry_amount_due()      Super Admin override with a structured reason, before/after values and a ledger row.
--
-- None of the three functions writes a stage, sends or queues an email or notification, or touches a payment, obligation, receivable, invoice or
-- booking. They are executable by service_role only. The server (not these functions) decides WHO may call them; each function re-checks the actor's
-- role in SQL as defence in depth.
--
-- Deliberately NOT changed: there is no trigger on enquiries.amount_due, because the existing typed amount-due action writes it through a signed-in
-- admin session. That limitation is existing behaviour, documented, not worsened.
--
-- Lock order everywhere is: enquiry row first, then quotation row. Two callers can therefore never deadlock each other.
begin;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- Helper: does this actor hold one of these roles, with an active, unexpired account?
create or replace function private.actor_has_role(p_actor uuid, p_slugs text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_actor
      and r.slug = any (p_slugs)
      and p.access_status = 'active'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;
revoke all on function private.actor_has_role(uuid, text[]) from public;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 1. Append-only ledger.
create table public.enquiry_amount_events (
  id uuid primary key default gen_random_uuid(),
  -- seq gives the ledger one exact order. created_at is the real clock time at insert (clock_timestamp, not the transaction start), and the insert happens
  -- inside the function AFTER the enquiry row lock is taken, so both follow the order in which concurrent changes were actually applied.
  seq bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id) on delete restrict,
  kind text not null check (kind in ('established', 'override')),
  quotation_id uuid references public.client_quotations (id) on delete restrict,
  amount_before numeric(12, 2),
  source_before text,
  quotation_before uuid,
  amount_after numeric(12, 2) not null check (amount_after > 0),
  source_after text not null check (source_after in ('accepted_quotation', 'manual')),
  quotation_currency text,
  quotation_total numeric(12, 2),
  fx_rate_to_usd numeric(14, 6),
  fx_rate_effective_from timestamptz,
  fx_rate_note text,
  category text check (category is null or category in ('quotation_corrected_as_agreed', 'scope_or_price_change_agreed', 'data_entry_correction', 'market_or_currency_correction', 'other')),
  reason text,
  evidence_reference text,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  constraint enquiry_amount_events_shape check (
    (kind = 'established' and quotation_id is not null and category is null and reason is null and evidence_reference is null)
    or (kind = 'override' and category is not null and reason is not null and char_length(btrim(reason)) >= 30
        and (category = 'data_entry_correction' or (evidence_reference is not null and char_length(btrim(evidence_reference)) >= 3)))
  )
);
create index enquiry_amount_events_enquiry_idx on public.enquiry_amount_events (enquiry_id, seq);
comment on table public.enquiry_amount_events is 'Append-only ledger: every amount-due establishment from an accepted quotation and every Super Admin override, with before and after values. Written only by the M2a functions.';

create or replace function private.enquiry_amount_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'enquiry_amount_events is append-only' using errcode = '42501';
end $$;
revoke all on function private.enquiry_amount_events_immutable() from public;
create trigger enquiry_amount_events_no_change before update or delete on public.enquiry_amount_events for each row execute function private.enquiry_amount_events_immutable();
create trigger enquiry_amount_events_no_truncate before truncate on public.enquiry_amount_events for each statement execute function private.enquiry_amount_events_immutable();

alter table public.enquiry_amount_events enable row level security;
create policy "enquiry_amount_events: staff read" on public.enquiry_amount_events for select to authenticated using ((select private.is_super_admin()) or (select private.has_role('admin')));
revoke all on public.enquiry_amount_events from anon, authenticated, service_role;
grant select on public.enquiry_amount_events to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 2. One live ordinary quotation per enquiry. 'ready' exists only for Crew Support but is listed so the rule can never be bypassed by a status mix-up.
-- is_variation = false: the index governs ORIGINAL quotations only, exactly as Crew Support's own index does (0147), so a future, separately approved
-- ordinary-variation workflow can add its own index without altering this one. Nothing creates an ordinary variation today.
create unique index client_quotations_one_live_per_enquiry on public.client_quotations (enquiry_id)
  where enquiry_id is not null and crew_support_request_id is null and is_variation = false and status in ('draft', 'ready', 'sent', 'accepted');

-- 3. Quotation currency must be a real currency.
alter table public.client_quotations add constraint client_quotations_currency_fk foreign key (currency) references public.currencies (code);

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 4. Atomic revision of an ordinary 'sent' quotation.
--    One transaction: lock, supersede the original, insert the next version (linked to the same enquiry), copy the lines, write the audit entry.
--    Any failure rolls ALL of it back, so the enquiry never loses its active quotation and the history is never half-written. The reference number
--    is drawn from the sequence inside the transaction; a rolled-back attempt leaves a gap in the sequence, never a duplicate.
create or replace function public.revise_ordinary_quotation(p_quotation_id uuid, p_actor uuid)
returns table (quotation_id uuid, quotation_reference text)
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry uuid;
  o public.client_quotations%rowtype;
  v_seq bigint;
  v_ref text;
  v_new uuid;
begin
  if not private.actor_has_role(p_actor, array['admin', 'super_admin']) then
    raise exception 'ordift:not_authorised' using errcode = '42501';
  end if;

  select q.enquiry_id into v_enquiry from public.client_quotations q where q.id = p_quotation_id;
  if not found then raise exception 'ordift:quotation_not_found'; end if;
  if v_enquiry is not null then
    perform 1 from public.enquiries e where e.id = v_enquiry for update;          -- enquiry first
  end if;
  select * into o from public.client_quotations q where q.id = p_quotation_id for update;   -- then the quotation
  if o.enquiry_id is distinct from v_enquiry then raise exception 'ordift:changed_concurrently'; end if;

  if o.crew_support_request_id is not null then raise exception 'ordift:crew_managed'; end if;
  if o.status = 'draft' then raise exception 'ordift:draft_edit_directly'; end if;
  if o.status <> 'sent' then raise exception 'ordift:not_revisable'; end if;

  v_seq := nextval('public.client_quotation_reference_seq');
  v_ref := 'ORD-QUO-' || extract(year from (now() at time zone 'utc'))::int::text || '-' || lpad(v_seq::text, 6, '0');

  -- Supersede FIRST so the one-live-quotation index is never violated, even briefly.
  update public.client_quotations set status = 'superseded' where id = o.id;

  insert into public.client_quotations (
    quotation_reference, client_profile_id, prospect_name, prospect_email, prospect_phone, prospect_company, status, currency,
    subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, commercial_notes, version, supersedes_id, created_by,
    enquiry_id, contact_id, organisation_id, payment_condition, deposit_percent, is_test
  ) values (
    v_ref, o.client_profile_id, o.prospect_name, o.prospect_email, o.prospect_phone, o.prospect_company, 'draft', o.currency,
    o.subtotal, o.discount_total, o.tax_total, o.total, o.valid_until, o.payment_booking_terms, o.commercial_notes, o.version + 1, o.id, p_actor,
    o.enquiry_id, o.contact_id, o.organisation_id, o.payment_condition, o.deposit_percent, o.is_test
  ) returning id into v_new;

  insert into public.client_quotation_items (
    quotation_id, service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total, sort_order,
    source_type, source_reference, requirement_id, governed_unit_price, adjustment_reason, no_governed_rate
  )
  select v_new, i.service_item, i.description, i.quantity, i.unit_basis, i.selling_rate, i.discount_percent, i.tax_percent, i.line_total, i.sort_order,
         i.source_type, i.source_reference, i.requirement_id, i.governed_unit_price, i.adjustment_reason, i.no_governed_rate
  from public.client_quotation_items i where i.quotation_id = o.id;

  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'client_quotation.revised', 'client_quotation', v_new,
          jsonb_build_object('quotationReference', v_ref, 'supersedesId', o.id, 'supersedesReference', o.quotation_reference, 'version', o.version + 1, 'enquiryId', o.enquiry_id));

  return query select v_new, v_ref;
end $$;
revoke all on function public.revise_ordinary_quotation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revise_ordinary_quotation(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 5. Atomic establishment of the amount due from an ACCEPTED ordinary quotation.
--    Writes: enquiries.amount_due / amount_due_source / amount_due_quotation_id; the rate lock and USD total on the quotation; one ledger row; one
--    audit entry. Never writes the stage. Repeating the same call is a harmless no-op.
--    Rate policy (server-side, authoritative): USD uses 1. Otherwise the current rate must exist, be above zero, carry a source note, be at most
--    30 days old, still be the rate the person previewed, and not differ from the previous rate by more than 10% unless acknowledged.
create or replace function public.establish_enquiry_amount_due(
  p_enquiry_id uuid, p_quotation_id uuid, p_actor uuid,
  p_expected_rate numeric default null, p_expected_effective timestamptz default null, p_ack_rate_jump boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_max_age constant interval := interval '30 days';
  c_max_jump constant numeric := 0.10;
  e public.enquiries%rowtype;
  q public.client_quotations%rowtype;
  v_market_currency text;
  v_rate numeric(14, 6);
  v_effective timestamptz;
  v_note text;
  v_prev numeric;
  v_usd numeric(12, 2);
  v_lines numeric;
  v_n integer;
  v_locked boolean;
begin
  if not private.actor_has_role(p_actor, array['admin', 'super_admin']) then raise exception 'ordift:not_authorised' using errcode = '42501'; end if;

  select * into e from public.enquiries where id = p_enquiry_id for update;                    -- enquiry first
  if not found then raise exception 'ordift:enquiry_not_found'; end if;
  select * into q from public.client_quotations where id = p_quotation_id for update;           -- then the quotation
  if not found then raise exception 'ordift:quotation_not_found'; end if;

  if e.commercial_intent = 'creative_crew_support' or q.crew_support_request_id is not null then raise exception 'ordift:crew_support_excluded'; end if;
  if q.enquiry_id is distinct from e.id then raise exception 'ordift:quotation_not_linked'; end if;
  if q.status <> 'accepted' or q.accepted_at is null or q.accepted_via is null then raise exception 'ordift:quotation_not_accepted'; end if;

  if not exists (select 1 from public.booking_contracting_entities b
                 where (b.subject_type = 'quotation' and b.subject_id = q.id) or (b.subject_type = 'enquiry' and b.subject_id = e.id)) then
    raise exception 'ordift:contracting_entity_missing';
  end if;

  if e.payment_country is null then raise exception 'ordift:payment_market_not_set'; end if;
  select default_currency_code into v_market_currency from public.payment_country_config where country = e.payment_country;
  if q.currency <> 'USD' and q.currency is distinct from v_market_currency then raise exception 'ordift:currency_market_mismatch'; end if;

  select coalesce(sum(i.line_total), 0), count(*) into v_lines, v_n from public.client_quotation_items i where i.quotation_id = q.id;
  if v_n = 0 or q.total <= 0 or abs(v_lines - q.total) > 0.01 * v_n then raise exception 'ordift:total_not_consistent'; end if;

  v_locked := q.fx_locked_at is not null and q.usd_total is not null;
  if v_locked then
    v_rate := q.fx_rate_to_usd; v_usd := q.usd_total; v_effective := null; v_note := 'rate already locked on the quotation';
  elsif q.currency = 'USD' then
    v_rate := 1; v_usd := round(q.total, 2); v_effective := null; v_note := 'USD';
  else
    select r.rate_to_usd, r.effective_from, r.reason into v_rate, v_effective, v_note
    from public.exchange_rates r where r.currency_code = q.currency order by r.effective_from desc limit 1;
    if v_rate is null or v_rate <= 0 then raise exception 'ordift:rate_missing'; end if;
    if v_note is null or char_length(btrim(v_note)) = 0 then raise exception 'ordift:rate_source_missing'; end if;
    if now() - v_effective > c_max_age then raise exception 'ordift:rate_stale'; end if;
    if p_expected_rate is null or p_expected_effective is null or p_expected_rate <> v_rate or p_expected_effective <> v_effective then
      raise exception 'ordift:rate_changed_since_preview';
    end if;
    select r.rate_to_usd into v_prev from public.exchange_rates r where r.currency_code = q.currency order by r.effective_from desc offset 1 limit 1;
    if v_prev is not null and v_prev > 0 and abs(v_rate - v_prev) / v_prev > c_max_jump and not p_ack_rate_jump then raise exception 'ordift:rate_jump_unacknowledged'; end if;
    v_usd := round(q.total / v_rate, 2);
  end if;
  if v_usd <= 0 then raise exception 'ordift:amount_not_positive'; end if;

  -- Idempotent: already established from this very quotation for this very amount.
  if e.amount_due_quotation_id = q.id and e.amount_due = v_usd then
    return jsonb_build_object('noop', true, 'amountDue', e.amount_due);
  end if;
  if e.amount_due_quotation_id is not null and e.amount_due_quotation_id <> q.id then raise exception 'ordift:different_quotation_supplies_amount'; end if;
  if e.amount_due is not null and e.amount_due_quotation_id is null then raise exception 'ordift:amount_already_set_use_override'; end if;
  if coalesce(e.amount_paid, 0) > 0 and e.amount_due is distinct from v_usd then raise exception 'ordift:payments_exist_amount_differs'; end if;

  if not v_locked then
    update public.client_quotations set usd_total = v_usd, fx_currency = q.currency, fx_rate_to_usd = v_rate, fx_locked_at = now() where id = q.id;
  end if;
  update public.enquiries set amount_due = v_usd, amount_due_source = 'accepted_quotation', amount_due_quotation_id = q.id where id = e.id;

  insert into public.enquiry_amount_events (enquiry_id, kind, quotation_id, amount_before, source_before, quotation_before, amount_after, source_after,
                                            quotation_currency, quotation_total, fx_rate_to_usd, fx_rate_effective_from, fx_rate_note, actor_id)
  values (e.id, 'established', q.id, e.amount_due, e.amount_due_source, e.amount_due_quotation_id, v_usd, 'accepted_quotation',
          q.currency, q.total, v_rate, v_effective, v_note, p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'enquiry.amount_due_established', 'enquiry', e.id,
          jsonb_build_object('quotationReference', q.quotation_reference, 'currency', q.currency, 'total', q.total, 'usd', v_usd, 'rate', v_rate, 'rateEffectiveFrom', v_effective));

  return jsonb_build_object('noop', false, 'amountDue', v_usd, 'rate', v_rate, 'rateEffectiveFrom', v_effective);
end $$;
revoke all on function public.establish_enquiry_amount_due(uuid, uuid, uuid, numeric, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.establish_enquiry_amount_due(uuid, uuid, uuid, numeric, timestamptz, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 6. Super Admin override. The reason must be real: a category, at least 30 characters and 5 distinct words, and an evidence reference for every
--    category except a data-entry correction. The before and after values go to the ledger. The amount can never be set below what is already paid.
create or replace function public.override_enquiry_amount_due(
  p_enquiry_id uuid, p_actor uuid, p_new_amount_usd numeric, p_category text, p_reason text, p_evidence text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.enquiries%rowtype;
  v_words integer;
  v_new numeric(12, 2) := round(p_new_amount_usd, 2);
begin
  if not private.actor_has_role(p_actor, array['super_admin']) then raise exception 'ordift:not_authorised' using errcode = '42501'; end if;
  if p_category is null or p_category not in ('quotation_corrected_as_agreed', 'scope_or_price_change_agreed', 'data_entry_correction', 'market_or_currency_correction', 'other') then
    raise exception 'ordift:category_invalid';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 30 then raise exception 'ordift:reason_too_short'; end if;
  select count(distinct w) into v_words from regexp_split_to_table(lower(btrim(p_reason)), '[^a-z0-9]+') w where w <> '';
  if v_words < 5 then raise exception 'ordift:reason_not_meaningful'; end if;
  if p_category <> 'data_entry_correction' and (p_evidence is null or char_length(btrim(p_evidence)) < 3) then raise exception 'ordift:evidence_required'; end if;
  if v_new is null or v_new <= 0 then raise exception 'ordift:amount_not_positive'; end if;

  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found then raise exception 'ordift:enquiry_not_found'; end if;
  if e.commercial_intent = 'creative_crew_support' then raise exception 'ordift:crew_support_excluded'; end if;
  if coalesce(e.amount_paid, 0) > v_new then raise exception 'ordift:amount_below_paid'; end if;
  if e.amount_due is not distinct from v_new then raise exception 'ordift:amount_unchanged'; end if;

  update public.enquiries set amount_due = v_new, amount_due_source = 'manual', amount_due_quotation_id = null where id = e.id;
  insert into public.enquiry_amount_events (enquiry_id, kind, quotation_id, amount_before, source_before, quotation_before, amount_after, source_after, category, reason, evidence_reference, actor_id)
  values (e.id, 'override', e.amount_due_quotation_id, e.amount_due, e.amount_due_source, e.amount_due_quotation_id, v_new, 'manual', p_category, btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'enquiry.amount_due_overridden', 'enquiry', e.id,
          jsonb_build_object('before', e.amount_due, 'after', v_new, 'sourceBefore', e.amount_due_source, 'category', p_category));
  return jsonb_build_object('amountDue', v_new);
end $$;
revoke all on function public.override_enquiry_amount_due(uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.override_enquiry_amount_due(uuid, uuid, numeric, text, text, text) to service_role;

commit;
