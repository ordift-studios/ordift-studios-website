-- Atomic ISSUANCE of an ordinary quotation, with its contracting-entity legal details frozen in the same transaction. LOCAL PROTOTYPE, NOT APPLIED TO PRODUCTION.
--
-- ADDITIVE. Changes no existing row, status, amount, payment, quotation, booking or notification, and backfills nothing (no ordinary quotation has ever been issued with an
-- entity, and quotations issued earlier are left exactly as they are: they have no frozen details and are shown without an entity block, never reconstructed).
--
--   1. private.entity_issue_standing()           the entity's contracting eligibility and the legal details a client document may show, computed from the authoritative
--                                                tables. It is a faithful SQL port of the application's assessContractingEligibility() / buildEntityDisplay(); a parity test
--                                                runs both over the same fixtures.
--   2. public.issue_ordinary_quotation()         ONE transaction: lock the enquiry then the quotation, re-check the draft, resolve the entity that is on record RIGHT NOW,
--                                                verify it can contract, freeze its legal details, set status / issue time / issuer / validity, and write the audit event that
--                                                carries the frozen details. All of it commits together or none of it does; the draft is untouched on any failure.
--   3. booking_contracting_entities_issue_lock   serialises entity recording against issuance (same lock order) and refuses to record a NEW version of an entity that an
--                                                issued ordinary quotation already carries. Defence in depth for the application's own check, and it closes the one race the
--                                                application cannot: choosing an entity in the same instant as an issue.
--
-- Nothing here sends or queues an email or notification, or touches a payment, obligation, invoice, booking, amount due or acceptance. The function is executable by
-- service_role only; the server decides WHO may call it and the function re-checks the actor's role itself.
-- Lock order everywhere is: enquiry row first, then quotation row (same as 0166), so two callers can never deadlock each other.
begin;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 1. Standing and legal details of one entity as of a date.
create or replace function private.entity_issue_standing(p_entity uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employing_entities%rowtype;
  v_n int;
  v_cr public.entity_registrations%rowtype;
  v_permit public.entity_registrations%rowtype;
  v_tax public.entity_registrations%rowtype;
  v_registered boolean;
  v_permit_issued boolean;
  v_blockers text[] := '{}';
  v_ids jsonb := '[]'::jsonb;
begin
  select * into e from public.employing_entities where id = p_entity;
  if not found then return null; end if;

  select count(*) into v_n from public.entity_registrations r where r.employing_entity_id = p_entity and r.status in ('active', 'pending', 'not_issued', 'expired');
  -- the one CURRENT record of a kind (the unique index allows at most one active / pending / not_issued per entity and kind)
  select * into v_cr from public.entity_registrations r where r.employing_entity_id = p_entity and r.kind = 'commercial_registration' and r.status in ('active', 'pending', 'not_issued');
  select * into v_permit from public.entity_registrations r where r.employing_entity_id = p_entity and r.kind = 'commercial_permit' and r.status in ('active', 'pending', 'not_issued');
  select * into v_tax from public.entity_registrations r where r.employing_entity_id = p_entity and r.kind = 'tax_registration' and r.status in ('active', 'pending', 'not_issued');

  if not e.active then v_blockers := array_append(v_blockers, 'The entity is not active.'); end if;
  if e.verification_status is distinct from 'verified' then v_blockers := array_append(v_blockers, 'The entity''s registration has not been verified by a Super Admin.'); end if;
  if v_n > 0 then
    v_registered := v_cr.id is not null and v_cr.status = 'active' and coalesce(v_cr.identifier, '') <> '' and (v_cr.expires_on is null or v_cr.expires_on >= p_today);
    v_permit_issued := v_permit.id is not null and v_permit.status = 'active' and coalesce(v_permit.identifier, '') <> '' and (v_permit.expires_on is null or v_permit.expires_on >= p_today);
    if not v_registered then v_blockers := array_append(v_blockers, 'No current, unexpired commercial registration is on record.'); end if;
    -- a permit is required once the entity is tracking one (any permit record of a counted status)
    if exists (select 1 from public.entity_registrations r where r.employing_entity_id = p_entity and r.kind = 'commercial_permit' and r.status in ('active', 'pending', 'not_issued', 'expired'))
       and not v_permit_issued then
      v_blockers := array_append(v_blockers, 'The commercial permit has not been issued or recorded.');
    end if;
  end if;

  -- what a client document may show: only CURRENT, VERIFIED, unexpired commercial-registration and tax identifiers
  if v_cr.id is not null and v_cr.status = 'active' and v_cr.verified_at is not null and btrim(coalesce(v_cr.identifier, '')) <> '' and (v_cr.expires_on is null or v_cr.expires_on >= p_today) then
    v_ids := v_ids || jsonb_build_array(jsonb_build_object('label', 'Commercial Registration (CR) No.', 'identifier', btrim(v_cr.identifier)));
  end if;
  if v_tax.id is not null and v_tax.status = 'active' and v_tax.verified_at is not null and btrim(coalesce(v_tax.identifier, '')) <> '' and (v_tax.expires_on is null or v_tax.expires_on >= p_today) then
    v_ids := v_ids || jsonb_build_array(jsonb_build_object('label', 'Tax registration No.', 'identifier', btrim(v_tax.identifier)));
  end if;

  return jsonb_build_object(
    'entityName', e.name,
    'eligible', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'legal', jsonb_build_object(
      'legalName', coalesce(nullif(btrim(e.legal_name), ''), btrim(e.name)),
      'registrationType', nullif(btrim(e.registration_type), ''),
      'identifiers', v_ids));
end $$;
revoke all on function private.entity_issue_standing(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 2. Atomic issuance.
create or replace function public.issue_ordinary_quotation(
  p_quotation_id uuid, p_actor uuid, p_valid_until date, p_expected_entity uuid default null, p_audit jsonb default '{}'::jsonb)
returns table (issued_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry uuid;
  q public.client_quotations%rowtype;
  v_entity uuid;
  v_version int;
  v_source text := 'quotation';
  v_issued timestamptz;
  v_today date;
  v_standing jsonb;
  v_event uuid := gen_random_uuid();
  v_standard date;
begin
  if not private.actor_has_role(p_actor, array['admin', 'super_admin']) then
    raise exception 'ordift:not_authorised' using errcode = '42501';
  end if;

  select x.enquiry_id into v_enquiry from public.client_quotations x where x.id = p_quotation_id;
  if not found then raise exception 'ordift:quotation_not_found'; end if;
  if v_enquiry is not null then
    perform 1 from public.enquiries e where e.id = v_enquiry for update;                 -- enquiry first
  end if;
  select * into q from public.client_quotations x where x.id = p_quotation_id for update;   -- then the quotation
  if q.enquiry_id is distinct from v_enquiry then raise exception 'ordift:changed_concurrently'; end if;

  if q.crew_support_request_id is not null then raise exception 'ordift:crew_managed'; end if;
  if q.status <> 'draft' or q.issued_at is not null then raise exception 'ordift:already_issued'; end if;
  if not exists (select 1 from public.client_quotation_items i where i.quotation_id = q.id) then raise exception 'ordift:no_lines'; end if;
  if not (coalesce(q.total, 0) > 0) then raise exception 'ordift:no_total'; end if;

  -- The entity on record NOW (read under the locks above, so a concurrent recording is either already visible or waits for this commit).
  select b.employing_entity_id, b.version into v_entity, v_version from public.booking_contracting_entities b
    where b.subject_type = 'quotation' and b.subject_id = q.id order by b.version desc limit 1;
  if v_entity is null and v_enquiry is not null then
    select b.employing_entity_id, b.version into v_entity, v_version from public.booking_contracting_entities b
      where b.subject_type = 'enquiry' and b.subject_id = v_enquiry order by b.version desc limit 1;
    v_source := 'enquiry';
  end if;
  if v_entity is null then raise exception 'ordift:entity_required'; end if;
  if p_expected_entity is not null and p_expected_entity <> v_entity then raise exception 'ordift:entity_changed'; end if;

  v_issued := clock_timestamp();                                                     -- after the locks: the real moment of issue
  v_today := (v_issued at time zone 'utc')::date;
  v_standing := private.entity_issue_standing(v_entity, v_today);
  if v_standing is null then raise exception 'ordift:entity_unavailable'; end if;
  if not (v_standing ->> 'eligible')::boolean then
    raise exception 'ordift:entity_ineligible' using detail = (select string_agg(x, ' ') from jsonb_array_elements_text(v_standing -> 'blockers') x);
  end if;

  -- validity: never in the past; beyond the standard 30 days only a Super Admin (the application records the reason; this is the backstop)
  v_standard := v_today + 30;
  if p_valid_until is null then raise exception 'ordift:validity_required'; end if;
  if p_valid_until < v_today then raise exception 'ordift:validity_in_past'; end if;
  if p_valid_until > v_standard and not private.actor_has_role(p_actor, array['super_admin']) then raise exception 'ordift:validity_needs_super_admin'; end if;

  update public.client_quotations
     set status = 'sent', issued_at = v_issued, issued_by = p_actor, valid_until = p_valid_until
   where id = q.id;

  insert into public.activity_log (id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_event, p_actor, 'client_quotation.issued', 'client_quotation', q.id,
    coalesce(p_audit, '{}'::jsonb) || jsonb_build_object(
      'quotationReference', q.quotation_reference,
      'from', 'draft',
      'issuedAt', to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'validUntil', p_valid_until,
      'contractingEntity', jsonb_build_object('entityId', v_entity, 'name', v_standing ->> 'entityName', 'recordedOn', v_source, 'version', v_version),
      'legalDetails', jsonb_build_object('entityId', v_entity, 'name', v_standing ->> 'entityName', 'recordedOn', v_source, 'version', v_version,
                                         'capturedAt', to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || (v_standing -> 'legal')));

  return query select v_issued, v_event;
end $$;
revoke all on function public.issue_ordinary_quotation(uuid, uuid, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.issue_ordinary_quotation(uuid, uuid, date, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 3. Recording an entity is serialised with issuance, and an issued quotation's entity is fixed.
create or replace function private.booking_contracting_entities_issue_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry uuid;
  q public.client_quotations%rowtype;
begin
  if new.subject_type = 'quotation' then
    select x.enquiry_id into v_enquiry from public.client_quotations x where x.id = new.subject_id;
    if not found then return new; end if;
    if v_enquiry is not null then perform 1 from public.enquiries e where e.id = v_enquiry for update; end if;      -- enquiry first
    select * into q from public.client_quotations x where x.id = new.subject_id for update;                          -- then the quotation
    if q.crew_support_request_id is not null or q.issued_at is null then return new; end if;
    if exists (select 1 from public.booking_contracting_entities b where b.subject_type = 'quotation' and b.subject_id = q.id)
       or (v_enquiry is not null and exists (select 1 from public.booking_contracting_entities b where b.subject_type = 'enquiry' and b.subject_id = v_enquiry)) then
      raise exception 'ordift:entity_locked_after_issue' using errcode = '42501';
    end if;
  elsif new.subject_type = 'enquiry' then
    perform 1 from public.enquiries e where e.id = new.subject_id for update;
    if exists (select 1 from public.booking_contracting_entities b where b.subject_type = 'enquiry' and b.subject_id = new.subject_id)
       and exists (select 1 from public.client_quotations x where x.enquiry_id = new.subject_id and x.crew_support_request_id is null and x.issued_at is not null) then
      raise exception 'ordift:entity_locked_after_issue' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.booking_contracting_entities_issue_lock() from public, anon, authenticated;
create trigger booking_contracting_entities_issue_lock before insert on public.booking_contracting_entities
  for each row execute function private.booking_contracting_entities_issue_lock();

commit;
