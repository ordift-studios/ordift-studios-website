-- ROLLBACK for migration 0179 (signature vault). Only safe while NO asset has been registered; if any signature_assets/approvals/events rows exist, export them first (they are legal evidence).
-- The bucket must be emptied through the Storage API before it can be removed; this script refuses to proceed if rows exist.
begin;
do $$ begin
  if (select count(*) from public.signature_assets) > 0 or (select count(*) from public.signature_use_approvals) > 0 or (select count(*) from public.signature_vault_events) > 0 then
    raise exception 'signature vault tables contain rows: do not roll back without exporting and approving';
  end if;
end $$;
drop function if exists public.consume_signature_approval(uuid, text, uuid, text);
drop table if exists public.signature_vault_events;
drop table if exists public.signature_use_approvals;
drop table if exists public.signature_assets;
drop function if exists private.signature_vault_events_guard();
drop function if exists private.signature_use_approvals_guard();
drop function if exists private.signature_assets_guard();
delete from storage.buckets where id = 'signature-vault' and not exists (select 1 from storage.objects where bucket_id = 'signature-vault');
commit;
