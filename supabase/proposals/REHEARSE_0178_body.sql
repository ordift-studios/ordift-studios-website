-- REHEARSAL BODY for PROPOSED_0178 (inside ONE transaction against a LOCAL disposable database, then ROLLED BACK). Synthetic data only. Raises on any failure.
do $$
declare
  p1 uuid; p2 uuid; adm uuid; r1 uuid; r2 uuid; n int; msg text;
  before_auth bigint; before_prof bigint;
begin
  select id into p1 from public.profiles where access_status = 'active' order by created_at limit 1;
  select id into p2 from public.profiles where access_status = 'active' order by created_at offset 1 limit 1;
  adm := p1;
  select count(*) into before_prof from public.profiles; select count(*) into before_auth from auth.users;

  -- 1. a valid entry, then a change, then a clear: all kept
  insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'first.preference@example.test', 'person_request', 'Requested by email from this address; confirmed by call-back.', adm) returning id into r1;
  insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'second.preference@example.test', 'staff_entered', 'Changed at the person''s request, confirmed by call-back.', adm) returning id into r2;
  insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, null, 'person_request', 'Person asked for the account email to be used again.', adm);
  select count(*) into n from public.profile_correspondence_emails where profile_id = p1; if n <> 3 then raise exception 'FAIL: history not kept (% rows)', n; end if;
  if (select email from public.profile_correspondence_emails where profile_id = p1 order by created_at desc, id desc limit 1) is not null then raise exception 'FAIL: latest row should be the clear'; end if;

  -- 2. append-only
  begin update public.profile_correspondence_emails set email = 'x.y@example.test' where id = r1; raise exception 'FAIL: update allowed'; exception when sqlstate '42501' then null; end;
  begin delete from public.profile_correspondence_emails where id = r1; raise exception 'FAIL: delete allowed'; exception when sqlstate '42501' then null; end;

  -- 3. constraints
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'Upper.Case@example.test', 'staff_entered', 'A reasonable evidence reference here.', adm); raise exception 'FAIL: upper-case accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'two@example.test,three@example.test', 'staff_entered', 'A reasonable evidence reference here.', adm); raise exception 'FAIL: two addresses accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'no-at-sign.example.test', 'staff_entered', 'A reasonable evidence reference here.', adm); raise exception 'FAIL: malformed accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'ok@example.test', 'somebody', 'A reasonable evidence reference here.', adm); raise exception 'FAIL: bad source accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'ok@example.test', 'staff_entered', 'short', adm); raise exception 'FAIL: short note accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'ok@example.test', 'staff_entered', 'Confirmed with someone at private.person@example.test by email.', adm); raise exception 'FAIL: note with an address accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'ok@example.test', 'staff_entered', 'Called the person on 0200 000 0000 to confirm.', adm); raise exception 'FAIL: note with a phone number accepted'; exception when check_violation then null; end;
  begin insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (gen_random_uuid(), 'ok@example.test', 'staff_entered', 'A reasonable evidence reference here.', adm); raise exception 'FAIL: unknown person accepted'; exception when foreign_key_violation then null; end;

  -- 4. signed-in roles have NO privilege on the table at all; the service role can only select and insert; row-level security stays on with no policy
  if has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'select') or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'insert')
     or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'update') or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'delete')
     or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'truncate') or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'references') then raise exception 'FAIL: authenticated has a privilege on the table'; end if;
  if has_table_privilege('anon', 'public.profile_correspondence_emails', 'select') or has_table_privilege('anon', 'public.profile_correspondence_emails', 'insert') then raise exception 'FAIL: anon has a privilege on the table'; end if;
  if has_column_privilege('authenticated', 'public.profile_correspondence_emails', 'evidence_note', 'select') or has_column_privilege('authenticated', 'public.profile_correspondence_emails', 'recorded_by', 'select') or has_column_privilege('authenticated', 'public.profile_correspondence_emails', 'email', 'select') then raise exception 'FAIL: authenticated can read a column'; end if;
  if has_table_privilege('service_role', 'public.profile_correspondence_emails', 'update') or has_table_privilege('service_role', 'public.profile_correspondence_emails', 'delete') or has_table_privilege('service_role', 'public.profile_correspondence_emails', 'truncate') then raise exception 'FAIL: service_role can modify'; end if;
  if not has_table_privilege('service_role', 'public.profile_correspondence_emails', 'insert') or not has_table_privilege('service_role', 'public.profile_correspondence_emails', 'select') then raise exception 'FAIL: service_role lacks insert/select'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profile_correspondence_emails'::regclass) then raise exception 'FAIL: RLS not enabled'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profile_correspondence_emails') then raise exception 'FAIL: a policy exists (signed-in roles must have none)'; end if;

  -- 5. the one read for signed-in roles: the caller's own current preferred address, through a parameterless security-definer function
  if not has_function_privilege('authenticated', 'public.my_correspondence_email()', 'execute') then raise exception 'FAIL: authenticated cannot execute the own-address function'; end if;
  if has_function_privilege('anon', 'public.my_correspondence_email()', 'execute') or has_function_privilege('service_role', 'public.my_correspondence_email()', 'execute') then raise exception 'FAIL: anon/service_role can execute it'; end if;
  if (select count(*) from pg_proc p, aclexplode(p.proacl) a where p.proname = 'my_correspondence_email' and a.grantee = 0) <> 0 then raise exception 'FAIL: PUBLIC can execute it'; end if;
  if not exists (select 1 from pg_proc p where p.proname = 'my_correspondence_email' and p.prosecdef and p.pronargs = 0 and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')) then raise exception 'FAIL: function is not a parameterless security definer with a fixed search path'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_correspondence_email() into msg;                 -- p2 has no entry
  execute 'reset role';
  if msg is not null then raise exception 'FAIL: another person got a value (%)', msg; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_correspondence_email() into msg;                 -- p1's latest entry is a CLEAR
  execute 'reset role';
  if msg is not null then raise exception 'FAIL: a cleared preference returned a value (%)', msg; end if;
  insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values (p1, 'latest.preference@example.test', 'staff_entered', 'Recorded again at the person''s request.', adm);
  execute 'set local role authenticated';
  select public.my_correspondence_email() into msg;
  execute 'reset role';
  if msg is distinct from 'latest.preference@example.test' then raise exception 'FAIL: own current address not returned (%)', msg; end if;
  begin execute 'set local role authenticated'; perform 1 from public.profile_correspondence_emails; raise exception 'FAIL: authenticated could read the table'; exception when insufficient_privilege then execute 'reset role'; end;
  begin execute 'set local role anon'; perform public.my_correspondence_email(); raise exception 'FAIL: anon could execute the function'; exception when insufficient_privilege then execute 'reset role'; end;

  -- 6. nothing else changed
  if (select count(*) from public.profiles) <> before_prof or (select count(*) from auth.users) <> before_auth then raise exception 'FAIL: profiles or auth users changed'; end if;
  raise notice 'REHEARSAL 0178: ALL CHECKS PASSED';
end $$;
