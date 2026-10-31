-- Extra checks for the 0176 + 0177 SEQUENCE rehearsal (plain SQL + DO blocks; runs inside the rehearsal transaction, which is rolled back).
-- :marker is not used; each block is self-contained and raises on failure.

-- A. 0176 features on their own (only meaningful when 0176 is in place)
create or replace function pg_temp.has_col(c text) returns boolean language sql as $$ select exists (select 1 from information_schema.columns where table_schema='public' and table_name='entity_signatories' and column_name=c) $$;

savepoint designation_checks;
do $$
declare ent uuid; prof uuid; sid uuid; n int; sid2 uuid;
begin
  if not pg_temp.has_col('signing_designation') then raise notice 'EXTRA: 0176 not in place - designation checks skipped'; return; end if;
  select id into ent from public.employing_entities limit 1;
  select id into prof from public.profiles where access_status='active' order by created_at offset 1 limit 1;   -- a person with no other current entry in this rehearsal
  if prof is null then raise exception 'REHEARSAL SETUP: need a second active profile'; end if;
  insert into public.entity_signatories (employing_entity_id, full_name, position, authority, profile_id, effective_from, recorded_by, legal_capacity)
    values (ent, 'Synthetic Designated Person', 'Chief Executive Officer', 'Owner and Sole Proprietor of Ordift Studios', prof, '2019-03-04', prof, 'sole_proprietor') returning id into sid;
  update public.entity_signatories set signing_designation = 'authorised_signatory' where id = sid;                           -- set once from empty: allowed
  begin update public.entity_signatories set signing_designation = null where id = sid; raise exception 'FAIL: designation cleared'; exception when sqlstate '42501' then null; end;
  begin update public.entity_signatories set full_name = 'Synthetic Other Name' where id = sid; raise exception 'FAIL: name edited'; exception when sqlstate '42501' then null; end;
  -- with 0177 in place: the supersession carries the designation over to the corrected entry
  if to_regprocedure('public.supersede_entity_signatory(uuid,text,text,date,uuid,text)') is not null then
    begin
      sid2 := public.supersede_entity_signatory(sid, 'Synthetic Designated Corrected', 'Name corrected to match the registration document.', current_date, prof, 'Owner and Sole Proprietor of Ordift Studios, as recorded in the business registration Form A.');
    exception when others then
      raise notice 'EXTRA: supersession of a designated entry FAILS CLOSED in this state: %', sqlerrm; return;
    end;
    if not exists (select 1 from public.entity_signatories where id = sid2 and signing_designation = 'authorised_signatory' and legal_capacity = 'sole_proprietor' and supersedes_id = sid and profile_id = prof and effective_to is null
                   and authority = 'Owner and Sole Proprietor of Ordift Studios, as recorded in the business registration Form A.') then raise exception 'FAIL: designation/authority not carried over'; end if;
    select count(*) into n from public.entity_signatories where employing_entity_id = ent and profile_id = prof and effective_to is null; if n <> 1 then raise exception 'FAIL: % current', n; end if;
  end if;
  -- 0176 review table is append-only and tied to the entity's own registration
  begin insert into public.entity_compliance_reviews (employing_entity_id, registration_id, review_due_on, recorded_by) values (ent, gen_random_uuid(), '2027-05-07', prof); raise exception 'FAIL: review for a foreign registration accepted'; exception when foreign_key_violation or sqlstate '23514' then null; end;
  raise notice 'EXTRA: 0176 designation + review checks passed';
end $$;
rollback to savepoint designation_checks;
release savepoint designation_checks;

-- B. the supersession path must (still) work in this state
savepoint supersede_check;
do $$
declare ent uuid; prof uuid; a uuid; b uuid; msg text;
begin
  if to_regprocedure('public.supersede_entity_signatory(uuid,text,text,date,uuid,text)') is null then raise notice 'EXTRA: 0177 not in place - supersession check skipped'; return; end if;
  select id into ent from public.employing_entities limit 1;
  select id into prof from public.profiles where access_status='active' order by created_at offset 2 limit 1;
  if prof is null then select id into prof from public.profiles where access_status='active' order by created_at limit 1; end if;
  insert into public.entity_signatories (employing_entity_id, full_name, position, authority, profile_id, effective_from, recorded_by, legal_capacity)
    values (ent, 'Synthetic Seq Sample-Name', 'Chief Executive Officer', 'Example authority wording', prof, '2019-03-04', prof, 'sole_proprietor') returning id into a;
  begin
    b := public.supersede_entity_signatory(a, 'Synthetic Seq Sample Name', 'Name misspelt with a hyphen in the sequence rehearsal.', current_date, prof, null);
    raise notice 'EXTRA: supersession WORKS in this state (new current entry %)', left(b::text, 8);
  exception when others then
    get stacked diagnostics msg = message_text;
    raise notice 'EXTRA: supersession FAILS CLOSED in this state: %', msg;
  end;
end $$;
rollback to savepoint supersede_check;
release savepoint supersede_check;
