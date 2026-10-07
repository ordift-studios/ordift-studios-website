-- Crew Support Phase 1 (2026-10-07): person capabilities, Quote Preparation
-- status, QA/test-record flag.
--
-- INSPECTION SUMMARY (audit, 2026-10-07):
--   - No skills/capability model existed. The nearest data was
--     staff_details.operational_title_id (ONE organizational title per
--     staff member), vendor_profiles.vendor_type and free-text vendor
--     rate-card service_item. Crew assignment therefore selected every
--     auth account holding a staff/admin/super_admin/vendor role.
--   - A person is not a distinct entity: profiles is 1:1 with
--     auth.users. Capability rows hang off profiles, so an account with
--     no capability (e.g. the backup Super Admin account) is never a
--     crew candidate. No authentication row is touched.
--   - operational_titles is reused as the capability VOCABULARY
--     (Photographer, Videographer, Photo/Video Editor, Retoucher,
--     Creative Director, ...). Models use talent_categories elsewhere and
--     are not forced into this table here.
--   - Capability is independent of organizational title and of
--     availability/willingness (availability offers arrive in a later
--     phase). Attendance is deliberately NOT referenced anywhere.
--
-- Everything below is additive. The only existing-table changes are two
-- new defaulted columns, one widened CHECK on crew_support_requests, and
-- flagging the designated QA request CSR-2026-000001 (and its anchor
-- enquiry) as test data by exact reference. CSR-2026-000002 and every
-- other row are untouched.

begin;

create table public.person_capabilities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  operational_title_id uuid not null references public.operational_titles (id),
  proficiency text not null default 'secondary' check (proficiency in ('primary', 'secondary', 'supporting')),
  verification_status text not null default 'self_declared' check (verification_status in ('self_declared', 'verified', 'revoked')),
  source text not null default 'admin' check (source in ('admin', 'self_declared', 'seeded_from_title')),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, operational_title_id)
);

comment on table public.person_capabilities is
  'What a person (profile) can do for Ordift, independent of their organizational title. proficiency: primary | secondary | supporting. verification_status: self_declared (not trusted as verified) | verified | revoked (kept for history, never matched). A capability is NOT availability or willingness — a person with a secondary capability has not agreed to perform it on any job. Attendance never affects eligibility.';

create index person_capabilities_title_idx on public.person_capabilities (operational_title_id) where verification_status <> 'revoked';
create index person_capabilities_profile_idx on public.person_capabilities (profile_id);

alter table public.person_capabilities enable row level security;

create policy "person_capabilities: admin read" on public.person_capabilities
  for select to authenticated using ((select private.is_admin_or_super_admin()));

grant select on public.person_capabilities to authenticated;
grant select, insert, update, delete on public.person_capabilities to service_role;

-- Safe initial seed: ONLY unambiguous craft titles already assigned by
-- Ordift HR (never "Other", engineering, client-services, instructor or
-- management titles). Seeded rows are marked source=seeded_from_title so
-- they are distinguishable from capabilities an admin or the person
-- declared. The Founder profile is deliberately NOT seeded: his
-- capabilities are set in Crew Support -> Capabilities, not hard-coded.
insert into public.person_capabilities (profile_id, operational_title_id, proficiency, verification_status, source, verified_at, notes)
select sd.id, sd.operational_title_id, 'primary', 'verified', 'seeded_from_title', now(),
  'Seeded from the staff operational title (2026-10-07). Confirm or adjust in Crew Support -> Capabilities.'
from public.staff_details sd
join public.operational_titles ot on ot.id = sd.operational_title_id
where ot.slug in (
  'photographer', 'videographer', 'retoucher', 'photo_editor', 'video_editor', 'graphic_designer',
  'creative_director', 'drone_operator', 'lighting_assistant', 'production_assistant', 'makeup_artist',
  'stylist', 'event_coordinator'
)
on conflict (profile_id, operational_title_id) do nothing;

-- Quote Preparation: the real step between Availability Review and
-- Quote Issued. 'quoted' itself is guarded in application code until a
-- quotation can actually be linked to the request.
alter table public.crew_support_requests drop constraint if exists crew_support_requests_status_check;
alter table public.crew_support_requests add constraint crew_support_requests_status_check
  check (status in ('received', 'under_review', 'availability_review', 'quote_preparation', 'quoted', 'agreement_pending', 'payment_pending', 'confirmed', 'declined', 'cancelled'));

-- QA/test-record flag. Set only by migration (no UI toggles it), so a
-- genuine request can never be re-labelled as test data and later QA-only
-- tooling can safely key off it.
alter table public.crew_support_requests add column is_test boolean not null default false;
alter table public.enquiries add column is_test boolean not null default false;

comment on column public.crew_support_requests.is_test is
  'Designated QA/test record. Excluded from reporting; the only records QA-only tooling may ever act on. Never set from the UI.';
comment on column public.enquiries.is_test is
  'Test/QA record (e.g. the anchor enquiry of a QA Crew Support request). Excluded from reports and dashboard counts; still visible in lists, labelled TEST.';

update public.crew_support_requests set is_test = true where reference_number = 'CSR-2026-000001';
update public.enquiries set is_test = true where reference_number = 'CSR-2026-000001';

commit;
