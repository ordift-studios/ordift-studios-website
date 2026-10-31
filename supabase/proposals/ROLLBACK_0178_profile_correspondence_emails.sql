-- ROLLBACK for PROPOSED_0178 (profile correspondence emails). LOCAL REHEARSAL ARTEFACT until 0178 is authorized and applied.
-- Drops the read function, the table, its guard trigger/function and index. DESTRUCTIVE to the history it holds: export the rows first if any exist (the application never reads
-- this table for login, password reset or signing, so removing it cannot affect authentication or any agreement; agreement snapshots keep the Contact value they hold).
-- Touches nothing else (no other table, function or grant), so it is safe in any position relative to 0176 and 0177.
begin;
drop function if exists public.my_correspondence_email();
drop trigger if exists profile_correspondence_emails_guard on public.profile_correspondence_emails;
drop table if exists public.profile_correspondence_emails;
drop function if exists private.profile_correspondence_emails_guard();
commit;
