-- Migration 0179 — SIGNATURE VAULT (minimum secure version). NOT applied to Production until the Founder authorizes the apply step (backup gate + exact file hash).
-- Rollback: supabase/proposals/ROLLBACK_0179_signature_vault.sql. Rehearsed locally: src/lib/signatures/vault.localdb.e2e.ts.
--
-- WHAT. A place to keep a person's handwritten-signature IMAGE so that it can never be applied to a document without that person's explicit, document-specific approval.
--   * A PRIVATE storage bucket (no policy for any signed-in role: only server code with the service role can touch an object; there is no public URL and no signed URL is ever issued).
--   * signature_assets: the registered image (owner, SHA-256, storage reference). Always restricted; automatic use is permanently OFF (database CHECKs); only the owner can register;
--     rows are never deleted; the only change ever allowed is revocation.
--   * signature_use_approvals: ONE approval = ONE document (its SHA-256), one purpose, one recipient, one placement, one action, single use, expires within 72 hours, revocable.
--     Registration is not approval. Terms are immutable. approved -> used (once, atomically) or approved -> revoked; a used approval later records the signed document's hash exactly once.
--   * signature_vault_events: append-only audit (registration, approval, refusal, use, revocation, signed result).
--   * public.consume_signature_approval(): the ONLY way to turn an approval into the right to read the image. It locks the approval and refuses (with an audit event) unless it is the
--     owner, still 'approved', unexpired, bound to exactly the presented document hash, and the asset is still active. A refusal returns no row.
--
-- NOT HERE. No stamping/placement code, no connection to the electronic-signature engine (a handwritten image can never substitute an electronic-signature event), no document template reads this table.
-- INDEPENDENCE. Creates new objects only (one bucket row, three tables, guards, one function). Touches no existing table, function, policy, row or grant.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-vault', 'signature-vault', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
-- Deliberately NO storage.objects policy for this bucket: signed-in and anonymous roles are denied by default; only the service role (server code) can read or write.

-- ---------------------------------------------------------------------------------------------------------------- assets
create table public.signature_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  owner_profile_id uuid not null references public.profiles (id),
  label text not null check (char_length(btrim(label)) between 3 and 120),
  storage_path text not null unique,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  restricted boolean not null default true check (restricted),
  automatic_use boolean not null default false check (not automatic_use),
  status text not null default 'active' check (status in ('active', 'revoked')),
  registered_by uuid not null references public.profiles (id),
  registered_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_reason text,
  check (registered_by = owner_profile_id),
  check ((status = 'active' and revoked_at is null and revoked_by is null and revoked_reason is null)
      or (status = 'revoked' and revoked_at is not null and revoked_by is not null and char_length(btrim(coalesce(revoked_reason, ''))) >= 5))
);
create index signature_assets_owner_idx on public.signature_assets (owner_profile_id, registered_at desc);
comment on table public.signature_assets is 'Registered handwritten-signature images. Restricted, automatic use permanently disabled, owner-only, never deleted; the only permitted change is revocation. Registration grants NO permission to apply the signature.';

create or replace function private.signature_assets_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'signature_assets rows are never deleted: revoke the asset instead' using errcode = '42501';
  end if;
  if old.status = 'revoked' then
    raise exception 'a revoked signature asset cannot be changed' using errcode = '42501';
  end if;
  if new.status <> 'revoked'
     or (to_jsonb(new) - 'status' - 'revoked_at' - 'revoked_by' - 'revoked_reason') <> (to_jsonb(old) - 'status' - 'revoked_at' - 'revoked_by' - 'revoked_reason') then
    raise exception 'the only change allowed to a signature asset is revocation' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.signature_assets_guard() from public, anon, authenticated;
create trigger signature_assets_guard before update or delete on public.signature_assets for each row execute function private.signature_assets_guard();

-- ---------------------------------------------------------------------------------------------------------------- approvals
create table public.signature_use_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  asset_id uuid not null references public.signature_assets (id),
  owner_profile_id uuid not null references public.profiles (id),
  document_kind text not null check (document_kind in ('agreement', 'contract', 'letter', 'certificate', 'financial', 'regulatory', 'other')),
  document_reference text not null check (char_length(btrim(document_reference)) between 3 and 200),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  purpose text not null check (char_length(btrim(purpose)) between 10 and 300),
  recipient text not null check (char_length(btrim(recipient)) between 3 and 200),
  placement text not null check (char_length(btrim(placement)) between 3 and 200),
  action text not null check (char_length(btrim(action)) between 3 and 200),
  status text not null default 'approved' check (status in ('approved', 'used', 'revoked')),
  approved_by uuid not null references public.profiles (id),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id),
  unsigned_storage_path text,
  signed_document_sha256 text check (signed_document_sha256 is null or signed_document_sha256 ~ '^[0-9a-f]{64}$'),
  signed_recorded_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_reason text,
  check (approved_by = owner_profile_id),
  check (expires_at > approved_at and expires_at <= approved_at + interval '72 hours'),
  check (status <> 'used' or (used_at is not null and used_by is not null and unsigned_storage_path is not null)),
  check (status <> 'revoked' or (revoked_at is not null and revoked_by is not null and char_length(btrim(coalesce(revoked_reason, ''))) >= 5)),
  check (signed_document_sha256 is null or (status = 'used' and signed_recorded_at is not null)),
  check (status = 'used' or (used_at is null and used_by is null and unsigned_storage_path is null)),
  check (status = 'revoked' or (revoked_at is null and revoked_by is null and revoked_reason is null))
);
create index signature_use_approvals_asset_idx on public.signature_use_approvals (asset_id, approved_at desc);
create index signature_use_approvals_owner_idx on public.signature_use_approvals (owner_profile_id, approved_at desc);
comment on table public.signature_use_approvals is 'One explicit, document-specific, single-use, expiring approval to apply a registered handwritten signature. Terms are immutable; approved -> used (once) | revoked.';

create or replace function private.signature_use_approvals_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  frozen text[] := array['id','business_id','asset_id','owner_profile_id','document_kind','document_reference','document_sha256','purpose','recipient','placement','action','approved_by','approved_at','expires_at'];
  k text;
begin
  if tg_op = 'DELETE' then
    raise exception 'signature_use_approvals rows are never deleted' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select s.owner_profile_id, s.status into a from public.signature_assets s where s.id = new.asset_id;
    if not found or a.status <> 'active' then raise exception 'approval refused: the signature asset is not active' using errcode = '42501'; end if;
    if a.owner_profile_id <> new.owner_profile_id then raise exception 'approval refused: the approval owner is not the asset owner' using errcode = '42501'; end if;
    if new.status <> 'approved' then raise exception 'a new approval must start as approved' using errcode = '42501'; end if;
    new.approved_at := clock_timestamp(); -- never back-dated
    if new.expires_at <= new.approved_at then raise exception 'approval refused: it is already expired' using errcode = '42501'; end if;
    return new;
  end if;
  -- UPDATE: the approval terms are frozen, always
  foreach k in array frozen loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then raise exception 'approval terms are immutable (%)', k using errcode = '42501'; end if;
  end loop;
  if old.status = 'approved' and new.status = 'used' then
    if clock_timestamp() >= old.expires_at then raise exception 'the approval has expired' using errcode = '42501'; end if;
    select s.status into a from public.signature_assets s where s.id = old.asset_id;
    if a.status <> 'active' then raise exception 'the signature asset is revoked' using errcode = '42501'; end if;
    if new.used_by <> old.owner_profile_id then raise exception 'only the owner can use the approval' using errcode = '42501'; end if;
    if new.signed_document_sha256 is not null or new.revoked_at is not null then raise exception 'invalid use transition' using errcode = '42501'; end if;
    return new;
  elsif old.status = 'approved' and new.status = 'revoked' then
    if new.used_at is not null or new.signed_document_sha256 is not null then raise exception 'invalid revoke transition' using errcode = '42501'; end if;
    return new;
  elsif old.status = 'used' and new.status = 'used' and old.signed_document_sha256 is null and new.signed_document_sha256 is not null
        and (to_jsonb(new) - 'signed_document_sha256' - 'signed_recorded_at') = (to_jsonb(old) - 'signed_document_sha256' - 'signed_recorded_at') then
    return new; -- the signed result's hash, recorded exactly once
  end if;
  raise exception 'this approval change is not allowed (% -> %)', old.status, new.status using errcode = '42501';
end $$;
revoke all on function private.signature_use_approvals_guard() from public, anon, authenticated;
create trigger signature_use_approvals_guard before insert or update or delete on public.signature_use_approvals for each row execute function private.signature_use_approvals_guard();

-- ---------------------------------------------------------------------------------------------------------------- audit events (append-only)
create table public.signature_vault_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  asset_id uuid references public.signature_assets (id),
  approval_id uuid references public.signature_use_approvals (id),
  event_type text not null check (event_type in ('asset_registered', 'asset_revoked', 'approval_granted', 'approval_revoked', 'use_granted', 'use_refused', 'use_aborted', 'signed_result_recorded')),
  actor_profile_id uuid references public.profiles (id),
  occurred_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb
);
create index signature_vault_events_asset_idx on public.signature_vault_events (asset_id, occurred_at desc);
create index signature_vault_events_approval_idx on public.signature_vault_events (approval_id, occurred_at desc);

create or replace function private.signature_vault_events_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'signature_vault_events is append-only' using errcode = '42501';
end $$;
revoke all on function private.signature_vault_events_guard() from public, anon, authenticated;
create trigger signature_vault_events_guard before update or delete on public.signature_vault_events for each row execute function private.signature_vault_events_guard();

-- ---------------------------------------------------------------------------------------------------------------- privileges: server code (service role) only; signed-in roles get NOTHING
alter table public.signature_assets enable row level security;
alter table public.signature_use_approvals enable row level security;
alter table public.signature_vault_events enable row level security;
revoke all on public.signature_assets, public.signature_use_approvals, public.signature_vault_events from anon, authenticated, service_role;
grant select, insert, update on public.signature_assets to service_role;
grant select, insert, update on public.signature_use_approvals to service_role;
grant select, insert on public.signature_vault_events to service_role;

-- ---------------------------------------------------------------------------------------------------------------- the single gate
-- Turns an approval into the right to read the image, atomically and at most once. Every refusal is audited and returns NO row.
create or replace function public.consume_signature_approval(p_approval uuid, p_presented_sha256 text, p_actor uuid, p_unsigned_path text)
returns table (asset_id uuid, storage_path text, mime_type text, file_sha256 text, document_reference text, placement text, recipient text, purpose text, action text)
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  s record;
  reason text;
begin
  select * into a from public.signature_use_approvals where id = p_approval for update; -- serializes concurrent attempts
  if not found then
    insert into public.signature_vault_events (event_type, actor_profile_id, detail) values ('use_refused', p_actor, jsonb_build_object('reason', 'approval_not_found', 'approval', p_approval));
    return;
  end if;
  select * into s from public.signature_assets where id = a.asset_id;
  reason := case
    when a.owner_profile_id <> p_actor then 'wrong_owner'
    when a.status = 'used' then 'approval_already_used'
    when a.status = 'revoked' then 'approval_revoked'
    when a.expires_at <= clock_timestamp() then 'approval_expired'
    when s.status <> 'active' then 'asset_revoked'
    when p_presented_sha256 is null or a.document_sha256 <> lower(p_presented_sha256) then 'document_changed'
    when p_unsigned_path is null or btrim(p_unsigned_path) = '' then 'unsigned_copy_reference_missing'
    else null end;
  if reason is not null then
    insert into public.signature_vault_events (asset_id, approval_id, event_type, actor_profile_id, detail)
      values (a.asset_id, a.id, 'use_refused', p_actor, jsonb_build_object('reason', reason, 'presentedSha256Prefix', left(coalesce(lower(p_presented_sha256), ''), 12), 'approvedSha256Prefix', left(a.document_sha256, 12)));
    return;
  end if;
  update public.signature_use_approvals set status = 'used', used_at = clock_timestamp(), used_by = p_actor, unsigned_storage_path = p_unsigned_path where id = a.id;
  insert into public.signature_vault_events (asset_id, approval_id, event_type, actor_profile_id, detail)
    values (a.asset_id, a.id, 'use_granted', p_actor, jsonb_build_object('documentSha256', a.document_sha256, 'documentReference', a.document_reference, 'assetSha256', s.file_sha256, 'placement', a.placement, 'action', a.action));
  return query select s.id, s.storage_path, s.mime_type, s.file_sha256, a.document_reference, a.placement, a.recipient, a.purpose, a.action;
end $$;
revoke all on function public.consume_signature_approval(uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.consume_signature_approval(uuid, text, uuid, text) to service_role;

commit;
