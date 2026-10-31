-- REHEARSAL BODY for PROPOSED_0177 (runs inside one transaction against a LOCAL disposable database, then ROLLS BACK). Synthetic data only.
-- Every check raises on failure; the final notice proves they all ran.
create temp table rh (k text primary key, v text);
do $$
declare
  ent uuid; prof uuid; actor uuid; doc uuid; old_id uuid; new_id uuid; before_old jsonb; after_old jsonb; n int; msg text;
  cnt_agr int; cnt_snap int; cnt_act int;
begin
  select id into ent from public.employing_entities limit 1;
  select id into prof from public.profiles where access_status = 'active' order by created_at limit 1;
  actor := prof;
  if ent is null or prof is null then raise exception 'REHEARSAL SETUP: need one entity and one active profile'; end if;
  -- a synthetic document row is not required: source_document_id is nullable in the table
  insert into public.entity_signatories (employing_entity_id, full_name, position, authority, profile_id, effective_from, recorded_by, legal_capacity)
    values (ent, 'Synthetic Sample-Name', 'Chief Executive Officer', 'Example authority wording', prof, '2019-03-04', actor, 'sole_proprietor') returning id into old_id;
  select count(*) into cnt_agr from public.agreements; select count(*) into cnt_snap from public.agreement_snapshots; select count(*) into cnt_act from public.activity_log;
  select to_jsonb(s) into before_old from public.entity_signatories s where id = old_id;
  insert into rh values ('old', old_id::text);

  -- 1. guard still refuses ordinary changes and any end-date outside the function
  begin update public.entity_signatories set full_name = 'Synthetic Sample Name' where id = old_id; raise exception 'FAIL: name edit allowed'; exception when sqlstate '42501' then null; end;
  begin update public.entity_signatories set effective_to = '2026-10-31' where id = old_id; raise exception 'FAIL: direct end-date allowed'; exception when sqlstate '42501' then null; end;
  begin delete from public.entity_signatories where id = old_id; raise exception 'FAIL: delete allowed'; exception when sqlstate '42501' then null; end;
  begin update public.entity_signatories set supersedes_id = old_id where id = old_id; raise exception 'FAIL: supersedes_id edit allowed'; exception when sqlstate '42501' then null; end;

  -- 2. validation refusals (nothing changes)
  begin perform public.supersede_entity_signatory(old_id, 'Synthetic Sample-Name', 'correcting the recorded spelling', current_date, actor); raise exception 'FAIL: same name accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(old_id, 'Synthetic Sample Name', 'short', current_date, actor); raise exception 'FAIL: short reason accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(old_id, 'Synthetic Sample Name', 'correcting the recorded spelling', current_date + 1, actor); raise exception 'FAIL: future date accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(old_id, 'Synthetic Sample Name', 'correcting the recorded spelling', '2018-01-01', actor); raise exception 'FAIL: date before entry began accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(old_id, 'Synthetic Sample Name', 'correcting the recorded spelling', current_date, null); raise exception 'FAIL: missing actor accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(gen_random_uuid(), 'Synthetic Sample Name', 'correcting the recorded spelling', current_date, actor); raise exception 'FAIL: unknown entry accepted'; exception when sqlstate 'P0002' then null; end;
  select count(*) into n from public.entity_signatories where employing_entity_id = ent and effective_to is null and profile_id = prof;
  if n <> 1 then raise exception 'FAIL: refusals changed state (% current)', n; end if;

  -- 3. the correction
  new_id := public.supersede_entity_signatory(old_id, '  Synthetic Sample Name ', 'Name misspelt with a hyphen; the certificate reads without one.', current_date, actor);
  insert into rh values ('new', new_id::text);
  select to_jsonb(s) into after_old from public.entity_signatories s where id = old_id;
  -- old row: only effective_to changed
  if (before_old - 'effective_to') is distinct from (after_old - 'effective_to') then raise exception 'FAIL: old row changed beyond effective_to'; end if;
  if (after_old ->> 'effective_to')::date <> current_date then raise exception 'FAIL: old row not end-dated'; end if;
  -- new row: corrected name, everything else carried
  if not exists (select 1 from public.entity_signatories where id = new_id and full_name = 'Synthetic Sample Name' and position = 'Chief Executive Officer' and authority = 'Example authority wording'
                 and legal_capacity = 'sole_proprietor' and profile_id = prof and employing_entity_id = ent and effective_to is null and effective_from = current_date and supersedes_id = old_id
                 and supersession_reason like 'Name misspelt%' and recorded_by = actor) then raise exception 'FAIL: new row wrong'; end if;
  -- exactly one current entry for the person and none left with the old name
  select count(*) into n from public.entity_signatories where employing_entity_id = ent and effective_to is null and profile_id = prof;
  if n <> 1 then raise exception 'FAIL: % current entries for the person', n; end if;
  if exists (select 1 from public.entity_signatories where employing_entity_id = ent and effective_to is null and full_name = 'Synthetic Sample-Name') then raise exception 'FAIL: hyphenated entry still current'; end if;
  -- history kept: both rows exist
  select count(*) into n from public.entity_signatories where employing_entity_id = ent and full_name like 'Synthetic Sample%';
  if n <> 2 then raise exception 'FAIL: history not kept (% rows)', n; end if;
  -- no collateral change; exactly one audit row added
  if (select count(*) from public.agreements) <> cnt_agr or (select count(*) from public.agreement_snapshots) <> cnt_snap then raise exception 'FAIL: agreements or snapshots changed'; end if;
  if (select count(*) from public.activity_log) <> cnt_act + 1 then raise exception 'FAIL: audit row count'; end if;
  if not exists (select 1 from public.activity_log where action = 'entity_signatory.superseded' and metadata ->> 'newSignatoryId' = new_id::text and metadata ->> 'previousName' = 'Synthetic Sample-Name') then raise exception 'FAIL: audit event missing'; end if;
  -- the transaction-local flag does not stay on
  if coalesce(current_setting('ordift.signatory_supersede', true), '') = 'on' then raise exception 'FAIL: flag left on'; end if;

  -- 4. after the correction
  begin perform public.supersede_entity_signatory(old_id, 'Another Name Here', 'attempt to supersede a retired entry', current_date, actor); raise exception 'FAIL: retired entry superseded'; exception when sqlstate '23514' then null; end;
  begin update public.entity_signatories set effective_to = '2026-11-01' where id = old_id; raise exception 'FAIL: end date changed'; exception when sqlstate '42501' then null; end;
  begin update public.entity_signatories set effective_to = current_date where id = new_id; raise exception 'FAIL: direct end-date of new row allowed'; exception when sqlstate '42501' then null; end;
  -- a second successor of the same entry cannot exist (even by direct insert)
  begin insert into public.entity_signatories (employing_entity_id, full_name, position, authority, recorded_by, supersedes_id, supersession_reason) values (ent, 'Synthetic Third Name', 'Chief Executive Officer', 'x authority', actor, old_id, 'a second successor of the same entry');
        raise exception 'FAIL: second successor accepted'; exception when unique_violation then null; end;
  -- a second CURRENT entry for the same person cannot be inserted
  begin insert into public.entity_signatories (employing_entity_id, full_name, position, authority, recorded_by, profile_id) values (ent, 'Synthetic Duplicate Person', 'Chief Executive Officer', 'x authority', actor, prof);
        raise exception 'FAIL: duplicate current person accepted'; exception when unique_violation then null; end;
  -- the function is not callable by ordinary roles
  if has_function_privilege('authenticated', 'public.supersede_entity_signatory(uuid,text,text,date,uuid,text)', 'execute') or has_function_privilege('anon', 'public.supersede_entity_signatory(uuid,text,text,date,uuid,text)', 'execute') then raise exception 'FAIL: function executable by client roles'; end if;
  if not has_function_privilege('service_role', 'public.supersede_entity_signatory(uuid,text,text,date,uuid,text)', 'execute') then raise exception 'FAIL: service_role cannot execute'; end if;

  -- 5. an unlinked entry (no person) can be superseded too, and still leaves one current entry
  insert into public.entity_signatories (employing_entity_id, full_name, position, authority, recorded_by) values (ent, 'Synthetic Unlinked Entry', 'Director', 'Director authority', actor) returning id into old_id;
  new_id := public.supersede_entity_signatory(old_id, 'Synthetic Unlinked Corrected', 'Name misspelt; certificate shows the corrected form.', current_date, actor);
  if not exists (select 1 from public.entity_signatories where id = new_id and profile_id is null and effective_to is null and supersedes_id = old_id) then raise exception 'FAIL: unlinked correction'; end if;

  -- 6. authority wording can be corrected on its own (name kept) or together with the name; unchanged input is refused
  insert into public.entity_signatories (employing_entity_id, full_name, position, authority, recorded_by) values (ent, 'Synthetic Authority Entry', 'Director', 'Wording as first recorded', actor) returning id into old_id;
  begin perform public.supersede_entity_signatory(old_id, null, 'attempt with nothing changed at all', current_date, actor, null); raise exception 'FAIL: unchanged accepted'; exception when sqlstate '23514' then null; end;
  begin perform public.supersede_entity_signatory(old_id, '', 'attempt with an authority that is too short', current_date, actor, 'ab'); raise exception 'FAIL: short authority accepted'; exception when sqlstate '23514' then null; end;
  new_id := public.supersede_entity_signatory(old_id, null, 'Authority wording corrected to match the registration document.', current_date, actor, '  Owner and sole proprietor, as shown on Form A  ');
  if not exists (select 1 from public.entity_signatories where id = new_id and full_name = 'Synthetic Authority Entry' and authority = 'Owner and sole proprietor, as shown on Form A' and position = 'Director' and supersedes_id = old_id and effective_to is null) then raise exception 'FAIL: authority-only correction'; end if;
  if (select authority from public.entity_signatories where id = old_id) <> 'Wording as first recorded' then raise exception 'FAIL: old authority changed'; end if;
  if not exists (select 1 from public.activity_log where action = 'entity_signatory.superseded' and metadata ->> 'newSignatoryId' = new_id::text and (metadata ->> 'authorityChanged')::boolean) then raise exception 'FAIL: authority audit flag'; end if;
  raise notice 'REHEARSAL 0177: ALL CHECKS PASSED';
end $$;
