-- Ordift Studios Onboarding — controlled requirement override/deferral
-- (Workforce/Employee Self-Service Phase, 2026-09-15). Real example:
-- Mishael Adjei's ORD-AGR-2026-000004 is genuinely "sent" for
-- signature but he cannot presently complete it; Founder/Super Admin
-- needs a controlled way to let his onboarding continue while his
-- employment_agreement_executed requirement remains genuinely
-- outstanding — never by fabricating a signature, never by setting
-- that requirement to "satisfied", and never by reusing "waived" (a
-- waiver would falsely claim the legal requirement no longer applies).
--
-- Extends the existing generic requirement-state architecture
-- (onboarding_requirements, migration 0078) rather than building a
-- parallel one: onboarding_requirements gains a new manual status
-- ("deferred", added at the application layer — this table has no
-- CHECK constraint on status, matching its original design) that
-- unblocks stage/completion gating exactly like "waived"/
-- "not_applicable" already do, but reads honestly as "deferred", never
-- "satisfied". This table is the append-only, richly-structured
-- companion audit record that a bare status column can't hold: WHO
-- authorized it, WHY, WHAT the requirement's real status was at that
-- moment, and — later — WHETHER/HOW it was genuinely resolved. Same
-- shape as agreement_snapshots/signature_evidence being companion
-- append-only tables to agreements/signature_signatories.
--
-- Deliberately generic (requirement_key is any onboarding_requirements
-- catalog key, not hardcoded to the employment agreement) — reusable
-- for any future onboarding requirement that needs the same controlled
-- deferral, per the explicit instruction not to build a parallel,
-- narrowly-scoped mechanism.
--
-- resolved_at/resolution_note are the ONLY fields ever updated after
-- insert (once, when the underlying requirement is later genuinely
-- satisfied) — every other field is written once at authorization and
-- never touched again, the same "append fields over time, never
-- overwrite existing evidence" discipline signature_signatories itself
-- already uses (token_hash, then viewed_at, then consented_at, then
-- signed_at — each written once, none ever erased).

begin;

create table public.onboarding_requirement_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  onboarding_id uuid not null references public.staff_onboarding (id) on delete cascade,
  requirement_key text not null,
  -- The specific agreement this override concerns, where applicable
  -- (null for a future non-agreement requirement override).
  agreement_id uuid references public.agreements (id),
  -- The requirement's real, resolved status at the moment of
  -- authorization (e.g. "pending") — computed server-side from the
  -- same resolver the Onboarding Workspace itself reads, never trusted
  -- from client input, so this can never misrepresent what was
  -- actually being overridden.
  original_status text not null,
  reason text not null,
  authorized_by uuid not null references public.profiles (id),
  authorized_at timestamptz not null default now(),
  -- What this override actually does to onboarding gating — today
  -- always 'progression_authorized' (unblocks stage/completion
  -- gating), stored as text rather than a fixed enum so a future,
  -- genuinely different treatment doesn't require a schema change.
  onboarding_treatment text not null default 'progression_authorized',
  follow_up_required boolean not null default true,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.onboarding_requirement_overrides is
  'Append-only audit record of a controlled administrative deferral of one onboarding_requirements item — never a satisfaction of the underlying requirement itself. original_status/reason/authorized_by/authorized_at/onboarding_treatment/follow_up_required are set once at authorization and never modified afterward; resolved_at/resolution_note are the only fields ever updated later, once, when the underlying requirement is later genuinely satisfied through its real mechanism (e.g. genuine employee signature).';

create index onboarding_requirement_overrides_onboarding_id_idx on public.onboarding_requirement_overrides (onboarding_id);
create index onboarding_requirement_overrides_agreement_id_idx on public.onboarding_requirement_overrides (agreement_id) where agreement_id is not null;

alter table public.onboarding_requirement_overrides enable row level security;

create policy "onboarding_requirement_overrides: read own onboarding or admin" on public.onboarding_requirement_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_onboarding so
      where so.id = onboarding_requirement_overrides.onboarding_id
        and (so.profile_id = (select auth.uid()) or (select private.is_admin_or_super_admin()))
    )
  );

grant select on public.onboarding_requirement_overrides to authenticated;
grant select, insert, update, delete on public.onboarding_requirement_overrides to service_role;

commit;
