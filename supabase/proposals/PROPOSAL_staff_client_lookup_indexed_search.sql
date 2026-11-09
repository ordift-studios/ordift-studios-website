-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): indexed, server-side staff client lookup for Production scale. The number is assigned at release. Rollback: ROLLBACK_staff_client_lookup_indexed_search.sql.
-- Today the application loads up to 5,000 active contacts (with every email and phone) into the web server and filters them in memory. This moves the search INTO the database, behind indexes, and
-- returns ONLY the minimal, already-masked fields the screen shows, so full identifiers never leave the database for this feature. It reads only; it writes nothing; it changes no existing row.
-- Callable by the service role only (the application's server), never by anon or authenticated database roles. Rate limiting and the audit entry stay in the application, exactly as today.
begin;

create extension if not exists pg_trgm;

-- folding: lower case with common accents removed, immutable so it can back a stored column and an index
create or replace function private.fold_text(t text) returns text language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(coalesce(t, ''), 'àáâãäåāçèéêëēìíîïīñòóôõöøōùúûüūýÿÀÁÂÃÄÅĀÇÈÉÊËĒÌÍÎÏĪÑÒÓÔÕÖØŌÙÚÛÜŪÝ', 'aaaaaaaceeeeeiiiiinoooooooouuuuuyyAAAAAAACEEEEEIIIIINOOOOOOOUUUUUY')) $$;
-- the last 9 and last 7 digits of every phone number (the directory's own matching rule), as a searchable array
create or replace function private.phone_keys(phones text[]) returns text[] language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select 'k9:' || right(d, 9) as k from (select regexp_replace(p, '\D', '', 'g') d from unnest(coalesce(phones, '{}')) p) x where length(d) >= 7
    union all select 'k7:' || right(d, 7) from (select regexp_replace(p, '\D', '', 'g') d from unnest(coalesce(phones, '{}')) p) y where length(d) >= 7) z $$;

alter table public.contacts add column if not exists search_text text generated always as (private.fold_text(full_name || ' ' || coalesce(preferred_name, ''))) stored;
create index if not exists contacts_search_text_trgm_idx on public.contacts using gin (search_text gin_trgm_ops) where status = 'active';
create index if not exists contacts_phone_keys_idx on public.contacts using gin (private.phone_keys(phones)) where status = 'active';
create index if not exists contact_emails_active_personal_lower_idx on public.contact_emails (lower(email)) where removed_at is null and not is_shared;
create index if not exists organisations_normalized_name_trgm_idx on public.organisations using gin (normalized_name gin_trgm_ops);
-- (enquiries already has enquiries_contact_idx on contact_id, used for the earlier-enquiry count)

create or replace function public.staff_client_lookup(p_kind text, p_value text, p_limit int default 6) returns table (contact_id uuid, display_name text, organisation_name text, matched_by text, masked_email text, masked_phone text, earlier_enquiries int)
language plpgsql stable security definer set search_path = '' as $$
declare v text := btrim(coalesce(p_value, '')); lim int := least(greatest(coalesce(p_limit, 6), 1), 6); toks text[]; digits text;
begin
  if p_kind not in ('email', 'phone', 'name') then raise exception 'ordift:lookup_bad_kind'; end if;
  if p_kind = 'email' then
    if v !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' or length(v) > 254 or v <> lower(v) then raise exception 'ordift:lookup_bad_email'; end if;
    return query select c.id, coalesce(nullif(btrim(c.preferred_name), ''), c.full_name), o.name, 'email'::text,
        (select left(e.email, 1) || '•••' || substr(e.email, position('@' in e.email)) from public.contact_emails e where e.contact_id = c.id and e.removed_at is null and not e.is_shared order by e.is_primary desc, e.created_at limit 1),
        (select '•••• ' || right(regexp_replace(p, '\D', '', 'g'), 3) from unnest(c.phones) p where length(regexp_replace(p, '\D', '', 'g')) >= 7 limit 1),
        (select count(*)::int from public.enquiries q where q.contact_id = c.id)
      from public.contacts c left join public.organisations o on o.id = c.organisation_id
      where c.status = 'active' and exists (select 1 from public.contact_emails m where m.contact_id = c.id and lower(m.email) = v and m.removed_at is null and not m.is_shared)
      order by 2 limit lim;
  elsif p_kind = 'phone' then
    digits := regexp_replace(v, '\D', '', 'g');
    if length(digits) < 7 or length(digits) > 15 then raise exception 'ordift:lookup_bad_phone'; end if;
    return query select c.id, coalesce(nullif(btrim(c.preferred_name), ''), c.full_name), o.name, 'phone'::text,
        (select left(e.email, 1) || '•••' || substr(e.email, position('@' in e.email)) from public.contact_emails e where e.contact_id = c.id and e.removed_at is null and not e.is_shared order by e.is_primary desc, e.created_at limit 1),
        (select '•••• ' || right(regexp_replace(p, '\D', '', 'g'), 3) from unnest(c.phones) p where length(regexp_replace(p, '\D', '', 'g')) >= 7 limit 1),
        (select count(*)::int from public.enquiries q where q.contact_id = c.id)
      from public.contacts c left join public.organisations o on o.id = c.organisation_id
      where c.status = 'active' and private.phone_keys(c.phones) && case when length(digits) >= 9 then array['k9:' || right(digits, 9)] else array['k7:' || right(digits, 7)] end
        and (length(digits) >= 9 or exists (select 1 from unnest(c.phones) p where regexp_replace(p, '\D', '', 'g') like '%' || digits))
      order by 2 limit lim;
  else
    toks := string_to_array(regexp_replace(private.fold_text(v), '[^a-z0-9 ''-]', ' ', 'g'), ' ');
    toks := array(select t from unnest(toks) t where t <> '');
    if length(array_to_string(toks, '')) < 3 or length(v) > 60 or coalesce(array_length(toks, 1), 0) > 6 then raise exception 'ordift:lookup_bad_name'; end if;
    return query select c.id, coalesce(nullif(btrim(c.preferred_name), ''), c.full_name), o.name, 'name'::text,
        (select left(e.email, 1) || '•••' || substr(e.email, position('@' in e.email)) from public.contact_emails e where e.contact_id = c.id and e.removed_at is null and not e.is_shared order by e.is_primary desc, e.created_at limit 1),
        (select '•••• ' || right(regexp_replace(p, '\D', '', 'g'), 3) from unnest(c.phones) p where length(regexp_replace(p, '\D', '', 'g')) >= 7 limit 1),
        (select count(*)::int from public.enquiries q where q.contact_id = c.id)
      from public.contacts c left join public.organisations o on o.id = c.organisation_id
      where c.status = 'active' and not exists (select 1 from unnest(toks) t where c.search_text not like '%' || t || '%' and coalesce(o.normalized_name, '') not like '%' || t || '%')
      order by 2 limit lim;
  end if;
end $$;
revoke all on function public.staff_client_lookup(text, text, int) from public, anon, authenticated;
grant execute on function public.staff_client_lookup(text, text, int) to service_role;

commit;
