-- Rolls back PROPOSED 0182. Restores portfolio_use_eligibility to its exact 0171 body and drops the three tables (export their rows first if any exist: the tables are append-only evidence).
begin;
create or replace function public.portfolio_use_eligibility(p_file uuid, p_destination text, p_on date default current_date)
returns table (eligible boolean, rights_ok boolean, rights_reason text, internal_ok boolean, internal_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare m record; rv record; ro boolean; rr text; io boolean := false; ir text;
begin
  select s.effective, s.reason into m from public.marketing_permission_state(p_file, p_destination, p_on) s;
  ro := coalesce(m.effective, false); rr := coalesce(m.reason, 'no_permission_on_record');
  select r.decision, r.destinations into rv from public.portfolio_internal_reviews r where r.project_file_id = p_file order by r.seq desc limit 1;
  if not found then ir := 'no_internal_review';
  elsif rv.decision = 'approved' then
    if p_destination = any (rv.destinations) then io := true; ir := 'approved'; else ir := 'destination_not_approved'; end if;
  elsif rv.decision = 'returned' then ir := 'returned_for_further_review';
  else ir := rv.decision; end if;
  return query select (ro and io), ro, rr, io, ir;
end $$;
revoke all on function public.portfolio_use_eligibility(uuid, text, date) from public, anon, authenticated;
grant execute on function public.portfolio_use_eligibility(uuid, text, date) to service_role;
drop function public.portfolio_subject_permission_redact(uuid, uuid, text, boolean);
drop table public.portfolio_file_holds;
drop function private.portfolio_file_hold_guard();
drop table public.portfolio_subject_redactions;
drop table public.portfolio_subject_permissions;
drop table public.portfolio_file_subjects;
drop table public.portfolio_people_declarations;
drop function private.portfolio_subject_permission_guard();
drop function private.portfolio_subject_permission_immutable();
drop function private.portfolio_file_subject_guard();
drop function private.portfolio_people_declaration_guard();
commit;
