-- LOCAL REHEARSAL ONLY (scratch database with 0169-0171 and 0182 applied). Synthetic data. Every assertion raises on failure; PASS lines are NOTICEs.
\set ON_ERROR_STOP on
begin;
set session_replication_role = replica;   -- seed only; every test below runs with the guards ON
insert into auth.users (id,email) values ('00000000-0000-4000-8000-0000000e0001','founder@r.test'),('00000000-0000-4000-8000-0000000e0002','staff@r.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-0000000e0001','Rehearsal Founder','active'),('00000000-0000-4000-8000-0000000e0002','Rehearsal Staff','active') on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000e0001', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
insert into public.enquiries (id, reference_number, email, full_name, service) values ('00000000-0000-4000-8000-0000000e0101','ENQ-R-1','a@b.test','R One','photography') on conflict do nothing;
insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at)
  values ('00000000-0000-4000-8000-0000000e0201','00000000-0000-4000-8000-0000000e0101','CSR-R-000001','photographer','R','r@b.test','1','photography','Rehearsal','2026-01-01','2026-01-01','X',now()) on conflict do nothing;
insert into public.crew_support_slots (id, requirement_id, request_id, slot_number) values ('00000000-0000-4000-8000-0000000e0301','00000000-0000-4000-8000-0000000e0401','00000000-0000-4000-8000-0000000e0201',1) on conflict do nothing;
insert into public.engagements (id, entity_type, entity_id, external_payee_name) values ('00000000-0000-4000-8000-0000000e0501','crew_support_slot','00000000-0000-4000-8000-0000000e0301','Synthetic') on conflict do nothing;
insert into public.project_files (id, engagement_id, file_kind, storage_path, original_filename, mime_type, uploaded_by) values ('00000000-0000-4000-8000-0000000e0601','00000000-0000-4000-8000-0000000e0501','final_approved','r/1','r1.jpg','image/jpeg','00000000-0000-4000-8000-0000000e0001') on conflict do nothing;
insert into public.portfolio_candidates (project_file_id, added_by) values ('00000000-0000-4000-8000-0000000e0601','00000000-0000-4000-8000-0000000e0001');
insert into public.marketing_permission_records (job_type, job_id, source, decision, grantor_name, grantor_capacity, allowed_destinations, method, evidence_summary, verification_status, recorded_by)
  values ('crew_support_request','00000000-0000-4000-8000-0000000e0201','admin_recorded','granted','Synthetic Client','client',array['website','portfolio'],'message','message thread confirming the use','verified','00000000-0000-4000-8000-0000000e0001');
insert into public.portfolio_internal_reviews (project_file_id, candidate_id, decision, destinations, checks, reviewed_by)
  select '00000000-0000-4000-8000-0000000e0601', id, 'approved', array['website','portfolio'], '{"confidentiality":true,"embargo":true,"contractual_restrictions":true,"release_rights":true,"quality":true}'::jsonb, '00000000-0000-4000-8000-0000000e0001' from public.portfolio_candidates where project_file_id='00000000-0000-4000-8000-0000000e0601';
set session_replication_role = origin;

do $$
declare F uuid := '00000000-0000-4000-8000-0000000e0601'; FOUNDER uuid := '00000000-0000-4000-8000-0000000e0001'; STAFF uuid := '00000000-0000-4000-8000-0000000e0002';
  e record; sc uuid; sa uuid; gc uuid; ga uuid; sc2 uuid; gp uuid; sg uuid; ga2 uuid; rr record;
begin
  -- 0. before any declaration the photograph (client permission + internal approval both fine) is NOT eligible
  select * into e from public.portfolio_use_eligibility(F, 'website');
  assert e.rights_ok and not e.eligible and e.internal_reason = 'people_not_declared', 'no declaration must block: ' || e.internal_reason; raise notice 'PASS 0 no declaration blocks (internal_reason=%)', e.internal_reason;

  -- 1. only management may declare / list / grant
  begin insert into public.portfolio_people_declarations (project_file_id, declaration, note, declared_by) values (F,'none_shown','assessed: nobody identifiable',STAFF); raise exception 'FAIL staff declared'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 1 staff cannot declare';

  -- 2. none_shown clears the people stage
  insert into public.portfolio_people_declarations (project_file_id, declaration, note, declared_by) values (F,'none_shown','assessed: nobody identifiable, detail shot of the cake',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert e.eligible, 'none_shown should clear'; raise notice 'PASS 2 none_shown clears';

  -- 3. declaring people shown with nobody listed blocks
  insert into public.portfolio_people_declarations (project_file_id, declaration, note, declared_by) values (F,'people_or_property_shown','a child, a bridesmaid and wall artwork are shown',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_shown_but_none_listed', e.internal_reason; raise notice 'PASS 3 people shown but none listed blocks';

  -- 4. list a child and an adult
  insert into public.portfolio_file_subjects (project_file_id, subject_kind, label, recorded_by) values (F,'child','child in red, left of frame',FOUNDER) returning id into sc;
  insert into public.portfolio_file_subjects (project_file_id, subject_kind, label, recorded_by) values (F,'adult','bridesmaid, centre',FOUNDER) returning id into sa;
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_permission_missing', e.internal_reason; raise notice 'PASS 4 listed subjects without permission block';

  -- 5. a child can be covered only by a parent or guardian
  begin insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, grantor_relationship, authority_reference, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sc,'granted','authorized_representative','Rep Name','organiser','organiser authority letter in job folder','signed_form','form kept in job folder, sheet 2',current_date - 1,array['website'],FOUNDER); raise exception 'FAIL child covered by a representative'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 5 child needs parent or guardian';
  -- an evidence reference alone is not enough (too short) and a release needs an executed agreement
  begin insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, grantor_relationship, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sc,'granted','parent_guardian','Parent Name','mother','signed_form','short',current_date - 1,array['website'],FOUNDER); raise exception 'FAIL short reference'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 5b a bare short reference is refused';

  -- 6. record both grants: recorded-only (unverified) grants clear nothing
  insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, grantor_relationship, evidence_kind, evidence_reference, given_on, allowed_destinations, restrictions, recorded_by) values (sc,'granted','parent_guardian','Parent Name','mother','signed_form','signed form kept in the job folder, sheet 2',current_date - 2,array['website'],'no names',FOUNDER) returning id into gc;
  insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sa,'granted','subject_self','Adult Name','written_message','email 3 Nov kept in the job folder',current_date - 2,array['website','portfolio'],FOUNDER) returning id into ga;
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_permission_missing', 'recorded-only must not clear'; raise notice 'PASS 6 recorded-only grants do not count';

  -- 7. verification needs a separate row with a stated check; the adult alone is not enough while the child is unverified
  begin insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sa,'verified',ga,'email 3 Nov kept in the job folder','ok',FOUNDER); raise exception 'FAIL verification without a stated check'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 7a verification needs a stated check';
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sa,'verified',ga,'email 3 Nov kept in the job folder','Read the message and checked the sender',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible, 'child still unverified'; raise notice 'PASS 7b one verified subject is not enough';
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sc,'verified',gc,'signed form kept in the job folder, sheet 2','Checked the signed form against the guardian',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert e.eligible, 'all verified should clear website'; raise notice 'PASS 7c every subject verified: website eligible';

  -- 8. permission is per destination: the child's grant covers only the website
  select * into e from public.portfolio_use_eligibility(F, 'portfolio'); assert not e.eligible and e.internal_reason = 'people_permission_missing', 'child not cleared for portfolio'; raise notice 'PASS 8 destination-specific';

  -- 9. expiry: a verified grant that has expired covers nothing
  insert into public.portfolio_file_subjects (project_file_id, subject_kind, label, recorded_by) values (F,'property','venue artwork, back wall',FOUNDER) returning id into sc2;
  insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, evidence_kind, evidence_reference, given_on, allowed_destinations, expires_on, recorded_by) values (sc2,'granted','property_owner','Venue Owner','written_message','venue email kept in the job folder',current_date - 3,array['website'],current_date + 1,FOUNDER) returning id into gp;
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sc2,'verified',gp,'venue email kept in the job folder','Checked the venue email and sender',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert e.eligible, 'child, adult and property are all verified today'; 
  select * into e from public.portfolio_use_eligibility(F, 'website', current_date + 5); assert e.internal_reason = 'people_permission_missing', 'expired property grant must not count: ' || e.internal_reason; raise notice 'PASS 9 an expired grant covers nothing';

  -- 10. withdrawal blocks future use at once, and the use-event guard refuses a new use; existing uses would surface in the review view
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, note, recorded_by) values (sc,'withdrawn',gc,'Guardian withdrew permission by message',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_permission_missing', 'withdrawal must block'; raise notice 'PASS 10a withdrawal blocks';
  begin insert into public.portfolio_use_events (project_file_id, destination, action, actor_id) values (F,'website','published',FOUNDER); raise exception 'FAIL use recorded after withdrawal'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 10b a use is refused after withdrawal';
  -- a withdrawn grant cannot be verified afterwards
  begin insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sc,'verified',gc,'signed form kept in the job folder, sheet 2','Verifying again after withdrawal',FOUNDER); raise exception 'FAIL verified after withdrawal'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 10c cannot verify a withdrawn grant';

  -- 11. removing a subject (it was listed by mistake) is a later row, never an edit
  insert into public.portfolio_file_subjects (project_file_id, action, subject_kind, label, supersedes_id, recorded_by) values (F,'removed','adult','x placeholder',(select id from public.portfolio_file_subjects where id = sc),FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert e.eligible, 'child removed, adult verified: eligible'; raise notice 'PASS 11 removal is a new row and changes eligibility';

  -- 12. append-only and privileges
  begin update public.portfolio_subject_permissions set note = 'edited' where id = ga; raise exception 'FAIL update allowed'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin delete from public.portfolio_file_subjects where id = sa; raise exception 'FAIL delete allowed'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 12 append-only';
  assert (select count(*) from information_schema.role_table_grants where table_name in ('portfolio_people_declarations','portfolio_file_subjects','portfolio_subject_permissions') and grantee in ('anon','authenticated','PUBLIC')) = 0, 'client grants';
  assert (select count(*) from information_schema.role_table_grants where table_name in ('portfolio_people_declarations','portfolio_file_subjects','portfolio_subject_permissions') and grantee='service_role' and privilege_type in ('DELETE','TRUNCATE','UPDATE','REFERENCES','TRIGGER','MAINTAIN')) = 0, 'dangerous service grants';
  assert (select count(*) from pg_class where relname in ('portfolio_people_declarations','portfolio_file_subjects','portfolio_subject_permissions') and relrowsecurity) = 3, 'rls'; raise notice 'PASS 13 RLS on, no client grants, no update/delete for the service role';
  -- 13b. the approved policy directions
  begin insert into public.portfolio_people_declarations (project_file_id, declaration, note, declared_by) values (F,'none_shown','tick',FOUNDER); raise exception 'FAIL bare declaration'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 13b a declaration needs a documented assessment';
  insert into public.portfolio_file_subjects (project_file_id, subject_kind, label, recorded_by) values (F,'adult','guest at table four',FOUNDER) returning id into sg;
  begin insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, grantor_relationship, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sg,'granted','authorized_representative','Organiser','event organiser','written_message','organiser email kept in the job folder',current_date - 1,array['website'],FOUNDER); raise exception 'FAIL representative without documented authority'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 13c a representative needs documented authority (an organiser is not assumed to have it)';
  begin insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, evidence_kind, evidence_reference, allowed_destinations, recorded_by) values (sg,'granted','subject_self','Guest','written_message','guest email kept in the job folder',array['website'],FOUNDER); raise exception 'FAIL no date'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 13d a grant needs the date it was given';
  begin insert into public.portfolio_subject_permissions (subject_id, decision, grantor_kind, grantor_name, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sg,'granted','subject_self','Guest','written_message','guest email kept in the job folder',current_date + 3,array['website'],FOUNDER); raise exception 'FAIL future date'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 13e a future date is refused';
  begin insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, note, recorded_by) values (sa,'verified',ga,'a long enough note but no evidence reference',FOUNDER); raise exception 'FAIL verification without evidence reference'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 13f verification must name the evidence examined';
  -- supersession: a replacement grant (unverified) closes the earlier grant at once; the replacement counts only once verified
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, grantor_kind, grantor_name, evidence_kind, evidence_reference, given_on, allowed_destinations, recorded_by) values (sa,'granted',ga,'subject_self','Adult Name','written_message','new email 5 Nov kept in the job folder',current_date,array['website'],FOUNDER) returning id into ga2;
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_permission_missing', 'a replaced grant must stop counting at once'; raise notice 'PASS 13g supersession blocks immediately until the replacement is verified';
  insert into public.portfolio_subject_permissions (subject_id, decision, supersedes_id, evidence_reference, note, recorded_by) values (sa,'verified',ga2,'new email 5 Nov kept in the job folder','Read the new message and checked the sender',FOUNDER);
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and e.internal_reason = 'people_permission_missing', 'guest at table four still has no permission';
  insert into public.portfolio_file_subjects (project_file_id, action, subject_kind, label, supersedes_id, recorded_by) values (F,'removed','adult','x placeholder',sg,FOUNDER);   -- made unidentifiable / excluded: removed from the list
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert e.eligible, 'verified replacement clears once every listed person is covered'; raise notice 'PASS 13h verified replacement counts; an unpermitted person blocks until removed';
  -- 14. the earlier gates are unchanged: with no client permission the photograph stays blocked whatever the people stage says
  insert into public.marketing_permission_records (job_type, job_id, source, decision, grantor_name, grantor_capacity, method, evidence_summary, note, recorded_by, supersedes_id)
    select 'crew_support_request','00000000-0000-4000-8000-0000000e0201','admin_recorded','withdrawn','Synthetic Client','client','message','client withdrew by message thread','client withdrew', FOUNDER, id from public.marketing_permission_records where decision='granted' and job_id='00000000-0000-4000-8000-0000000e0201' limit 1;
  select * into e from public.portfolio_use_eligibility(F, 'website'); assert not e.eligible and not e.rights_ok, 'client permission gate unchanged'; raise notice 'PASS 14 the client-permission gate still blocks on its own';

  -- 15. controlled erasure: refused while in force; allowed once withdrawn; personal fields erased, structure kept, logged; no other column can change
  begin perform public.portfolio_subject_permission_redact(ga2, FOUNDER, 'retention period ended for this record'); raise exception 'FAIL erased while in force'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 15a cannot erase a permission that is still in force';
  begin perform public.portfolio_subject_permission_redact(gc, STAFF, 'retention period ended for this record'); raise exception 'FAIL staff erased'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 15b only management may erase';
  perform public.portfolio_subject_permission_redact(gc, FOUNDER, 'retention period ended for this record');
  select * into rr from public.portfolio_subject_permissions where id = gc;
  assert rr.grantor_name = '[erased]' and rr.evidence_reference like '[erased%' and rr.decision = 'granted' and rr.grantor_kind = 'parent_guardian' and rr.allowed_destinations = array['website'] and rr.given_on is not null, 'structure kept, personal fields erased';
  assert exists (select 1 from public.portfolio_subject_permissions where supersedes_id = gc and note like '[erased%'), 'follow-up notes erased too';
  assert (select count(*) from public.portfolio_subject_redactions where permission_id = gc) = 1, 'redaction logged'; raise notice 'PASS 15c erasure removes personal fields, keeps the decision structure and is logged';
  begin update public.portfolio_subject_permissions set allowed_destinations = array['portfolio'] where id = gc; raise exception 'FAIL edited outside erasure'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 15d rows remain immutable outside the erasure function';
  begin update public.portfolio_subject_redactions set reason = 'edited reason text' where permission_id = gc; raise exception 'FAIL log edited'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 15e the erasure log is append-only';
end $$;
rollback;
