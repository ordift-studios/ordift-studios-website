-- Jurisdiction-aware legal-entity requirements, activity authorisation and renewal tracking. LOCAL PROTOTYPE, NOT APPLIED TO PRODUCTION.
--
-- Founder clarifications 2026-10-26: the business is ORDIFT. Ghana (a Registered Business Name, i.e. a SOLE PROPRIETORSHIP) and Qatar (a W.L.L.) do NOT share one rule set. Each jurisdiction has its
-- own document names, identifiers and obligations; irrelevant foreign requirements must not block, and genuinely mandatory evidence must. A new country must not become eligible by itself.
--
-- ADDITIVE. Creates five tables and seeds three of them with the Founder-approved rule sets for Ghana and Qatar; adds nullable columns; replaces two functions from 0172 (same names; same security,
-- ownership and privileges). It changes NO existing row: no entity, registration, document, signatory, quotation, audit row or financial record is written, renamed or reclassified. In particular it does
-- not record any registration number or TIN, does not set any signatory's legal capacity, does not mark any activity as licensed or any renewal as confirmed, and does not select a contracting entity.
--
--   1.  public.entity_activity_types            the activities Ordift can offer (photography, videography, graphic design, talent management, production services, drone operations).
--   1b. entity_registrations                    ONE new registration kind, 'activity_licence' (an activity-specific licence or authorisation, e.g. a drone operating authorisation); the "one current
--                                               record per kind" unique index also separates activity licences by activity (facts.activityKey). Existing rows keep exactly the uniqueness they had.
--   1c. entity_signatories.legal_capacity      the LEGAL capacity in which a person may contract (sole proprietor, owner, director, manager, authorised signatory), kept SEPARATE from `position`,
--       and the person link (profile_id)       the management title (e.g. Chief Executive Officer). A title alone never gives contracting authority. Each of the two can be set ONCE from empty
--                                               (never changed, never cleared) and nothing else on the row can change, so one existing row can carry both a title and a legal capacity and be
--                                               linked to the one person it belongs to, without a duplicate row and without rewriting history. A person can be linked to a CURRENT signatory row
--                                               of an entity only once. The same person (profile) may hold rows in several entities (Ghana and Qatar).
--   1d. employing_entity_documents              page_number / page_count and the relation 'continuation_page_of', so pages 2 and 3 of a multi-page official form attach to the SAME registration
--                                               document as page 1 without touching page 1 or creating a second registration.
--   2.  public.jurisdiction_entity_requirements the rule catalog: per jurisdiction, each requirement with the jurisdiction's OWN document name and identifier label, its category, and whether it is
--                                               mandatory, conditional on an activity, optional or not applicable. Only APPROVED rows count, so a drafted rule set for a new country has no effect.
--   2b. public.jurisdiction_activity_codes      maps a registered activity code printed on a registration (e.g. Qatar 742010) to Ordift's activity (photography).
--   3.  public.entity_activities                per entity and activity: planned / licensed / suspended / withdrawn. 'licensed' REQUIRES verified, active evidence; a planned activity is never licensed.
--   3b. public.entity_renewal_confirmations     the annual renewal history of a registration (Ghana business names renew every year), kept SEPARATE from the certificate's own expiry. A statement by
--                                               the Founder is recorded as exactly that ("Founder-confirmed — official verification pending"), never as a government confirmation.
--   4.  private.entity_issue_standing(uuid, date, text[])   REPLACES the 0172 two-argument function. Evaluates the entity against ITS jurisdiction's approved requirements for the activities a quotation
--                                               declares. Fail-closed. The application has a pure TypeScript port; a parity test runs both over the same fixtures.
--   5.  public.issue_ordinary_quotation()       REPLACED with the SAME signature. Atomicity, lock order, validity rules, frozen legal details and audit-event protection of 0172 are unchanged.
--
-- What blocks, and what is only tracked (decided with the Founder's clarifications):
--   BLOCKS issuing: the entity not active/verified; no approved rule set for its jurisdiction; its legal registration missing/expired/unverified; (Qatar) the commercial permit not issued or verified;
--                   no recorded signatory holding a contracting legal capacity; an activity that is not licensed/registered for the entity (where the jurisdiction requires it); a renewal recorded as LAPSED.
--   TRACKED only:   the tax identifier (needed at invoicing, not to offer a quotation), the establishment card, and renewal that is unknown or Founder-confirmed but not yet officially verified.
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
-- 1c. Legal capacity of a signatory, separate from the management title.
alter table public.entity_signatories add column legal_capacity text
  check (legal_capacity is null or legal_capacity in ('sole_proprietor', 'owner', 'director', 'manager', 'authorised_signatory'));
comment on column public.entity_signatories.legal_capacity is
  'The LEGAL capacity in which this person may bind the entity (sole proprietor / owner / director / manager / authorised signatory). `position` is only the management title (e.g. Chief Executive Officer) and never gives contracting authority. Empty = not yet recorded; it can be set once and never changed (a change is a new effective-dated row). The person link (profile_id) follows the same set-once rule.';
create or replace function private.entity_signatories_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_signatories rows are never deleted: end-date the row and add a new one' using errcode = '42501'; end if;
  -- nothing but the legal capacity and the person link can change, and each only from empty
  if to_jsonb(new) - 'legal_capacity' - 'profile_id' is distinct from to_jsonb(old) - 'legal_capacity' - 'profile_id' then
    raise exception 'ordift:signatory_immutable: only the legal capacity and the person link can be set, each once' using errcode = '42501';
  end if;
  if old.legal_capacity is not null and new.legal_capacity is distinct from old.legal_capacity then
    raise exception 'ordift:signatory_capacity_fixed: the legal capacity of a recorded signatory is not changed; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.profile_id is not null and new.profile_id is distinct from old.profile_id then
    raise exception 'ordift:signatory_person_fixed: the person a signatory is linked to is not changed or cleared; add a new effective-dated row' using errcode = '42501';
  end if;
  if old.profile_id is null and new.profile_id is not null then
    if new.effective_to is not null then raise exception 'ordift:signatory_not_current: only a current signatory can be linked to a person' using errcode = '23514'; end if;
    if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.access_status = 'active') then
      raise exception 'ordift:signatory_person_not_active: the person must have an active account record' using errcode = '23514';
    end if;
    if exists (select 1 from public.entity_signatories s where s.employing_entity_id = new.employing_entity_id and s.profile_id = new.profile_id and s.id <> new.id and s.effective_to is null) then
      raise exception 'ordift:signatory_person_conflict: this person is already a current signatory of this entity' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.entity_signatories_guard() from public, anon, authenticated;
create trigger entity_signatories_guard before update or delete on public.entity_signatories for each row execute function private.entity_signatories_guard();
grant update (legal_capacity, profile_id) on public.entity_signatories to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 1d. Continuation pages of a multi-page official document (additive; page 1 and every existing document are untouched).
alter table public.employing_entity_documents
  add column page_number int check (page_number is null or page_number >= 2),
  add column page_count int check (page_count is null or page_count >= 2);
alter table public.employing_entity_documents drop constraint employing_entity_documents_relation_check;
alter table public.employing_entity_documents add constraint employing_entity_documents_relation_check
  check (relation is null or relation in ('exact_duplicate_of', 'partial_overlap_of', 'new_version_of', 'continuation_page_of'));
alter table public.employing_entity_documents add constraint employing_entity_documents_page_shape
  check ((relation = 'continuation_page_of') = (page_number is not null) and (page_number is null or (page_count is not null and page_number <= page_count)));
create unique index employing_entity_documents_one_page on public.employing_entity_documents (related_document_id, page_number) where relation = 'continuation_page_of';

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
  identifier_pattern text,                                               -- the format observed on that jurisdiction's documents; used to CHECK a number when it is recorded (never to invent one)
  registration_kind text check (registration_kind is null or registration_kind in ('commercial_registration', 'commercial_permit', 'tax_registration', 'establishment_card',
    'trade_name_reservation', 'articles_of_association', 'chamber_membership', 'investment_approval_condition', 'activity_licence')),
  signatory_capacities text[],                                           -- for category 'signatory': the legal capacities that count as authority to contract
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
  constraint jurisdiction_entity_requirements_kind_needed check (category not in ('legal_registration', 'tax_registration', 'operating_permission') or registration_kind is not null),
  constraint jurisdiction_entity_requirements_capacities_needed check (category <> 'signatory' or cardinality(signatory_capacities) > 0)
);
comment on table public.jurisdiction_entity_requirements is
  'Per-jurisdiction requirement catalog for a legal entity to contract. Each jurisdiction uses its own document names and identifiers. mandatory = always blocks if unmet; conditional = blocks only when a quotation declares condition_activity; optional = advisory only; not_applicable = explicitly not required there. Only APPROVED rows (approved_at) take effect: a drafted rule set for a new country does nothing until approved.';
alter table public.jurisdiction_entity_requirements enable row level security;
create policy "jurisdiction_entity_requirements: super admin read" on public.jurisdiction_entity_requirements for select to authenticated using ((select private.is_super_admin()));
revoke all on public.jurisdiction_entity_requirements from anon, authenticated, service_role;
grant select on public.jurisdiction_entity_requirements to authenticated, service_role;

-- GHANA: a Registered Business Name (sole proprietorship). Its Certificate of Registration (Act 151) is the registration evidence; there is no Qatar-style CR or commercial permit. The TIN is the proprietor's
-- personal tax number: tracked, NOT shown on client documents (privacy) and not a precondition to OFFER a quotation (it matters at invoicing). Annual renewal is tracked separately.
insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, identifier_pattern, registration_kind, signatory_capacities, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order, approved_at)
select j.id, v.requirement_key, v.category, v.label, v.identifier_label, v.identifier_pattern, v.registration_kind, v.signatory_capacities, v.necessity, v.condition_activity, v.requires_verified, v.requires_in_date, v.shown_on_document, v.guidance, v.sort_order, now()
from public.employment_jurisdictions j, (values
  ('legal_registration',  'legal_registration',   'Certificate of Registration of a Business Name (Registrar of Companies)', 'Business Registration No.', '^BN[0-9]{9}$',  'commercial_registration', null::text[], 'mandatory',      null::text, true,  true,  true,  'Registration of Business Names Act, 1962 (Act 151). A registered business name is a sole proprietorship, not a separately incorporated company: the proprietor contracts as the business.', 10),
  ('tax_registration',    'tax_registration',     'Tax Identification Number (TIN)',                                           'TIN',                       '^P[0-9]{10}$', 'tax_registration',        null,         'optional',       null,       true,  true,  false, 'The proprietor''s TIN, shown on the Certificate / Form A. Tracked; not printed on client documents unless the Founder decides otherwise.', 20),
  ('operating_permission','operating_permission', 'Commercial permit',                                                         null,                        null,           'commercial_permit',       null,         'not_applicable', null,       true,  true,  false, 'There is no Qatar-style commercial permit for a Ghana business name; it is never required.', 30),
  ('signatory',           'signatory',            'Proprietor / authorised signatory with legal authority',                     null,                        null,           null,                      array['sole_proprietor', 'authorised_signatory'], 'mandatory', null, true, true, false, 'Someone must hold LEGAL authority to contract: the sole proprietor, or a person the proprietor has authorised. A management title (e.g. Chief Executive Officer) alone is not authority.', 40),
  ('renewal_evidence',    'renewal_evidence',     'Annual business-name renewal',                                               null,                        null,           null,                      null,         'optional',       null,       false, true,  false, 'Renewal is annual (Act 151, s.5A(2), as applied by the Office of the Registrar of Companies). Tracked separately from the certificate. Unknown or Founder-confirmed is advisory; a renewal recorded as LAPSED blocks.', 50),
  ('activity_coverage',   'activity_coverage',    'Registered nature of business',                                              null,                        null,           null,                      null,         'optional',       null,       true,  true,  false, 'No activity licence is needed for ordinary photography or videography. Activity-specific licences apply only where actually applicable (see drone operations).', 60),
  ('activity_licence:drone_operations', 'activity_licence', 'Drone operating authorisation', 'Authorisation No.', null,                                      null,                      null,         'conditional',    'drone_operations', true, true, false, 'Only required when a quotation includes drone operations. Ordift Ghana does not operate a drone today.', 70)
) as v(requirement_key, category, label, identifier_label, identifier_pattern, registration_kind, signatory_capacities, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order)
where j.slug = 'ghana';

-- QATAR: a Single-Member W.L.L. The Commercial Registration is the identity; the Commercial Permit is what permits operating, so while it is not issued the entity stays blocked. Only activities LISTED on the CR
-- (mapped below) or explicitly recorded as licensed may be quoted; videography, graphic design, talent management and production services are planned and are NOT approved.
insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, identifier_pattern, registration_kind, signatory_capacities, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order, approved_at)
select j.id, v.requirement_key, v.category, v.label, v.identifier_label, v.identifier_pattern, v.registration_kind, v.signatory_capacities, v.necessity, v.condition_activity, v.requires_verified, v.requires_in_date, v.shown_on_document, v.guidance, v.sort_order, now()
from public.employment_jurisdictions j, (values
  ('legal_registration',  'legal_registration',   'Commercial Registration (CR)',        'Commercial Registration (CR) No.', null::text, 'commercial_registration', null::text[], 'mandatory',      null::text, true,  true,  true,  'Ministry of Commerce and Industry. The CR itself expires after one year: an expired CR blocks.', 10),
  ('tax_registration',    'tax_registration',     'Tax card (General Tax Authority)',    'Tax registration No.',             null,       'tax_registration',        null,         'optional',       null,       true,  true,  true,  'General Tax Authority of Qatar. The company''s tax number; tracked, not a precondition to offer a quotation.', 20),
  ('operating_permission','operating_permission', 'Commercial Permit / Licence',         null,                               null,       'commercial_permit',       null,         'mandatory',      null,       true,  true,  false, 'Until it is issued, recorded and verified the entity must not issue ordinary commercial quotations.', 30),
  ('signatory',           'signatory',            'Owner / manager with legal authority', null,                              null,       null,                      array['owner', 'director', 'manager', 'authorised_signatory'], 'mandatory', null, true, true, false, 'An owner, director or manager with authority must be recorded with that legal capacity.', 40),
  ('establishment_card',  'operating_permission', 'Establishment Card',                  null,                               null,       'establishment_card',      null,         'optional',       null,       true,  true,  false, 'Recorded and tracked; not yet a blocking requirement (the Founder to confirm).', 50),
  ('renewal_evidence',    'renewal_evidence',     'Registration renewal',                null,                               null,       null,                      null,         'not_applicable', null,       false, true,  false, 'Qatar renewal is a new CR with its own expiry date; that expiry is enforced by the legal-registration requirement.', 60),
  ('activity_coverage',   'activity_coverage',    'Registered and licensed activities',  null,                               null,       null,                      null,         'mandatory',      null,       true,  true,  false, 'Every activity a quotation covers must be LISTED on the verified Commercial Registration (see jurisdiction_activity_codes) or recorded as LICENSED with verified evidence. A planned activity never counts.', 70)
) as v(requirement_key, category, label, identifier_label, identifier_pattern, registration_kind, signatory_capacities, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, guidance, sort_order)
where j.slug = 'qatar';

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 2b. Registered activity codes -> Ordift activities. Qatar's Commercial Registration lists activity code 742010, "Photographic activities".
create table public.jurisdiction_activity_codes (
  jurisdiction_id uuid not null references public.employment_jurisdictions (id),
  activity_code text not null check (btrim(activity_code) <> ''),
  activity_key text not null references public.entity_activity_types (key),
  description text not null,
  primary key (jurisdiction_id, activity_code)
);
comment on table public.jurisdiction_activity_codes is 'Which Ordift activity a code printed on a jurisdiction''s registration stands for. Being LISTED on the registration is not by itself permission to operate: where an operating permit is required it must also be met.';
alter table public.jurisdiction_activity_codes enable row level security;
create policy "jurisdiction_activity_codes: super admin read" on public.jurisdiction_activity_codes for select to authenticated using ((select private.is_super_admin()));
revoke all on public.jurisdiction_activity_codes from anon, authenticated, service_role;
grant select on public.jurisdiction_activity_codes to authenticated, service_role;
insert into public.jurisdiction_activity_codes (jurisdiction_id, activity_code, activity_key, description)
select j.id, '742010', 'photography', 'Photographic activities' from public.employment_jurisdictions j where j.slug = 'qatar';

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
  'Explicit activity decisions for an entity. planned = intended, NOT approved and never treated as licensed (it also blocks an activity that would otherwise be derived from a registration). licensed = approved, and only with active, verified evidence of the same entity. Rows are never deleted; withdrawn / suspended record the change.';

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
-- 3b. Renewal history of a registration (e.g. a Ghana business name, renewed every year). Append-only; the LATEST confirmation (by the period it covers) is the current one.
--     founder_confirmed  = the Founder's own statement (basis founder_statement). NOT a government confirmation: it needs no document and carries no official reference.
--     official_verified  = checked against the Registrar's records or shown by a renewal certificate / receipt; requires a verifier. An official reference is stored only if one actually exists.
--     lapsed             = recorded as lapsed / struck off. This is a known adverse fact and blocks issuing.
create table public.entity_renewal_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  registration_id uuid not null references public.entity_registrations (id),
  covers_from date not null,
  covers_to date not null,
  status text not null check (status in ('founder_confirmed', 'official_verified', 'lapsed')),
  basis text not null check (basis in ('founder_statement', 'official_registry_check', 'renewal_certificate_or_receipt')),
  statement text,
  official_reference text,
  next_due_on date,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  source_document_id uuid references public.employing_entity_documents (id),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint entity_renewal_period check (covers_to >= covers_from),
  constraint entity_renewal_founder_basis check (status <> 'founder_confirmed' or (basis = 'founder_statement' and official_reference is null and verified_by is null)),
  constraint entity_renewal_official_basis check (status <> 'official_verified' or (basis in ('official_registry_check', 'renewal_certificate_or_receipt') and verified_by is not null and verified_at is not null)),
  constraint entity_renewal_reference_only_if_official check (official_reference is null or basis in ('official_registry_check', 'renewal_certificate_or_receipt'))
);
comment on table public.entity_renewal_confirmations is 'Append-only renewal history. A Founder statement is stored as founder_confirmed with basis founder_statement and can never carry an official reference. No renewal date, transaction number or document is invented: every field is either supplied or empty.';
create or replace function private.entity_renewal_confirmations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'entity_renewal_confirmations is append-only: record a new confirmation instead' using errcode = '42501'; end $$;
revoke all on function private.entity_renewal_confirmations_guard() from public, anon, authenticated;
create trigger entity_renewal_confirmations_guard before update or delete on public.entity_renewal_confirmations for each row execute function private.entity_renewal_confirmations_guard();
create index entity_renewal_confirmations_entity_idx on public.entity_renewal_confirmations (employing_entity_id, covers_to desc, created_at desc);
alter table public.entity_renewal_confirmations enable row level security;
create policy "entity_renewal_confirmations: super admin read" on public.entity_renewal_confirmations for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_renewal_confirmations from anon, authenticated, service_role;
grant select on public.entity_renewal_confirmations to authenticated;
grant select, insert on public.entity_renewal_confirmations to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- 4. Standing of one entity, against ITS jurisdiction's approved requirements, for the activities a quotation declares.
--    p_activities null  = not declared yet (selection time): activity coverage is judged when the quotation is issued.  empty array = declared none.
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
  rn public.entity_renewal_confirmations%rowtype;
  v_acts text[];
  v_declared boolean := p_activities is not null;
  v_blockers text[] := '{}';
  v_adv text[] := '{}';
  v_reqs jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_actstates jsonb := '[]'::jsonb;
  v_configured boolean := false;
  v_met boolean;
  v_msgs text[];
  v_applies boolean;
  v_a text;
  v_alabel text;
  v_state text;
  v_cr public.entity_registrations%rowtype;
  v_cr_ok boolean;
  v_lapsed boolean;
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
    -- the current legal registration (the one whose listed activities may stand for an activity)
    select * into v_cr from public.entity_registrations x where x.employing_entity_id = e.id and x.kind = 'commercial_registration' and x.status in ('active', 'pending', 'not_issued');
    v_cr_ok := found and v_cr.status = 'active' and v_cr.verified_at is not null and (v_cr.expires_on is null or v_cr.expires_on >= p_today);

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
      v_lapsed := false;

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
        -- what a client document may show: only a CURRENT, VERIFIED, unexpired record's identifier, and only where the jurisdiction's rule says it is shown
        if r.shown_on_document and found and reg.status = 'active' and reg.verified_at is not null and btrim(coalesce(reg.identifier, '')) <> '' and (reg.expires_on is null or reg.expires_on >= p_today) then
          v_ids := v_ids || jsonb_build_array(jsonb_build_object('label', coalesce(r.identifier_label, r.label), 'identifier', btrim(reg.identifier)));
        end if;

      elsif r.category = 'signatory' then
        -- LEGAL authority only: the management title (position) is irrelevant here
        if not exists (select 1 from public.entity_signatories s where s.employing_entity_id = e.id and (s.effective_from is null or s.effective_from <= p_today) and (s.effective_to is null or s.effective_to >= p_today)
                         and s.legal_capacity = any (r.signatory_capacities)) then
          v_msgs := array_append(v_msgs, 'No signatory with legal authority to contract is recorded for the entity.');
        end if;

      elsif r.category = 'renewal_evidence' then
        select * into rn from public.entity_renewal_confirmations x where x.employing_entity_id = e.id order by x.covers_to desc, x.created_at desc limit 1;
        if not found then
          v_msgs := array_append(v_msgs, r.label || ': no renewal confirmation is recorded.');
        elsif rn.status = 'lapsed' then
          v_lapsed := true;
          v_blockers := array_append(v_blockers, r.label || ': the registration is recorded as lapsed.');     -- a KNOWN adverse fact blocks whatever the requirement's necessity
        elsif rn.status = 'founder_confirmed' then
          v_msgs := array_append(v_msgs, r.label || ': Founder-confirmed; official verification pending.');
        end if;
        if found and rn.status <> 'lapsed' and rn.next_due_on is not null and rn.next_due_on < p_today and rn.status <> 'official_verified' then
          v_msgs := array_append(v_msgs, r.label || ': the renewal due ' || rn.next_due_on::text || ' has passed; confirm the latest renewal.');
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
          v_state := null;
          if found and act.status in ('planned', 'suspended') then
            v_state := act.status;
            v_msgs := array_append(v_msgs, v_alabel || case act.status when 'planned' then ' is planned for this entity but not yet licensed.' else ' is suspended for this entity.' end);
          elsif found and act.status = 'licensed' then
            select * into ev from public.entity_registrations x where x.id = act.evidence_registration_id;
            if not found or ev.status <> 'active' or ev.verified_at is null then
              v_state := 'not_licensed';
              v_msgs := array_append(v_msgs, v_alabel || ': its licensing evidence is not verified.');
            elsif ev.expires_on is not null and ev.expires_on < p_today then
              v_state := 'not_licensed';
              v_msgs := array_append(v_msgs, v_alabel || ': its licensing evidence expired on ' || ev.expires_on::text || '.');
            else
              v_state := 'licensed';
            end if;
          elsif found and act.status = 'withdrawn' then
            v_state := 'not_licensed';
            v_msgs := array_append(v_msgs, v_alabel || ' is not licensed for this entity.');
          elsif r.category = 'activity_coverage' and v_cr_ok and exists (
                  select 1 from jsonb_array_elements(case when jsonb_typeof(v_cr.facts -> 'activities') = 'array' then v_cr.facts -> 'activities' else '[]'::jsonb end) el
                  join public.jurisdiction_activity_codes m on m.jurisdiction_id = e.jurisdiction_id and m.activity_code = el ->> 'code' and m.activity_key = v_a) then
            v_state := 'listed_on_registration';                                       -- listed on the verified, current registration: no separate activity licence is invented
          else
            v_state := 'not_licensed';
            v_msgs := array_append(v_msgs, v_alabel || ' is not licensed for this entity.');
          end if;
          if r.category = 'activity_coverage' then
            v_actstates := v_actstates || jsonb_build_array(jsonb_build_object('key', v_a, 'label', v_alabel, 'state', v_state));
          end if;
        end loop;
      end if;

      v_met := cardinality(v_msgs) = 0 and not v_lapsed;
      if cardinality(v_msgs) > 0 then
        if r.necessity = 'optional' then v_adv := v_adv || v_msgs; else v_blockers := v_blockers || v_msgs; end if;
      end if;
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('key', r.requirement_key, 'label', r.label, 'necessity', r.necessity, 'applies', true, 'met', v_met, 'blocking', (not v_met) and (r.necessity <> 'optional' or v_lapsed)));
    end loop;
  end if;

  return jsonb_build_object(
    'entityName', e.name,
    'jurisdiction', case when e.jurisdiction_id is null then null else j.name end,
    'eligible', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'advisories', to_jsonb(v_adv),
    'requirements', v_reqs,
    'activities', v_actstates,
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
