-- PROPOSED migration (number to be assigned; NOT 0175, which is the separate Ghana enhancement) — frozen client-document editions. NOT in supabase/migrations, NOT applied anywhere.
-- Needs separate written Founder authorization, a scratch-database rehearsal and a gated release. Serves the rate card first; the portfolio PDF would reuse the same table later.
--
-- One row = one EDITION of one client document. A draft is editable; an approved edition is a frozen snapshot of exactly what was approved (the content JSON and its SHA-256), never edited
-- afterwards — a change is a NEW edition that supersedes the old one. The PDF is produced in the browser from the approved snapshot only. Nothing here stores a PDF file, a cost or a margin.

begin;

create table public.pdf_document_editions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  kind text not null check (kind in ('rate_card', 'portfolio')),
  edition_label text not null check (length(btrim(edition_label)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  content jsonb not null,                                  -- the whole document: prices, wording, conditions, contact, selected items (no cost/margin field exists in the shape)
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_date date,
  market_slug text,
  currency text check (currency ~ '^[A-Z]{3}$'),
  clearance_statement text,                                -- portfolio: the Founder's statement that each selected photograph is cleared for shareable-PDF use
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  superseded_by uuid references public.pdf_document_editions (id),
  constraint pdf_editions_approved_shape check ((status = 'draft') or (content_sha256 is not null and approved_by is not null and approved_at is not null))
);
comment on table public.pdf_document_editions is
  'Client-facing PDF editions. A draft is editable; an approved edition is frozen (content and hash never change) and only superseded by a newer edition. Approval is by Super Admin only and is audited.';

create or replace function private.pdf_document_editions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'ordift:edition_not_deletable: an approved or superseded edition is kept as history' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;                                                                -- drafts may change freely, including becoming approved (the application checks the content first)
  end if;
  -- approved / superseded: nothing changes except approved -> superseded and the pointer to the newer edition
  if (to_jsonb(new) - 'status' - 'superseded_by' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'superseded_by' - 'updated_at') then
    raise exception 'ordift:edition_frozen: an approved edition is never edited; create a new edition' using errcode = '42501';
  end if;
  if not (old.status = 'approved' and new.status = 'superseded') and new.status is distinct from old.status then
    raise exception 'ordift:edition_status: an approved edition can only become superseded' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.pdf_document_editions_guard() from public, anon, authenticated;
create trigger pdf_document_editions_guard before update or delete on public.pdf_document_editions for each row execute function private.pdf_document_editions_guard();

create unique index pdf_editions_one_approved_per_kind_market on public.pdf_document_editions (kind, coalesce(market_slug, '')) where status = 'approved';
create index pdf_editions_kind_idx on public.pdf_document_editions (kind, created_at desc);

alter table public.pdf_document_editions enable row level security;
create policy "pdf_document_editions: super admin read" on public.pdf_document_editions for select to authenticated using ((select private.is_super_admin()));
revoke all on public.pdf_document_editions from anon, authenticated, service_role;
grant select on public.pdf_document_editions to authenticated;
grant select, insert, update, delete on public.pdf_document_editions to service_role;   -- the guard above limits what update/delete can do

commit;

-- WORKFLOW (application, not this file): Draft (editable, preview only, watermarked "not approved") -> Founder approval = server action that re-validates the content (approval rules in
-- src/lib/pdf/rateCard/validate.ts: approved wording, no placeholder items, conditions, contact, cover image), computes the SHA-256, sets status/approved_by/approved_at, supersedes the previous
-- approved edition of the same kind and market in one transaction, and writes an audit event. Download PDF is offered only for an approved edition (no watermark) and for drafts (watermarked).
-- ROLLBACK (while no edition exists or after exporting them): drop table public.pdf_document_editions; drop function private.pdf_document_editions_guard();
