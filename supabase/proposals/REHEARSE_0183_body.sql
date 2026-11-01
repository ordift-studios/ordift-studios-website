-- LOCAL REHEARSAL ONLY (scratch database with 0169-0171, 0182 revision 2 and 0183 applied). Synthetic data. Every assertion raises on failure; PASS lines are NOTICEs. Whole script rolls back.
\set ON_ERROR_STOP on
begin;
set session_replication_role = replica;
insert into auth.users (id,email) values ('00000000-0000-4000-8000-0000000f0001','founder@r.test'),('00000000-0000-4000-8000-0000000f0002','staff@r.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-0000000f0001','Rehearsal Founder','active'),('00000000-0000-4000-8000-0000000f0002','Rehearsal Staff','active') on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000f0001', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
insert into public.enquiries (id, reference_number, email, full_name, service) values ('00000000-0000-4000-8000-0000000f0101','ENQ-R3-1','a@b.test','R Three','photography') on conflict do nothing;
insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at)
  values ('00000000-0000-4000-8000-0000000f0201','00000000-0000-4000-8000-0000000f0101','CSR-R3-000001','photographer','R','r@b.test','1','photography','Rehearsal','2026-01-01','2026-01-01','X',now()) on conflict do nothing;
insert into public.crew_support_slots (id, requirement_id, request_id, slot_number) values ('00000000-0000-4000-8000-0000000f0301','00000000-0000-4000-8000-0000000f0401','00000000-0000-4000-8000-0000000f0201',1) on conflict do nothing;
insert into public.engagements (id, entity_type, entity_id, external_payee_name) values ('00000000-0000-4000-8000-0000000f0501','crew_support_slot','00000000-0000-4000-8000-0000000f0301','Synthetic') on conflict do nothing;
insert into public.project_files (id, engagement_id, file_kind, storage_path, original_filename, mime_type, uploaded_by) values ('00000000-0000-4000-8000-0000000f0601','00000000-0000-4000-8000-0000000f0501','final_approved','r/1','r1.jpg','image/jpeg','00000000-0000-4000-8000-0000000f0001') on conflict do nothing;
-- one in-force verified grant (website), with a stored evidence path
insert into public.marketing_permission_records (id, job_type, job_id, source, decision, grantor_name, grantor_capacity, allowed_destinations, method, evidence_summary, evidence_storage_path, verification_status, note, recorded_by)
  values ('00000000-0000-4000-8000-0000000f0701','crew_support_request','00000000-0000-4000-8000-0000000f0201','admin_recorded','granted','Synthetic Client','client',array['website'],'message','message thread confirming the use','evidence/thread.png','verified','client agreed by message','00000000-0000-4000-8000-0000000f0001');
set session_replication_role = origin;

do $$
declare J uuid := '00000000-0000-4000-8000-0000000f0201'; F uuid := '00000000-0000-4000-8000-0000000f0601'; G uuid := '00000000-0000-4000-8000-0000000f0701';
  FOUNDER uuid := '00000000-0000-4000-8000-0000000f0001'; STAFF uuid := '00000000-0000-4000-8000-0000000f0002'; s1 record; s2 record; r record; nrows int;
begin
  -- 1. an in-force grant is never erased
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, true); raise exception 'FAIL erased in force'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 1 an in-force permission cannot be erased';
  -- 2. withdraw it (admin-recorded withdrawal row), then check erasure rules one at a time
  insert into public.marketing_permission_records (job_type, job_id, source, decision, supersedes_id, grantor_name, grantor_capacity, method, evidence_summary, note, recorded_by)
    values ('crew_support_request',J,'admin_recorded','withdrawn',G,'Synthetic Client','client','message','client withdrew by message thread','client withdrew',FOUNDER);
  select * into s1 from public.marketing_permission_state(F, 'website');
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', false, true); raise exception 'FAIL no confirmation'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 2a confirmation required';
  begin perform public.marketing_permission_record_redact(G, STAFF, 'retention period ended for this record', true, true); raise exception 'FAIL staff'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 2b management only';
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'short', true, true); raise exception 'FAIL short reason'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 2c a reason is required';
  -- 3. a stored evidence file must be removed first
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, false); raise exception 'FAIL stored file left'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 3 a stored evidence file must be removed from storage first';
  -- 4. holds: job-level and file-level (0182) both block
  insert into public.marketing_permission_job_holds (job_type, job_id, action, reason, recorded_by) values ('crew_support_request',J,'placed','complaint under review: keep all evidence',FOUNDER);
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, true); raise exception 'FAIL erased under job hold'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 4a a job hold blocks erasure';
  begin insert into public.marketing_permission_job_holds (job_type, job_id, action, reason, recorded_by) values ('crew_support_request',J,'released','complaint closed, no further action',STAFF); raise exception 'FAIL staff released'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 4b only management may place or release';
  begin update public.marketing_permission_job_holds set reason = 'edited reason of the hold' where job_id = J; raise exception 'FAIL hold edited'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 4c holds are append-only';
  insert into public.marketing_permission_job_holds (job_type, job_id, action, reason, recorded_by) values ('crew_support_request',J,'released','complaint closed, no further action',FOUNDER);
  insert into public.portfolio_file_holds (project_file_id, action, reason, recorded_by) values (F,'placed','audit requires the photograph evidence kept',FOUNDER);
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, true); raise exception 'FAIL erased under file hold'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 4d a photograph-level hold (0182) also blocks';
  insert into public.portfolio_file_holds (project_file_id, action, reason, recorded_by) values (F,'released','audit closed, evidence no longer needed',FOUNDER);
  -- 5. still in use
  set local session_replication_role = replica; insert into public.portfolio_use_events (project_file_id, destination, action, actor_id) values (F,'website','published',FOUNDER); set local session_replication_role = origin;
  begin perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, true); raise exception 'FAIL erased while in use'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 5 refused while a photograph of the job is still in use for a covered use';
  set local session_replication_role = replica; insert into public.portfolio_use_events (project_file_id, destination, action, actor_id) values (F,'website','ended',FOUNDER); set local session_replication_role = origin;
  -- 6. erasure: personal details gone, decision structure and eligibility result unchanged, logged
  perform public.marketing_permission_record_redact(G, FOUNDER, 'retention period ended for this record', true, true);
  select * into r from public.marketing_permission_records where id = G;
  assert r.grantor_name = '[erased]' and r.evidence_summary like '[erased%' and r.note like '[erased%' and r.evidence_storage_path is null, 'personal fields erased';
  assert r.decision = 'granted' and r.allowed_destinations = array['website'] and r.verification_status = 'verified' and r.source = 'admin_recorded' and r.job_id = J, 'decision structure kept';
  assert exists (select 1 from public.marketing_permission_records where supersedes_id = G and grantor_name = '[erased]' and evidence_summary like '[erased%'), 'the withdrawal row was erased with its grant';
  select * into s2 from public.marketing_permission_state(F, 'website');
  assert s2.effective is not distinct from s1.effective and s2.reason is not distinct from s1.reason, 'eligibility result must not change';
  assert (select count(*) from public.marketing_permission_redactions where record_id = G and confirmed_permitted and storage_object_removed) = 1, 'logged'; raise notice 'PASS 6 erasure removes personal details, keeps structure, leaves the permission state unchanged and is logged';
  -- 7. nothing else can be changed, nothing deleted, log immutable, privileges
  begin update public.marketing_permission_records set allowed_destinations = array['portfolio'] where id = G; raise exception 'FAIL edited outside erasure'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin delete from public.marketing_permission_records where id = G; raise exception 'FAIL delete allowed'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 7a rows remain immutable and undeletable outside erasure';
  begin update public.marketing_permission_redactions set reason = 'edited reason for the log' where record_id = G; raise exception 'FAIL log edited'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end; raise notice 'PASS 7b the erasure log is append-only';
  assert (select count(*) from information_schema.role_table_grants where table_name in ('marketing_permission_job_holds','marketing_permission_redactions') and grantee in ('anon','authenticated','PUBLIC')) = 0, 'client grants';
  assert (select count(*) from information_schema.role_table_grants where table_name in ('marketing_permission_job_holds','marketing_permission_redactions') and grantee='service_role' and privilege_type in ('DELETE','TRUNCATE','UPDATE','REFERENCES','TRIGGER','MAINTAIN')) = 0, 'dangerous grants';
  assert (select count(*) from pg_class where relname in ('marketing_permission_job_holds','marketing_permission_redactions') and relrowsecurity) = 2, 'rls'; raise notice 'PASS 7c RLS on, no client access, no update or delete for the service role';
  -- 8. a later grant is still evaluated normally (withdrawal enforcement preserved)
  insert into public.marketing_permission_records (job_type, job_id, source, decision, grantor_name, grantor_capacity, allowed_destinations, method, evidence_summary, verification_status, recorded_by)
    values ('crew_support_request',J,'admin_recorded','granted','Synthetic Client','client',array['website'],'message','a fresh message thread confirming use','verified',FOUNDER);
  select * into s2 from public.marketing_permission_state(F, 'website'); assert s2.effective is true, 'a new verified grant works'; raise notice 'PASS 8 later grants are evaluated normally';
end $$;
rollback;
