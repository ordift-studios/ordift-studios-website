-- Client-facing delivery follow-up: two request types so a client can ask for a correction to a delivered file, or report
-- a problem with a delivery, through the EXISTING project-requests system (client submits, staff respond, the whole
-- history is kept). Data only: no table or column is added or changed, nothing existing is rewritten, and a request
-- never edits or replaces a released deliverable — it is a separate record that points at it in words.
begin;
insert into public.request_types (business_id, key, label, sort_order) values
  (public.ordift_studios_business_id(), 'delivery_issue', 'Report a problem with a delivery', 30),
  (public.ordift_studios_business_id(), 'correction', 'Request a correction or retouch', 40)
on conflict (business_id, key) do nothing;
commit;
