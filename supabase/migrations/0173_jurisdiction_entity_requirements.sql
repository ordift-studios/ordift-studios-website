-- Jurisdiction-aware legal-entity requirements and activity licensing. LOCAL PROTOTYPE, NOT APPLIED TO PRODUCTION.
--
-- Founder clarification 2026-10-26: Ghana (a Registered Business Name, i.e. a sole proprietorship) and Qatar (a W.L.L.) do NOT share one set of requirements. Each jurisdiction has its own
-- document names, identifiers and obligations; irrelevant foreign requirements must not block, and genuinely mandatory evidence must. A new country must not become eligible by itself.
--
-- ADDITIVE. Creates three tables and seeds two of them with the Founder-approved rule sets for Ghana and Qatar; replaces two functions from 0172 (same names; same security, ownership and
-- privileges). It changes NO existing row: no entity, registration, document, signatory, quotation, audit row or financial record is written, renamed or reclassified. In particular it does
-- not record any registration number, does not mark any activity as licensed and does not select a contracting entity.
--
--   1. public.entity_activity_types              the activities Ordift can offer (photography, videography, graphic design, talent management, production services, drone operations).
--   1b. entity_registrations: ONE new registration kind, 'activity_licence' (an activity-specific licence or authorisation, e.g. a drone operating authorisation), and the "one current record per kind"
--                                                unique index now also separates activity licences by their activity (facts.activityKey), so an entity can hold several. Existing rows are unchanged and
--                                                keep exactly the uniqueness they had (their activityKey is absent).
--   2. public.jurisdiction_entity_requirements   the rule catalog: per jurisdiction, each requirement with the jurisdiction's OWN document name and identifier label, its category
--                                                (legal registration, tax registration, operating permission, activity coverage, activity licence, signatory, renewal evidence), and whether it is
--                                                mandatory, conditional on an activity, optional or not applicable. A row counts only once APPROVED (approved_at), so a drafted rule set for a
--                                                new country has no effect until a Super Admin approves it.
--   3. public.entity_activities                  per entity and activity: planned / licensed / suspended / withdrawn. 'licensed' REQUIRES verified, active evidence (a registration of the SAME
--                                                entity); a planned activity can never be treated as licensed. Rows are never deleted.
--   4. private.entity_issue_standing(uuid, date, text[])   REPLACES the 0172 two-argument function. Evaluates the entity against ITS jurisdiction's approved requirements, for the activities
--                                                a quotation declares, and returns eligibility, blockers, advisories, the per-requirement result and the legal details a client document may show.
--                                                Fail-closed: an entity with no jurisdiction, or whose jurisdiction has no approved legal-registration requirement, is not eligible. The application has a
--                                                pure TypeScript port and a parity test runs both over the same fixtures.
--   5. public.issue_ordinary_quotation()         REPLACED with the SAME signature (so privileges, the audit-event guard and the deployed application are unaffected). The only change: it reads the
--                                                declared activities from p_audit->'declaredActivities', rejects unknown activity keys, evaluates the entity for them, and records the activities and the
--                                                per-requirement result in the issuance audit event. Atomicity, locking order, validity rules, the frozen legal details and the audit-event protection of
--                                                0172 are unchanged.
--
-- Nothing here sends or queues an email or notification, or touches a payment, obligation, invoice, booking, amount due or acceptance.
begin;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 1. Activity types.
create table public.entity_activity_types (
  key text primary key check (key ~ '^[a-z][a-z_]*$'),
  label text not null,
  sort_order int not null default 0
);
insert into public.entity_activity_types (key, label, sort_order) values
  ('photography', 'Photography', 10),
  ('videography', 'Videography', 20),
  ('graphic_design', 'Graphic design', 30),
  ('talent_management', 'Talent management', 40),
  ('production_services', 'Production services', 50),
  ('drone_operations', 'Drone operations', 60);
alter table public.entity_activity_types enable row level security;
create policy "entity_activity_types: staff read" on public.entity_activity_types for select to authenticated using ((select private.is_staff_or_admin()));
revoke all on public.entity_activity_types from anon, authenticated, service_role;
grant select on public.entity_activity_types to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 1b. A registration kind for activity-specific licences (additive; no existing row changes).
alter table public.entity_registrations drop constraint entity_registrations_kind_check;
alter table public.entity_registrations add constraint entity_registrations_kind_check check (kind in ('commercial_registration', 'commercial_permit', 'tax_registration', 'establishment_card',
  'trade_name_reservation', 'articles_of_association', 'chamber_membership', 'investment_approval_condition', 'activity_licence'));
drop index public.entity_registrations_one_current;
create unique index entity_registrations_one_current on public.entity_registrations (employing_entity_id, kind, (coalesce(facts ->> 'activityKey', ''))) where status in ('active', 'pending', 'not_issued');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 2. The rule catalog.
create table public.jurisdiction_entity_requirements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  jurisdiction_id uuid not null references public.employment_jurisdictions (id),
  requirement_key text not null check (requirement_key ~ '^[a-z][a-z_:]*$'),
  category text not null check (category in ('legal_registration', 'tax_registration', 'operating_permission', 'activity_coverage', 'activity_licence', 'signatory', 'renewal_evidence')),
  label text not null check (btrim(label) <> ''),                       -- the jurisdiction's OWN name for the document / obligation
  identifier_label text,                                                 -- what its number is called there (shown beside the number on a client document)
  registration_kind text check (registration_kind is null or registration_kind in ('commercial_registration', 'commercial_permit', 'tax_registration', 'establishment_card',
    'trade_name_reservation', 'articles_of_association', 'chamber_membership', 'investment_approval_condition', 'activity_licence')),
  necessity text not null check (necessity in ('mandatory', 'conditional', 'optional', 'not_applicable')),
  condition_activity text references public.entity_activity_types (key),
  requires_verified boolean not null default true,
  requires_in_date boolean not null default true,
  shown_on_document boolean not null default false,
  guidance text,
  sort_order int not null default 0,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint jurisdiction_entity_requirements_unique unique (jurisdiction_id, requirement_key),
  constraint jurisdiction_entity_requirements_conditional check ((necessity = 'conditional') = (condition_activity is not null)),
  constraint jurisdiction_entity_requirements_kind_needed check (category not in ('legal_registration', 'tax_registration', 'operating_permission') or registration_kind is not null)
);
comment on table public.jurisdiction_entity_requirements is
  'Per-jurisdiction requirement catalog for a legal entity to contract. Each jurisdiction uses its own document names and identifiers. mandatory = always blocks if unmet; conditional = blocks only when a quotation declares condition_activity; optional = advisory only; not_applicable = explicitly not required there. Only APPROVED rows (approved_at) take effect: a drafted rule set for a new country does nothing until approved.';
alter table public.jurisdiction_entity_requirements enable row level security;
create policy "jurisdiction_entity_requirements: super admin read" on public.jurisdiction_entity_requirements for select to authenticated using ((select private.is_super_admin()));
revoke all on public.jurisdiction_entity_requirements from anon, authenticated, service_role;
grant select on public.jurisdiction_entity_requirements to authenticated, service_role;

-- Founder-approved rule sets (clarification of 2026-10-26). Approving this migration is the approval of these rows.
-- GHANA: a Registered Business Name (sole proprietorship). Its certificate and TIN are the registration evidence; there is no Qatar-style CR or commercial permit.
insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order, approved_at)
select j.id, v.requirement_key, v.category, v.label, v.identifier_label, v.registration_kind, v.necessity, v.condition_activity, v.requires_verified, v.requires_in_date, v.shown_on_document, v.guidance, v.sort_order, now()
from public.employment_jurisdictions j, (values
  ('legal_registration',  'legal_registration',   'Certificate of Registration of a Business Name (Registrar of Companies)', 'Business Registration No.', 'commercial_registration', 'mandatory',      null::text, true,  true,  true,  'Registration of Business Names Act, 1962 (Act 151). A registered business name is not a separately incorporated company: the proprietor contracts as the business.', 10),
  ('tax_registration',    'tax_registration',     'Tax Identification Number (TIN)',                                           'TIN',                       'tax_registration',        'mandatory',      null,       true,  true,  true,  'The TIN shown on the Business Registration Certificate / Form A.', 20),
  ('operating_permission','operating_permission', 'Commercial permit',                                                         null,                        'commercial_permit',       'not_applicable', null,       true,  true,  false, 'There is no Qatar-style commercial permit for a Ghana business name; it is never required.', 30),
  ('signatory',           'signatory',            'Authorised signatory / proprietor',                                          null,                        null,                      'mandatory',      null,       true,  true,  false, 'The proprietor (or a person authorised by them) must be recorded.', 40),
  ('renewal_evidence',    'renewal_evidence',     'Business-name renewal and registration status',                              null,                        null,                      'optional',       null,       false, true,  false, 'Tracked, not yet blocking: the applicable renewal rule is to be confirmed. If the registration record carries a renewal/expiry date it must be in date.', 50),
  ('activity_coverage',   'activity_coverage',    'Registered nature of business',                                              null,                        null,                      'optional',       null,       true,  true,  false, 'No activity licence is needed for ordinary photography or videography. Activity-specific licences apply only where actually applicable (see drone operations).', 60),
  ('activity_licence:drone_operations', 'activity_licence', 'Drone operating authorisation', 'Authorisation No.',                                      null,                      'conditional',    'drone_operations', true, true, false, 'Only required when a quotation includes drone operations. Ordift Ghana does not operate a drone today.', 70)
) as v(requirement_key, category, label, identifier_label, registration_kind, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order)
where j.slug = 'ghana';

-- QATAR: a Single-Member W.L.L. The Commercial Registration is the identity; the Commercial Permit is what permits operating, so while it is not issued the entity stays blocked. Only activities
-- recorded as LICENSED (with verified evidence) may be quoted; videography, graphic design, talent management and production services are planned and are NOT approved.
insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order, approved_at)
select j.id, v.requirement_key, v.category, v.label, v.identifier_label, v.registration_kind, v.necessity, v.condition_activity, v.requires_verified, v.requires_in_date, v.shown_on_document, v.guidance, v.sort_order, now()
from public.employment_jurisdictions j, (values
  ('legal_registration',  'legal_registration',   'Commercial Registration (CR)',        'Commercial Registration (CR) No.', 'commercial_registration', 'mandatory',      null::text, true,  true,  true,  'Ministry of Commerce and Industry.', 10),
  ('tax_registration',    'tax_registration',     'Tax card (General Tax Authority)',    'Tax registration No.',             'tax_registration',        'mandatory',      null,       true,  true,  true,  'General Tax Authority of Qatar.', 20),
  ('operating_permission','operating_permission', 'Commercial Permit / Licence',         null,                               'commercial_permit',       'mandatory',      null,       true,  true,  false, 'Until it is issued, recorded and verified the entity must not issue ordinary commercial quotations.', 30),
  ('signatory',           'signatory',            'Authorised signatory / manager',      null,                               null,                      'mandatory',      null,       true,  true,  false, 'A manager or owner with authority must be recorded.', 40),
  ('establishment_card',  'operating_permission', 'Establishment Card',                  null,                               'establishment_card',      'optional',       null,       true,  true,  false, 'Recorded and tracked; not yet a blocking requirement.', 50),
  ('renewal_evidence',    'renewal_evidence',     'Registration renewal',                null,                               null,                      'optional',       null,       false, true,  false, 'The CR and establishment card expire after one year; an expired CR blocks.', 60),
  ('activity_coverage',   'activity_coverage',    'Licensed activities',                 null,                               null,                      'mandatory',      null,       true,  true,  false, 'Every activity a quotation covers must be recorded as LICENSED for the entity, with verified evidence. A planned activity is never treated as licensed.', 70)
) as v(requirement_key, category, label, identifier_label, registration_kind, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order)
where j.slug = 'qatar';

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 3. Activities per entity.
create table public.entity_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  activity_key text not null references public.entity_activity_types (key),
  status text not null check (status in ('planned', 'licensed', 'suspended', 'withdrawn')),
  evidence_registration_id uuid references public.entity_registrations (id),
  note text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_activities_unique unique (employing_entity_id, activity_key),
  constraint entity_activities_licensed_needs_evidence check (status <> 'licensed' or evidence_registration_id is not null)
);
comment on table public.entity_activities is
  'Which activities an entity may carry out. planned = intended, NOT approved and never treated as licensed. licensed = approved, and only with active, verified evidence (a registration of the same entity). Rows are never deleted; withdrawn / suspended record the change.';

create or replace function private.entity_activities_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.entity_registrations%rowtype;
begin
  if tg_op = 'DELETE' then raise exception 'entity_activities rows are never deleted: set the status to withdrawn' using errcode = '42501'; end if;
  new.updated_at := now();
  if new.status = 'licensed' then
    if new.evidence_registration_id is null then raise exception 'ordift:activity_needs_evidence' using errcode = '23514'; end if;
    select * into r from public.entity_registrations x where x.id = new.evidence_registration_id;
    if not found or r.employing_entity_id <> new.employing_entity_id then raise exception 'ordift:activity_evidence_not_this_entity' using errcode = '23514'; end if;
    if r.status <> 'active' or r.verified_at is null then raise exception 'ordift:activity_evidence_not_verified' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function private.entity_activities_guard() from public, anon, authenticated;
create trigger entity_activities_guard before insert or update or delete on public.entity_activities for each row execute function private.entity_activities_guard();
alter table public.entity_activities enable row level security;
create policy "entity_activities: super admin read" on public.entity_activities for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_activities from anon, authenticated, service_role;
grant select on public.entity_activities to authenticated;
grant select, insert, update on public.entity_activities to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 4. Standing of one entity, against ITS jurisdiction's approved requirements, for the activities a quotation declares.
drop function private.entity_issue_standing(uuid, date);
create or replace function private.entity_issue_standing(p_entity uuid, p_today date, p_activities text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employing_entities%rowtype;
  j public.employment_jurisdictions%rowtype;
  r public.jurisdiction_entity_requirements%rowtype;
  reg public.entity_registrations%rowtype;
  act public.entity_activities%rowtype;
  ev public.entity_registrations%rowtype;
  v_acts text[];
  v_declared boolean := p_activities is not null;     -- null = the activities are not declared yet (selection time): activity coverage is judged when the quotation is issued
  v_blockers text[] := '{}';
  v_adv text[] := '{}';
  v_reqs jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_configured boolean := false;
  v_met boolean;
  v_msgs text[];
  v_applies boolean;
  v_a text;
  v_alabel text;
  v_cr public.entity_registrations%rowtype;
begin
  select * into e from public.employing_entities where id = p_entity;
  if not found then return null; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_acts from unnest(coalesce(p_activities, '{}')) x;

  if not e.active then v_blockers := array_append(v_blockers, 'The entity is not active.'); end if;
  if e.verification_status is distinct from 'verified' then v_blockers := array_append(v_blockers, 'The entity''s registration has not been verified by a Super Admin.'); end if;
  if e.jurisdiction_id is null then
    v_blockers := array_append(v_blockers, 'The entity has no jurisdiction recorded.');
  else
    select * into j from public.employment_jurisdictions where id = e.jurisdiction_id;
    v_configured := exists (select 1 from public.jurisdiction_entity_requirements q where q.jurisdiction_id = e.jurisdiction_id and q.approved_at is not null
                            and q.category = 'legal_registration' and q.necessity = 'mandatory');
    if not v_configured then
      v_blockers := array_append(v_blockers, 'No approved registration requirements are defined for ' || j.name || ' yet; a Super Admin must define and approve them before an entity there can contract.');
    end if;
  end if;

  if v_configured then
    for r in select * from public.jurisdiction_entity_requirements q where q.jurisdiction_id = e.jurisdiction_id and q.approved_at is not null order by q.sort_order, q.requirement_key loop
      if r.necessity = 'not_applicable' then
        v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('key', r.requirement_key, 'label', r.label, 'necessity', r.necessity, 'applies', false, 'met', true, 'blocking', false));
        continue;
      end if;
      v_applies := r.necessity in ('mandatory', 'optional') or (r.necessity = 'conditional' and r.condition_activity = any (v_acts));
      if not v_applies then
        v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('key', r.requirement_key, 'label', r.label, 'necessity', r.necessity, 'applies', false, 'met', true, 'blocking', false));
        continue;
      end if;
      v_msgs := '{}';

      if r.category in ('legal_registration', 'tax_registration', 'operating_permission') then
        select * into reg from public.entity_registrations x where x.employing_entity_id = e.id and x.kind = r.registration_kind and x.status in ('active', 'pending', 'not_issued');
        if not found then
          if exists (select 1 from public.entity_registrations x where x.employing_entity_id = e.id and x.kind = r.registration_kind and x.status = 'expired') then
            v_msgs := array_append(v_msgs, r.label || ' has expired.');
          else
            v_msgs := array_append(v_msgs, r.label || ' is not on record.');
          end if;
        elsif reg.status in ('pending', 'not_issued') then
          v_msgs := array_append(v_msgs, r.label || ' has not been issued.');
        elsif coalesce(reg.identifier, '') = '' then
          v_msgs := array_append(v_msgs, r.label || ' has no identifier recorded.');
        elsif r.requires_in_date and reg.expires_on is not null and reg.expires_on < p_today then
          v_msgs := array_append(v_msgs, r.label || ' expired on ' || reg.expires_on::text || '.');
        elsif r.requires_verified and reg.verified_at is null then
          v_msgs := array_append(v_msgs, r.label || ' has not been verified.');
        end if;
        -- what a client document may show: only a CURRENT, VERIFIED, unexpired record's identifier
        if r.shown_on_document and found and reg.status = 'active' and reg.verified_at is not null and btrim(coalesce(reg.identifier, '')) <> '' and (reg.expires_on is null or reg.expires_on >= p_today) then
          v_ids := v_ids || jsonb_build_array(jsonb_build_object('label', coalesce(r.identifier_label, r.label), 'identifier', btrim(reg.identifier)));
        end if;

      elsif r.category = 'signatory' then
        if not exists (select 1 from public.entity_signatories s where s.employing_entity_id = e.id and (s.effective_from is null or s.effective_from <= p_today) and (s.effective_to is null or s.effective_to >= p_today)) then
          v_msgs := array_append(v_msgs, 'No authorised signatory is recorded for the entity.');
        end if;

      elsif r.category = 'renewal_evidence' then
        select * into v_cr from public.entity_registrations x where x.employing_entity_id = e.id and x.kind = 'commercial_registration' and x.status in ('active', 'pending', 'not_issued');
        if not found or v_cr.expires_on is null then
          v_msgs := array_append(v_msgs, r.label || ': no renewal or expiry date is recorded; confirm whether one applies.');
        end if;

      elsif r.category = 'activity_coverage' and (r.necessity <> 'mandatory' or not v_declared) then
        null;                                                                          -- informational where a jurisdiction does not require licensed activities (e.g. Ghana); judged at issue where it does

      elsif r.category in ('activity_coverage', 'activity_licence') then
        if r.category = 'activity_coverage' and cardinality(v_acts) = 0 then
          v_msgs := array_append(v_msgs, 'State the activities this quotation covers.');
        end if;
        foreach v_a in array case when r.category = 'activity_licence' then array[r.condition_activity] else v_acts end loop
          select coalesce((select t.label from public.entity_activity_types t where t.key = v_a), v_a) into v_alabel;
          select * into act from public.entity_activities x where x.employing_entity_id = e.id and x.activity_key = v_a;
          if not found or act.status = 'withdrawn' then
            v_msgs := array_append(v_msgs, v_alabel || ' is not licensed for this entity.');
          elsif act.status = 'planned' then
            v_msgs := array_append(v_msgs, v_alabel || ' is planned for this entity but not yet licensed.');
          elsif act.status = 'suspended' then
            v_msgs := array_append(v_msgs, v_alabel || ' is suspended for this entity.');
          else
            select * into ev from public.entity_registrations x where x.id = act.evidence_registration_id;
            if not found or ev.status <> 'active' or ev.verified_at is null then
              v_msgs := array_append(v_msgs, v_alabel || ': its licensing evidence is not verified.');
            elsif ev.expires_on is not null and ev.expires_on < p_today then
              v_msgs := array_append(v_msgs, v_alabel || ': its licensing evidence expired on ' || ev.expires_on::text || '.');
            end if;
          end if;
        end loop;
      end if;

      v_met := cardinality(v_msgs) = 0;
      if not v_met then
        if r.necessity = 'optional' then v_adv := v_adv || v_msgs; else v_blockers := v_blockers || v_msgs; end if;
      end if;
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('key', r.requirement_key, 'label', r.label, 'necessity', r.necessity, 'applies', true, 'met', v_met, 'blocking', (not v_met) and r.necessity <> 'optional'));
    end loop;
  end if;

  return jsonb_build_object(
    'entityName', e.name,
    'jurisdiction', case when e.jurisdiction_id is null then null else j.name end,
    'eligible', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'advisories', to_jsonb(v_adv),
    'requirements', v_reqs,
    'declaredActivities', to_jsonb(v_acts),
    'legal', jsonb_build_object(
      'legalName', coalesce(nullif(btrim(e.legal_name), ''), btrim(e.name)),
      'registrationType', nullif(btrim(e.registration_type), ''),
      'identifiers', v_ids));
end $$;
revoke all on function private.entity_issue_standing(uuid, date, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 5. Atomic issuance (0172) with the declared activities evaluated. SAME signature, owner and privileges; the audit-event guard from 0172 is untouched.
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
  v_acts text[];
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

  -- The activities this quotation declares (p_audit->'declaredActivities'): normalised, and every key must be a known activity type.
  select coalesce(array_agg(distinct x order by x), '{}') into v_acts from jsonb_array_elements_text(coalesce(p_audit -> 'declaredActivities', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_acts) a where not exists (select 1 from public.entity_activity_types t where t.key = a)) then raise exception 'ordift:unknown_activity'; end if;

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
  v_standing := private.entity_issue_standing(v_entity, v_today, v_acts);
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

  -- provenance marker for activity_log_issuance_guard (transaction-local; bound to this event id and quotation)
  perform set_config('ordift.issuing_quotation', v_event::text || ':' || q.id::text, true);
  insert into public.activity_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values (v_event, p_actor, 'client_quotation.issued', 'client_quotation', q.id,
    coalesce(p_audit, '{}'::jsonb) || jsonb_build_object(
      'quotationReference', q.quotation_reference,
      'from', 'draft',
      'issuedAt', to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'validUntil', p_valid_until,
      'declaredActivities', to_jsonb(v_acts),
      'entityRequirements', v_standing -> 'requirements',
      'entityAdvisories', v_standing -> 'advisories',
      'contractingEntity', jsonb_build_object('entityId', v_entity, 'name', v_standing ->> 'entityName', 'recordedOn', v_source, 'version', v_version),
      'legalDetails', jsonb_build_object('entityId', v_entity, 'name', v_standing ->> 'entityName', 'recordedOn', v_source, 'version', v_version,
                                         'capturedAt', to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || (v_standing -> 'legal')), v_issued);
  perform set_config('ordift.issuing_quotation', '', true);

  return query select v_issued, v_event;
end $$;
revoke all on function public.issue_ordinary_quotation(uuid, uuid, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.issue_ordinary_quotation(uuid, uuid, date, uuid, jsonb) to service_role;

commit;
