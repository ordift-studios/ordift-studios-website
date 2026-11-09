-- ROLLBACK for PROPOSAL_staff_client_lookup_indexed_search.sql. Drops only what that proposal added (the extension is left in place: it may be used elsewhere). No data is touched.
begin;
drop function if exists public.staff_client_lookup(text, text, int);
drop index if exists public.contacts_search_text_trgm_idx, public.contacts_phone_keys_idx, public.contact_emails_active_personal_lower_idx, public.organisations_normalized_name_trgm_idx;
alter table public.contacts drop column if exists search_text;
drop function if exists private.phone_keys(text[]);
drop function if exists private.fold_text(text);
commit;
