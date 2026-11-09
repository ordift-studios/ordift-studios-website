-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): confirming a booking from an accepted ORDINARY quotation. The number is assigned at release (Production's ledger is 0185; 0186 is proposed elsewhere).
-- Rollback: ROLLBACK_booking_confirmation.sql. Rehearsal: rehearse_booking.sh (on the Production-shaped scratch database from rehearse_production_shape.sh).
--
-- WHAT. One append-only confirmation record per booking decision (confirmed / changed / cancelled), its schedule segments, and versioned business-rule settings, written ONLY through public.confirm_ordinary_booking() and
-- public.cancel_ordinary_booking() (Super Admin; one transaction; locks; every rule re-checked here, not trusted from the caller). The feature flag BOOKING_CONFIRMATION_ENABLED lives in the application and defaults OFF; with it off nothing calls these functions.
-- RULES ENFORCED IN THE DATABASE (Founder's business rules of 2026-11-08; internal rules, NOT legal thresholds, and the numbers are DATA in booking_rule_settings, not code):
--   * the quotation is an ISSUED, ACCEPTED ORDINARY quotation of this enquiry (not Crew Support), its content fingerprint exists, and the contracting entity is STILL eligible for the quoted activities (private.entity_issue_standing):
--     an agreement can never override an unlicensed activity;
--   * an executed agreement is required when the settings say so (activity categories, value threshold per currency, explicit escalators); a missing threshold for the quotation's currency means "required" (fail closed);
--   * payment follows the quotation's OWN structured condition (client_quotations.payment_condition / deposit_percent: none / deposit / full): required amount vs VERIFIED paid (enquiries.amount_paid); none -> the outstanding amount is only RECORDED, never treated as received;
--   * the structured condition may not silently contradict the quotation's terms: an ambiguous or contradicting reading needs a recorded clarification (client confirmation in writing) before confirmation;
--   * a confirmed date, time and place: >= 1 segment (on_site / studio need a place, online needs a platform), time-zoned, ends after it starts;
--   * a FIRM conflict for the same assigned person (another confirmed booking, a confirmed Crew Support slot, approved leave) blocks confirmation. It is NOT cleared by typing a reason: each firm conflict needs a documented
--     'availability_verified' resolution made WITH THE ASSIGNED PERSON (method, reference, date). Reassigning or rescheduling are done by editing the request, which makes the conflict disappear;
--   * a change or cancellation is a new row; only a Super Admin; all checks re-run on a change.
-- NOT HERE: payments, invoices, receivables, emails, agreements issued, Crew Support changes, any change to quotations or acceptance. The only other write is moving the enquiry to 'booked' (never backwards, never out of a closed stage).

begin;

-- ------------------------------------------------------------------------------------------------------------------------------ settings (versioned data, never hard-coded)
create table public.booking_rule_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  version integer not null unique check (version >= 1),
  status text not null check (status in ('provisional', 'approved')),
  agreement_value_thresholds jsonb not null check (jsonb_typeof(agreement_value_thresholds) = 'object'),   -- {"QAR": 3000, "GHS": 10000, "USD": 800}: internal business rules, not legal thresholds
  agreement_always_categories text[] not null,
  agreement_escalators text[] not null,                    -- the circumstances that make an agreement necessary; a change is a new version
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
comment on table public.booking_rule_settings is 'Versioned internal business rules for booking confirmation. Append-only: a change is a new version. The thresholds are NOT legal thresholds.';
create or replace function private.booking_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% is append-only: record a new row instead', tg_table_name using errcode = '42501'; end $$;
revoke all on function private.booking_append_only() from public, anon, authenticated;
create trigger booking_rule_settings_append_only before update or delete on public.booking_rule_settings for each row execute function private.booking_append_only();

-- ------------------------------------------------------------------------------------------------------------------------------ confirmations
create table public.enquiry_booking_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id),
  version integer not null check (version >= 1),
  kind text not null check (kind in ('confirmed', 'changed', 'cancelled')),
  supersedes_id uuid references public.enquiry_booking_confirmations (id),
  quotation_id uuid not null references public.client_quotations (id),
  quotation_fingerprint text not null check (quotation_fingerprint ~ '^[0-9a-f]{64}$'),
  contracting_entity_id uuid references public.employing_entities (id),
  activities text[] not null default '{}',
  assigned_profile_id uuid references public.profiles (id),
  agreement_required boolean not null default false,
  agreement_reasons text[] not null default '{}',
  agreement_id uuid references public.agreements (id),
  settings_version integer references public.booking_rule_settings (version),
  payment_condition text check (payment_condition in ('none', 'deposit', 'full')),
  deposit_percent numeric(5, 2),
  payment_terms_check text check (payment_terms_check in ('consistent', 'no_payment_language', 'ambiguous', 'contradiction', 'no_terms')),
  payment_clarification jsonb,
  amount_due_usd numeric(14, 2), required_usd numeric(14, 2), verified_paid_usd numeric(14, 2), outstanding_usd numeric(14, 2),
  conflict_review jsonb not null default '[]'::jsonb,
  basis text,
  reason text,
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now(),
  constraint booking_unique_version unique (enquiry_id, version),
  constraint booking_cancel_has_reason check (kind <> 'cancelled' or char_length(btrim(coalesce(reason, ''))) >= 10),
  constraint booking_live_has_payment check (kind = 'cancelled' or payment_condition is not null),
  constraint booking_deposit_shape check ((payment_condition = 'deposit') = (deposit_percent is not null))
);
create index booking_confirmations_enquiry_idx on public.enquiry_booking_confirmations (enquiry_id, version desc);
create index booking_confirmations_assignee_idx on public.enquiry_booking_confirmations (assigned_profile_id) where assigned_profile_id is not null;
create trigger booking_confirmations_append_only before update or delete on public.enquiry_booking_confirmations for each row execute function private.booking_append_only();

create table public.enquiry_booking_segments (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.enquiry_booking_confirmations (id),
  seq integer not null check (seq >= 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 3 and 64),
  kind text not null check (kind in ('on_site', 'online', 'studio')),
  location text,
  platform text,
  note text,
  constraint booking_segment_order check (ends_at > starts_at),
  constraint booking_segment_place check ((kind = 'online' and char_length(btrim(coalesce(platform, ''))) >= 2) or (kind in ('on_site', 'studio') and char_length(btrim(coalesce(location, ''))) >= 3)),
  constraint booking_segment_unique unique (confirmation_id, seq)
);
create index booking_segments_time_idx on public.enquiry_booking_segments (starts_at, ends_at);
create trigger booking_segments_append_only before update or delete on public.enquiry_booking_segments for each row execute function private.booking_append_only();

-- ------------------------------------------------------------------------------------------------------------------------------ privileges: Super Admin read; server code writes through the functions only
alter table public.booking_rule_settings enable row level security;
alter table public.enquiry_booking_confirmations enable row level security;
alter table public.enquiry_booking_segments enable row level security;
create policy "booking_rule_settings: super admin only" on public.booking_rule_settings for select to authenticated using ((select private.is_super_admin()));
create policy "enquiry_booking_confirmations: super admin only" on public.enquiry_booking_confirmations for select to authenticated using ((select private.is_super_admin()));
create policy "enquiry_booking_segments: super admin only" on public.enquiry_booking_segments for select to authenticated using ((select private.is_super_admin()));
revoke all on public.booking_rule_settings, public.enquiry_booking_confirmations, public.enquiry_booking_segments from anon, authenticated, service_role;
grant select on public.booking_rule_settings, public.enquiry_booking_confirmations, public.enquiry_booking_segments to authenticated;
grant select, insert on public.booking_rule_settings to service_role;
grant select on public.enquiry_booking_confirmations, public.enquiry_booking_segments to service_role;

-- first, PROVISIONAL settings (Founder, 2026-11-08): internal business rules, configurable, not legal thresholds
insert into public.booking_rule_settings (version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators, note, created_by)
select 1, 'provisional', '{"QAR": 3000, "GHS": 10000, "USD": 800}'::jsonb, array['videography', 'production_services', 'talent_management', 'drone_operations'],
  array['usage_rights_extended', 'exclusivity', 'minors', 'third_party_ip', 'restricted_location', 'complex_or_unusual', 'multi_day_assignment'],
  'Provisional internal business rules set by the Founder on 2026-11-08; not legal thresholds. Change by recording a new version.',
  (select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.slug = 'super_admin' order by ur.user_id limit 1)
where exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where r.slug = 'super_admin');

-- ------------------------------------------------------------------------------------------------------------------------------ helpers
create or replace function private.booking_actor_is_super_admin(p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id join public.profiles pr on pr.id = ur.user_id where ur.user_id = p and r.slug = 'super_admin' and pr.access_status = 'active');
$$;
revoke all on function private.booking_actor_is_super_admin(uuid) from public, anon, authenticated;

-- every conflict for one assigned person against a set of segments: [{key, kind, firm, label, from, to}]. Firm = a confirmed commitment (booking, confirmed Crew Support slot, approved leave); soft = in progress.
-- ------------------------------------------------------------------------------------------------------------------------------ Crew Support schedule precision (reads only; no Crew Support row is changed)
-- A Crew Support request already carries OPTIONAL call_time and finish_time (free text) and event_timezone. When both times are readable, finish is after call, and a timezone is known (the override, else the
-- market default Qatar / Ghana), the request occupies that daily window on EACH date from start_date to end_date. Anything else (date-only, unreadable text, overnight, no timezone, over 366 days) is treated
-- CONSERVATIVELY as the whole of each calendar date. Nothing is inferred for historical rows. Windows are half-open: an assignment that starts exactly when another ends does not overlap it.
create or replace function private.parse_clock(t text) returns time language plpgsql immutable set search_path = '' as $$
declare m text[]; h int; mi int; ap text;
begin
  if t is null then return null; end if;
  m := regexp_match(t, '^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$', 'i');
  if m is null then return null; end if;
  h := m[1]::int; mi := coalesce(m[2], '0')::int; ap := lower(replace(coalesce(m[3], ''), '.', ''));
  if mi > 59 then return null; end if;
  if ap <> '' then
    if h < 1 or h > 12 then return null; end if;
    if ap = 'pm' and h < 12 then h := h + 12; end if;
    if ap = 'am' and h = 12 then h := 0; end if;
  elsif h > 23 then return null; end if;
  return make_time(h, mi, 0);
end $$;

create or replace function private.crew_request_overlaps(p_request uuid, p_from timestamptz, p_to timestamptz, p_seg_tz text) returns boolean
language plpgsql stable set search_path = '' as $$
declare r record; tz text; c time; f time; d date;
begin
  select rq.start_date, rq.end_date, rq.call_time, rq.finish_time, rq.event_timezone, e.payment_country into r
    from public.crew_support_requests rq left join public.enquiries e on e.id = rq.enquiry_id where rq.id = p_request;
  if not found then return false; end if;
  tz := case when r.event_timezone is not null and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = r.event_timezone) then r.event_timezone
             when upper(coalesce(r.payment_country, '')) = 'QA' then 'Asia/Qatar' when upper(coalesce(r.payment_country, '')) = 'GH' then 'Africa/Accra' else null end;
  c := private.parse_clock(r.call_time); f := private.parse_clock(r.finish_time);
  if tz is not null and c is not null and f is not null and f > c and r.start_date <= r.end_date and r.end_date - r.start_date <= 365 then
    for d in select g::date from generate_series(r.start_date::timestamp, r.end_date::timestamp, interval '1 day') g loop
      if tstzrange((d + c) at time zone tz, (d + f) at time zone tz) && tstzrange(p_from, p_to) then return true; end if;
    end loop;
    return false;
  end if;
  return (p_from at time zone p_seg_tz)::date <= r.end_date and (p_to at time zone p_seg_tz)::date >= r.start_date;     -- conservative: the whole of each calendar date
end $$;

create or replace function private.booking_conflicts(p_assignee uuid, p_segments jsonb, p_exclude_enquiry uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; s jsonb; r record; d_from date; d_to date;
begin
  if p_assignee is null then return out; end if;
  for s in select * from jsonb_array_elements(p_segments) loop
    d_from := ((s ->> 'startsAt')::timestamptz at time zone (s ->> 'timezone'))::date; d_to := ((s ->> 'endsAt')::timestamptz at time zone (s ->> 'timezone'))::date;
    for r in
      select c.id, e.reference_number, min(g.starts_at) as f, max(g.ends_at) as t
        from public.enquiry_booking_confirmations c
        join public.enquiry_booking_segments g on g.confirmation_id = c.id
        join public.enquiries e on e.id = c.enquiry_id
       where c.assigned_profile_id = p_assignee and c.enquiry_id is distinct from p_exclude_enquiry and c.kind <> 'cancelled'
         and c.version = (select max(x.version) from public.enquiry_booking_confirmations x where x.enquiry_id = c.enquiry_id)
         and tstzrange(g.starts_at, g.ends_at) && tstzrange((s ->> 'startsAt')::timestamptz, (s ->> 'endsAt')::timestamptz)
       group by c.id, e.reference_number
    loop out := out || jsonb_build_array(jsonb_build_object('key', 'booking:' || r.id, 'kind', 'booking', 'firm', true, 'overridable', false, 'label', r.reference_number, 'from', r.f, 'to', r.t)); end loop;
    for r in
      select sl.id, rq.reference_number, rq.start_date, rq.end_date, rq.status
        from public.crew_support_slots sl join public.crew_support_requests rq on rq.id = sl.request_id
       where sl.assignee_profile_id = p_assignee and sl.status in ('assigned', 'proposed') and rq.status not in ('declined', 'cancelled') and not rq.is_test
         and private.crew_request_overlaps(rq.id, (s ->> 'startsAt')::timestamptz, (s ->> 'endsAt')::timestamptz, s ->> 'timezone')
    loop out := out || jsonb_build_array(jsonb_build_object('key', 'crew_slot:' || r.id, 'kind', 'crew_slot', 'firm', r.status = 'confirmed', 'overridable', false, 'label', r.reference_number, 'from', r.start_date, 'to', r.end_date)); end loop;
    for r in select lr.id, lr.start_date, lr.end_date from public.leave_requests lr where lr.profile_id = p_assignee and lr.status = 'approved' and lr.start_date <= d_to and lr.end_date >= d_from
    loop out := out || jsonb_build_array(jsonb_build_object('key', 'leave:' || r.id, 'kind', 'leave', 'firm', true, 'overridable', false, 'label', 'approved leave', 'from', r.start_date, 'to', r.end_date)); end loop;
  end loop;
  return (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(out) x);
end $$;
revoke all on function private.booking_conflicts(uuid, jsonb, uuid) from public, anon, authenticated;

-- read-only preview of the conflicts, for the review screen BEFORE confirmation (same function the confirmation uses). 'overridable' is false for every firm conflict: a confirmed booking, a confirmed Crew Support slot and approved leave (nothing recorded or written clears them).
create or replace function public.preview_booking_conflicts(p_assignee uuid, p_segments jsonb, p_exclude_enquiry uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.booking_conflicts(p_assignee, p_segments, p_exclude_enquiry) $$;
revoke all on function public.preview_booking_conflicts(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.preview_booking_conflicts(uuid, jsonb, uuid) to service_role;

-- ------------------------------------------------------------------------------------------------------------------------------ confirm (and change) a booking
-- p: { enquiryId, quotationId, supersedes?, assignedProfileId?, segments:[{startsAt,endsAt,timezone,kind,location?,platform?,note?}], paymentTermsCheck (the application's reading of the quotation's terms text against its structured condition),
--      clarification?:{kind,evidence}, escalators?:[the circumstances defined by the current settings version], agreementId?, basis }   -- a conflictResolutions list, if sent, is IGNORED: no firm conflict is overridable
create or replace function public.confirm_ordinary_booking(p jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  enq public.enquiries%rowtype; q public.client_quotations%rowtype; prev public.enquiry_booking_confirmations%rowtype; st public.booking_rule_settings%rowtype; ag public.agreements%rowtype;
  v_fp text; v_issue jsonb; v_acts text[]; v_entity uuid; v_standing jsonb; v_assignee uuid := nullif(p ->> 'assignedProfileId', '')::uuid;
  v_reasons text[] := '{}'; v_thr numeric; v_req boolean; v_cond text; v_pct numeric;
  v_due numeric; v_paid numeric; v_need numeric := 0; v_check text := p ->> 'paymentTermsCheck'; v_clar jsonb := p -> 'clarification'; v_conf jsonb; c jsonb; res jsonb; v_id uuid := gen_random_uuid();
  v_ver int; i int := 0; sg jsonb; v_a text; v_esc text;
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || (p ->> 'enquiryId')));
  if v_assignee is not null then perform pg_advisory_xact_lock(hashtext('booking-person:' || v_assignee::text)); end if;
  select * into enq from public.enquiries where id = (p ->> 'enquiryId')::uuid for update;
  if not found then raise exception 'ordift:booking_enquiry_missing'; end if;
  if enq.crm_stage::text in ('declined', 'closed') then raise exception 'ordift:booking_enquiry_closed'; end if;
  select * into q from public.client_quotations where id = (p ->> 'quotationId')::uuid and enquiry_id = enq.id and crew_support_request_id is null and status = 'accepted' and issued_at is not null;
  if not found then raise exception 'ordift:booking_not_accepted'; end if;
  select (metadata ->> 'contentSha256') into v_fp from public.activity_log where action = 'client_quotation.content_fingerprint' and entity_id = q.id::text order by created_at desc limit 1;
  if v_fp is null then raise exception 'ordift:booking_no_fingerprint'; end if;
  select metadata into v_issue from public.activity_log where action = 'client_quotation.issued' and entity_id = q.id::text order by created_at desc limit 1;
  v_acts := coalesce(array(select jsonb_array_elements_text(v_issue -> 'declaredActivities')), '{}'); v_entity := nullif(v_issue #>> '{contractingEntity,entityId}', '')::uuid;
  if v_entity is null then raise exception 'ordift:booking_no_entity'; end if;
  v_standing := private.entity_issue_standing(v_entity, current_date, v_acts);
  if v_standing is null or not coalesce((v_standing ->> 'eligible')::boolean, false) then raise exception 'ordift:booking_entity_not_eligible'; end if;   -- an agreement never overrides this
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = enq.id order by version desc limit 1;
  if found and prev.kind <> 'cancelled' then
    if nullif(p ->> 'supersedes', '')::uuid is distinct from prev.id then raise exception 'ordift:booking_already_confirmed'; end if;
  elsif nullif(p ->> 'supersedes', '') is not null then raise exception 'ordift:booking_nothing_to_change'; end if;
  v_ver := coalesce(prev.version, 0) + 1;
  if jsonb_typeof(p -> 'segments') is distinct from 'array' or jsonb_array_length(p -> 'segments') < 1 then raise exception 'ordift:booking_no_schedule'; end if;

  select * into st from public.booking_rule_settings order by version desc limit 1;
  if not found then raise exception 'ordift:booking_settings_missing'; end if;
  foreach v_a in array v_acts loop if v_a = any (st.agreement_always_categories) then v_reasons := array_append(v_reasons, 'category:' || v_a); end if; end loop;
  v_thr := (st.agreement_value_thresholds ->> q.currency)::numeric;
  if v_thr is null then v_reasons := array_append(v_reasons, 'no_threshold_for_currency:' || q.currency);
  elsif q.total >= v_thr then v_reasons := array_append(v_reasons, 'value_at_or_above_threshold'); end if;
  for v_esc in select jsonb_array_elements_text(coalesce(p -> 'escalators', '[]'::jsonb)) loop
    if not (v_esc = any (st.agreement_escalators)) then raise exception 'ordift:booking_unknown_escalator'; end if;     -- only circumstances the current settings version defines
    v_reasons := array_append(v_reasons, 'escalator:' || v_esc);
  end loop;
  -- a multi-day assignment is detected from the schedule itself, not only ticked (when the settings version includes it)
  if 'multi_day_assignment' = any (st.agreement_escalators) and (select count(distinct ((x ->> 'startsAt')::timestamptz at time zone (x ->> 'timezone'))::date) from jsonb_array_elements(p -> 'segments') x) > 1
     and not ('escalator:multi_day_assignment' = any (v_reasons)) then v_reasons := array_append(v_reasons, 'escalator:multi_day_assignment'); end if;
  v_req := coalesce(array_length(v_reasons, 1), 0) > 0;
  if v_req then
    select * into ag from public.agreements where id = nullif(p ->> 'agreementId', '')::uuid;
    if not found or ag.executed_at is null or ag.cancelled_at is not null or ag.terminated_at is not null or ag.expired_at is not null or ag.declined_at is not null or ag.superseded_by_agreement_id is not null
       or ag.primary_context_type not in ('enquiry', 'client_quotation') or ag.primary_context_reference not in (enq.reference_number, q.quotation_reference) then
      raise exception 'ordift:booking_agreement_required';
    end if;
  end if;

  -- the structured condition is the ACCEPTED QUOTATION's own (client_quotations.payment_condition / deposit_percent), never typed in afterwards; a caller that states a different one is refused
  v_cond := q.payment_condition; v_pct := q.deposit_percent;
  if p ? 'paymentCondition' and (p ->> 'paymentCondition') is distinct from v_cond then raise exception 'ordift:booking_payment_condition_mismatch'; end if;
  if v_cond not in ('none', 'deposit', 'full') or (v_cond = 'deposit') <> (v_pct is not null) then raise exception 'ordift:booking_payment_condition_missing'; end if;
  if v_check not in ('consistent', 'no_payment_language', 'ambiguous', 'contradiction', 'no_terms') then raise exception 'ordift:booking_terms_check_missing'; end if;
  if v_check in ('ambiguous', 'no_terms') or v_check = 'contradiction' then
    if v_clar is null or (v_clar ->> 'kind') not in ('client_confirmed_in_writing', 'quotation_revised') or char_length(btrim(coalesce(v_clar ->> 'evidence', ''))) < 15
       or (v_check = 'contradiction' and (v_clar ->> 'kind') <> 'client_confirmed_in_writing') then raise exception 'ordift:booking_payment_terms_unclear'; end if;
  end if;
  v_due := enq.amount_due; v_paid := coalesce(enq.amount_paid, 0);
  if v_cond <> 'none' then
    if v_due is null or v_due <= 0 then raise exception 'ordift:booking_amount_due_missing'; end if;
    v_need := case v_cond when 'full' then v_due else round(v_due * v_pct / 100, 2) end;
    if v_paid < v_need then raise exception 'ordift:booking_payment_pending'; end if;
  end if;

  v_conf := private.booking_conflicts(v_assignee, p -> 'segments', enq.id);
  -- a confirmed booking, a confirmed Crew Support assignment or approved leave for the same person is NEVER cleared by anything written or recorded: change the person or the time (or follow the leave workflow)
  if exists (select 1 from jsonb_array_elements(v_conf) x where (x ->> 'firm')::boolean) then raise exception 'ordift:booking_overlap_not_overridable'; end if;

  insert into public.enquiry_booking_confirmations (id, enquiry_id, version, kind, supersedes_id, quotation_id, quotation_fingerprint, contracting_entity_id, activities, assigned_profile_id, agreement_required, agreement_reasons, agreement_id,
      settings_version, payment_condition, deposit_percent, payment_terms_check, payment_clarification, amount_due_usd, required_usd, verified_paid_usd, outstanding_usd, conflict_review, basis, confirmed_by)
    values (v_id, enq.id, v_ver, case when prev.id is not null and prev.kind <> 'cancelled' then 'changed' else 'confirmed' end, case when prev.kind <> 'cancelled' then prev.id end, q.id, v_fp, v_entity, v_acts, v_assignee, v_req, v_reasons,
      case when v_req then ag.id end, st.version, v_cond, v_pct, v_check, v_clar, v_due, v_need, v_paid, case when v_due is null then null else greatest(v_due - v_paid, 0) end,
      jsonb_build_object('conflicts', v_conf, 'resolutions', '[]'::jsonb), nullif(btrim(coalesce(p ->> 'basis', '')), ''), p_actor);
  for sg in select * from jsonb_array_elements(p -> 'segments') loop
    i := i + 1;
    insert into public.enquiry_booking_segments (confirmation_id, seq, starts_at, ends_at, timezone, kind, location, platform, note)
      values (v_id, i, (sg ->> 'startsAt')::timestamptz, (sg ->> 'endsAt')::timestamptz, sg ->> 'timezone', sg ->> 'kind', nullif(sg ->> 'location', ''), nullif(sg ->> 'platform', ''), nullif(sg ->> 'note', ''));
  end loop;
  update public.enquiries set crm_stage = 'booked' where id = enq.id and crm_stage::text in ('new_lead', 'contacted', 'discovery_meeting', 'quotation_sent', 'negotiation');
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    values (p_actor, case when prev.id is not null and prev.kind <> 'cancelled' then 'booking.changed' else 'booking.confirmed' end, 'enquiry', enq.id::text,
      jsonb_build_object('confirmationId', v_id, 'version', v_ver, 'quotationFingerprintPrefix', left(v_fp, 12), 'agreementRequired', v_req, 'paymentCondition', v_cond, 'conflictsReviewed', jsonb_array_length(v_conf), 'settingsVersion', st.version));
  return v_id;
end $$;
revoke all on function public.confirm_ordinary_booking(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.confirm_ordinary_booking(jsonb, uuid) to service_role;

-- ------------------------------------------------------------------------------------------------------------------------------ cancel
create or replace function public.cancel_ordinary_booking(p_enquiry uuid, p_reason text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare prev public.enquiry_booking_confirmations%rowtype; v_id uuid := gen_random_uuid();
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || p_enquiry::text));
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = p_enquiry order by version desc limit 1;
  if not found or prev.kind = 'cancelled' then raise exception 'ordift:booking_nothing_to_cancel'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:booking_cancel_reason'; end if;
  insert into public.enquiry_booking_confirmations (id, enquiry_id, version, kind, supersedes_id, quotation_id, quotation_fingerprint, contracting_entity_id, activities, assigned_profile_id, settings_version, reason, confirmed_by)
    values (v_id, p_enquiry, prev.version + 1, 'cancelled', prev.id, prev.quotation_id, prev.quotation_fingerprint, prev.contracting_entity_id, prev.activities, prev.assigned_profile_id, prev.settings_version, btrim(p_reason), p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancelled', 'enquiry', p_enquiry::text, jsonb_build_object('confirmationId', v_id, 'version', prev.version + 1));
  return v_id;
end $$;
revoke all on function public.cancel_ordinary_booking(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_ordinary_booking(uuid, text, uuid) to service_role;

commit;
