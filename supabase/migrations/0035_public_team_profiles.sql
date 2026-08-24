-- Public "Meet the Team" staff-profile integration (2026-08-24).
--
-- Architecture decision: `public.profiles` is already the canonical
-- staff-identity table (member_number, roles, grades, staff_details all
-- key off it — 0001/0009/0017/0019). Rather than a second disconnected
-- `teamMember`-style copy, this adds two small 1:1 extension tables
-- keyed off `profiles.id`, mirroring `staff_details`'s own shape:
--
--   public_profile_details — the master public-facing content an admin
--     fills in once (display name, bio, specialty, handle, quote, fun
--     fact). Edited from Users & Roles / a person's profile.
--   team_showcase_entries — the curation/control surface (visible?,
--     order, which fields are allowed to show, an optional per-entry
--     display-name override). Existing only for people an admin has
--     explicitly added to Meet the Team — being staff/admin never
--     implies public visibility.
--
-- Editing someone's master profile automatically flows through to Meet
-- the Team (both tables are read together at render time); the override
-- field on team_showcase_entries is the one deliberate escape hatch.
--
-- The existing `teamMember` Sanity document type (schema-only, zero
-- content, zero query/component usage — confirmed by investigation) is
-- superseded by this and deliberately left in place, unused, rather
-- than deleted — no data to lose, and deleting a Sanity schema type is
-- a needless destructive action for a type nothing ever populated.
--
-- Public read path: deliberately NOT a new `anon` grant/RLS policy —
-- this project has never granted `anon` access to any table in 34 prior
-- migrations, and introducing the first one is exactly the kind of
-- security-config change that needs its own explicit review, not a
-- side effect of a content feature. Instead, the public About page
-- reads these two tables server-side via the existing service-role
-- admin client (src/lib/supabase/admin.ts) — an already-established,
-- already-audited pattern (see e.g. listUsersWithRoles()) — and only
-- the safe, curated fields are ever passed into rendered HTML. RLS
-- below still covers the `authenticated` (staff/admin) read path, same
-- shape as every other internal-facing table in this schema.

begin;

-- Focal point for `profiles.avatar_url` — same 0-100 coordinate
-- convention as Sanity's own hotspot->focalX/focalY conversion
-- (src/lib/content/sanity/groqFragments.ts), so a circular Meet the
-- Team portrait crop doesn't cut faces incorrectly. Defaults to dead
-- center, matching every other image in this codebase that has never
-- had a focal point set.
alter table public.profiles
  add column avatar_focal_x numeric not null default 50,
  add column avatar_focal_y numeric not null default 50;

comment on column public.profiles.avatar_focal_x is
  'Circular-crop focal point for avatar_url, 0-100 (X). Defaults to center. Set via the Meet the Team profile editor (Admin -> Team).';
comment on column public.profiles.avatar_focal_y is
  'Circular-crop focal point for avatar_url, 0-100 (Y). Defaults to center. Set via the Meet the Team profile editor (Admin -> Team).';

create table public.public_profile_details (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null,
  bio text,
  specialty text,
  social_handle text,
  favorite_quote text,
  fun_fact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.public_profile_details is
  'Master public-facing profile content for a staff/collaborator account (2026-08-24) — display_name is deliberately separate from profiles.full_name (legal/internal name) so a nickname or approved public name can be shown instead. One row per person who has ever had this filled in; existing here does not by itself make anyone publicly visible (see team_showcase_entries).';

create table public.team_showcase_entries (
  id uuid primary key references public.profiles (id) on delete cascade,
  visible boolean not null default false,
  display_order integer not null default 0,
  is_collaborator boolean not null default false,
  display_name_override text,
  show_bio boolean not null default true,
  show_department boolean not null default true,
  show_specialty boolean not null default true,
  show_social_handle boolean not null default true,
  show_quote boolean not null default true,
  show_fun_fact boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_showcase_entries is
  'Meet the Team curation/control surface (2026-08-24) — a row existing here means an admin explicitly added this person; visible=false keeps them added-but-hidden (e.g. staged, or temporarily paused) without losing their order/field-visibility choices. Removing someone from public display is a plain visible=false or row delete here, never touches profiles/staff_details/user_roles or any project/portfolio history. display_name_override, when set, wins over public_profile_details.display_name for this showcase only.';

-- ============================================================
-- Row Level Security — staff/admin read (internal management UI reads
-- via the authenticated client); all writes exclusively via the
-- service-role admin client from Super-Admin-gated server actions
-- (src/app/admin/team/**), same pattern as staff_details/deliverable_
-- publish_claims. The PUBLIC read path (About page) also uses the
-- service-role client server-side — see header comment — so no
-- `anon` grant exists on either table.
-- ============================================================
alter table public.public_profile_details enable row level security;
alter table public.team_showcase_entries enable row level security;

create policy "public_profile_details: staff read" on public.public_profile_details
  for select to authenticated
  using ((select private.is_staff_or_admin()));

create policy "team_showcase_entries: staff read" on public.team_showcase_entries
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.public_profile_details to authenticated;
grant select, insert, update, delete on public.public_profile_details to service_role;

grant select on public.team_showcase_entries to authenticated;
grant select, insert, update, delete on public.team_showcase_entries to service_role;

create trigger public_profile_details_set_updated_at
  before update on public.public_profile_details
  for each row execute function public.set_updated_at();

create trigger team_showcase_entries_set_updated_at
  before update on public.team_showcase_entries
  for each row execute function public.set_updated_at();

-- ============================================================
-- Storage — public bucket for staff/team portraits. Second Supabase
-- Storage bucket in this project (the first, payment-proofs, is
-- private/signed-URL-only — see 0024). This one is deliberately
-- `public = true`: these are curated, admin-approved public-facing
-- marketing photos, not sensitive documents, so a public read is the
-- correct and simplest model (no signed-URL plumbing needed for the
-- About page to render them) — the curation gate is
-- team_showcase_entries.visible, not the bucket's own access model.
-- Uploads stay staff/admin-only via RLS below.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-portraits',
  'staff-portraits',
  true,
  8388608, -- 8MB, same ceiling as payment-proofs/portfolio uploads; client-side compression keeps real uploads well under this
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Object path convention: {profile_id}/{filename} — same technique as
-- payment-proofs, lets RLS check via a path segment without a join.
create policy "staff-portraits: staff upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-portraits'
    and (select private.is_staff_or_admin())
  );

create policy "staff-portraits: staff update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-portraits'
    and (select private.is_staff_or_admin())
  );

create policy "staff-portraits: staff delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-portraits'
    and (select private.is_staff_or_admin())
  );

commit;
