-- PROPOSED - NOT APPLIED - NOT in supabase/migrations (the CLI never runs this folder). Requires the Founder's separate written
-- approval, a local rehearsal and a Production plan before it is numbered and moved.
--
-- Purpose: an append-only, audited record of WHEN counsel actually approved one specific controlled document, with the evidence and
-- the person who verified it. It does not touch legal_document_versions.approved_at (the registry stamp that only a real approve
-- transition may set), activation, effective dates or any agreement.

begin;

create table public.legal_document_approval_attestations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  version_id uuid not null references public.legal_document_versions (id),
  document_code text not null check (document_code ~ '^OS-LGL-[0-9]{3}$'),
  -- (1) the historical approval date - the real day counsel approved THIS document
  approval_date date not null check (approval_date <= current_date),
  counsel_name text not null check (char_length(btrim(counsel_name)) >= 3),
  counsel_firm text not null check (char_length(btrim(counsel_firm)) >= 3),
  covers_document_codes text[] not null check (document_code = any (covers_document_codes)),
  evidence_kind text not null check (evidence_kind in ('signed_letter', 'counsel_email', 'signed_register', 'other_written_record')),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) >= 15),
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_storage_path text,
  notes text,
  -- (2) when the evidence was verified, and by whom - never typed, never the approval date
  verified_by uuid not null references public.profiles (id),
  verified_at timestamptz not null default now(),
  -- corrections never overwrite: a new row supersedes the earlier one and says why
  supersedes_id uuid references public.legal_document_approval_attestations (id),
  correction_reason text check (supersedes_id is null or char_length(btrim(coalesce(correction_reason, ''))) >= 10)
);

create index legal_document_approval_attestations_version_idx on public.legal_document_approval_attestations (version_id, verified_at desc);

comment on table public.legal_document_approval_attestations is
  'Append-only evidence that counsel approved one specific controlled document on a stated historical date. approval_date (history) is distinct from verified_at (when checked), the template effective date and activated_at (set by the registry), and from any individual agreement''s dates.';

-- the registry creates some versions already marked approved; an attestation cannot post-date that moment
create function private.legal_attestation_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select created_at, status into v from public.legal_document_versions where id = new.version_id;
  if not found then raise exception 'version not found'; end if;
  if v.status in ('approved', 'active') and new.approval_date > (v.created_at at time zone 'utc')::date then
    raise exception 'approval_date % is after the date this version was recorded as approved (%)', new.approval_date, (v.created_at at time zone 'utc')::date;
  end if;
  return new;
end $$;
create trigger legal_attestation_guard before insert on public.legal_document_approval_attestations
  for each row execute function private.legal_attestation_guard();

-- append-only
create function private.legal_attestation_immutable() returns trigger language plpgsql as $$
begin raise exception 'legal_document_approval_attestations is append-only'; end $$;
create trigger legal_attestation_no_update before update or delete on public.legal_document_approval_attestations
  for each row execute function private.legal_attestation_immutable();

alter table public.legal_document_approval_attestations enable row level security;
create policy "legal attestations: admin read" on public.legal_document_approval_attestations
  for select to authenticated using ((select private.is_admin_or_super_admin()));
grant select on public.legal_document_approval_attestations to authenticated;
grant select, insert on public.legal_document_approval_attestations to service_role;

commit;

-- ROLLBACK (only valid while the table holds no genuine attestations):
--   begin;
--   drop table public.legal_document_approval_attestations;
--   drop function private.legal_attestation_guard();
--   drop function private.legal_attestation_immutable();
--   commit;
