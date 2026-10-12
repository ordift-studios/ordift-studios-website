-- Rollback for 0158: removes the two request types ONLY if no client request has used them (otherwise the history would be
-- orphaned, so it refuses). Safe to run before any client has used them.
begin;
do $$
begin
  if exists (select 1 from public.project_requests r join public.request_types t on t.id = r.request_type_id where t.key in ('delivery_issue', 'correction')) then
    raise exception 'down_0158 refused: client requests already use these types';
  end if;
end $$;
delete from public.request_types where key in ('delivery_issue', 'correction');
commit;
