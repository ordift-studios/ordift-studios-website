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

  -- 4. client roles cannot write, and ordinary signed-in staff cannot read
  if has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'insert') or has_table_privilege('anon', 'public.profile_correspondence_emails', 'select') then raise exception 'FAIL: client role privileges too wide'; end if;
  if has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'update') or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'delete') or has_table_privilege('authenticated', 'public.profile_correspondence_emails', 'truncate') then raise exception 'FAIL: authenticated can modify'; end if;
  if has_table_privilege('service_role', 'public.profile_correspondence_emails', 'update') or has_table_privilege('service_role', 'public.profile_correspondence_emails', 'delete') or has_table_privilege('service_role', 'public.profile_correspondence_emails', 'truncate') then raise exception 'FAIL: service_role can modify'; end if;
  if not has_table_privilege('service_role', 'public.profile_correspondence_emails', 'insert') or not has_table_privilege('service_role', 'public.profile_correspondence_emails', 'select') then raise exception 'FAIL: service_role lacks insert/select'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profile_correspondence_emails'::regclass) then raise exception 'FAIL: RLS not enabled'; end if;

  -- 5. nothing else changed
  if (select count(*) from public.profiles) <> before_prof or (select count(*) from auth.users) <> before_auth then raise exception 'FAIL: profiles or auth users changed'; end if;
  raise notice 'REHEARSAL 0178: ALL CHECKS PASSED';
end $$;
