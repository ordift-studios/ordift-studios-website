-- Rollback for 0166 (M2a): removes the ledger, the one-live-quotation index, the currency foreign key and the three functions ONLY if no M2a data exists
-- (otherwise it refuses, so no ledger evidence is lost and no live quotation chain is broken). Run by hand, only with the Founder's written approval.
begin;
do $$ begin
  if exists (select 1 from public.enquiry_amount_events) then raise exception 'down_0166 refused: enquiry_amount_events has rows'; end if;
  if exists (select 1 from public.client_quotations where enquiry_id is not null and crew_support_request_id is null) then raise exception 'down_0166 refused: ordinary quotations are linked to enquiries'; end if;
end $$;
drop function public.override_enquiry_amount_due(uuid, uuid, numeric, text, text, text);
drop function public.establish_enquiry_amount_due(uuid, uuid, uuid, numeric, timestamptz, boolean);
drop function public.revise_ordinary_quotation(uuid, uuid);
alter table public.client_quotations drop constraint client_quotations_currency_fk;
drop index public.client_quotations_one_live_per_enquiry;
drop table public.enquiry_amount_events;
drop function private.enquiry_amount_events_immutable();
drop function private.actor_has_role(uuid, text[]);
commit;
