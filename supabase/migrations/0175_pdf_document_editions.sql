-- 0175 — frozen client-document editions (rate card now; the portfolio PDF reuses the table later). Founder-authorized 2026-10-27 for release with commit a3db2e8 + packaging.
-- Numbering: 0175 was only ever a PROPOSAL (the Ghana administrative enhancement, now renumbered to PROPOSED_0176 and NOT part of this release); this is the next free number after 0174.
-- Additive: creates one table, one guard trigger, one approval function. Touches no existing table, row, price, registration, permit, expense or audit record.
--
-- One row = one EDITION of one document. A draft is editable. APPROVAL happens only through public.approve_pdf_edition(): it freezes the content (the row can never be edited again),
-- stores the content hash, the approving person, the time and the Founder's clearance statement, supersedes the previous approved edition of the same document, and writes the audit event —
-- all in one transaction. A later change is a NEW edition. There is no field for a cost, margin or PDF file here: the content JSON is validated by the application against an allow-list.
-- ROLLBACK: supabase/proposals/ROLLBACK_0175_pdf_editions.sql (rehearsed).

begin;

create table public.pdf_document_editions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  kind text not null check (kind in ('rate_card', 'portfolio')),
  market_slug text not null default '' check (market_slug ~ '^[a-z0-9_]*$'),     -- '' when the document is not market-specific
  edition_label text not null check (length(btrim(edition_label)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 1000000),
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  currency text check (currency ~ '^[A-Z]{3}$'),
  effective_date date,
  clearance_statement text,                                                       -- the Founder's statement at approval (what was checked and cleared)
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  superseded_by uuid references public.pdf_document_editions (id),
  superseded_at timestamptz,
  constraint pdf_editions_approved_shape check (status = 'draft' or (content_sha256 is not null and approved_by is not null and approved_at is not null and length(btrim(coalesce(clearance_statement, ''))) >= 10)),
  constraint pdf_editions_superseded_shape check ((status = 'superseded') = (superseded_by is not null and superseded_at is not null))
);
comment on table public.pdf_document_editions is
  'Client-facing PDF editions. A draft is editable; an approved edition is frozen (content and hash never change) and can only become superseded by a newer approved edition. Approval is Super Admin only, through approve_pdf_edition(), and is audited.';

-- duplicate protection: one edition label per document and market; one APPROVED edition per document and market
create unique index pdf_editions_label_unique on public.pdf_document_editions (kind, market_slug, lower(btrim(edition_label)));
create unique index pdf_editions_one_approved on public.pdf_document_editions (kind, market_slug) where status = 'approved';
create index pdf_editions_kind_idx on public.pdf_document_editions (kind, market_slug, created_at desc);

create or replace function private.pdf_document_editions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_marker text := coalesce(current_setting('ordift.approving_edition', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'ordift:edition_insert_draft_only: an edition is created as a draft and approved through approve_pdf_edition()' using errcode = '42501'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'ordift:edition_not_deletable: an approved or superseded edition is kept as history' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'draft' then
    if new.status = 'draft' then
      if (to_jsonb(new) - 'content' - 'updated_at' - 'edition_label' - 'currency' - 'effective_date') is distinct from (to_jsonb(old) - 'content' - 'updated_at' - 'edition_label' - 'currency' - 'effective_date') then
        raise exception 'ordift:edition_draft_fields: only the content, label, currency and effective date of a draft can change' using errcode = '42501';
      end if;
      new.updated_at := now(); return new;
    end if;
    if new.status = 'approved' then
      if v_marker <> new.id::text then raise exception 'ordift:edition_approve_via_function: an edition can only be approved through approve_pdf_edition()' using errcode = '42501'; end if;
      return new;
    end if;
    raise exception 'ordift:edition_status: a draft can only stay a draft or become approved' using errcode = '42501';
  end if;
  -- approved / superseded rows: frozen. The only change allowed is approved -> superseded, done by approve_pdf_edition() for the NEWER edition.
  if old.status = 'approved' and new.status = 'superseded' and v_marker <> '' and new.superseded_by::text = v_marker then
    if (to_jsonb(new) - 'status' - 'superseded_by' - 'superseded_at' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'superseded_by' - 'superseded_at' - 'updated_at') then
      raise exception 'ordift:edition_frozen: an approved edition is never edited' using errcode = '42501';
    end if;
    new.updated_at := now(); return new;
  end if;
  raise exception 'ordift:edition_frozen: an approved edition is never edited; create a new edition' using errcode = '42501';
end $$;
revoke all on function private.pdf_document_editions_guard() from public, anon, authenticated;
create trigger pdf_document_editions_guard before insert or update or delete on public.pdf_document_editions for each row execute function private.pdf_document_editions_guard();

alter table public.pdf_document_editions enable row level security;
create policy "pdf_document_editions: super admin read" on public.pdf_document_editions for select to authenticated using ((select private.is_super_admin()));
revoke all on public.pdf_document_editions from anon, authenticated, service_role;
grant select on public.pdf_document_editions to authenticated;
grant select, insert, update, delete on public.pdf_document_editions to service_role;   -- the guard limits what insert/update/delete can do

-- Approval: atomic, Super Admin only, stale-content-safe (the caller passes the updated_at it validated and hashed).
create or replace function public.approve_pdf_edition(p_id uuid, p_actor uuid, p_sha256 text, p_clearance text, p_expected_updated_at timestamptz, p_audit jsonb default '{}'::jsonb)
returns table (approved_at timestamptz, superseded_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  e public.pdf_document_editions%rowtype;
  v_prev uuid;
  v_now timestamptz := now();
begin
  if not private.actor_has_role(p_actor, array['super_admin']) then raise exception 'ordift:not_authorised' using errcode = '42501'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'ordift:edition_hash_required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_clearance, ''))) < 10 then raise exception 'ordift:edition_clearance_required' using errcode = '22023'; end if;
  select * into e from public.pdf_document_editions where id = p_id for update;
  if not found then raise exception 'ordift:edition_not_found' using errcode = 'P0002'; end if;
  if e.status <> 'draft' then raise exception 'ordift:edition_not_a_draft' using errcode = '55000'; end if;
  if e.updated_at is distinct from p_expected_updated_at then raise exception 'ordift:edition_changed: the draft changed after it was checked; review it again' using errcode = '40001'; end if;
  perform set_config('ordift.approving_edition', e.id::text, true);
  select id into v_prev from public.pdf_document_editions where kind = e.kind and market_slug = e.market_slug and status = 'approved' for update;
  if v_prev is not null then
    update public.pdf_document_editions set status = 'superseded', superseded_by = e.id, superseded_at = v_now where id = v_prev;
  end if;
  update public.pdf_document_editions set status = 'approved', content_sha256 = p_sha256, approved_by = p_actor, approved_at = v_now, clearance_statement = btrim(p_clearance) where id = e.id;
  perform set_config('ordift.approving_edition', '', true);
  insert into public.activity_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values (gen_random_uuid(), p_actor, 'pdf_edition.approved', 'pdf_document_edition', e.id,
          coalesce(p_audit, '{}'::jsonb) || jsonb_build_object('kind', e.kind, 'market', e.market_slug, 'editionLabel', e.edition_label, 'contentSha256', p_sha256, 'supersededEdition', v_prev), v_now);
  return query select v_now, v_prev;
end $$;
revoke all on function public.approve_pdf_edition(uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.approve_pdf_edition(uuid, uuid, text, text, timestamptz, jsonb) to service_role;

commit;

-- ROLLBACK (only while no approved edition must be kept; export first otherwise) — same as supabase/proposals/ROLLBACK_0175_pdf_editions.sql:
--   drop function public.approve_pdf_edition(uuid, uuid, text, text, timestamptz, jsonb);
--   drop table public.pdf_document_editions;
--   drop function private.pdf_document_editions_guard();
