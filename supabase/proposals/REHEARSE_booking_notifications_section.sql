-- Section for PROPOSAL_booking_notifications.sql. Runs after the shared setup (REHEARSE_booking_body.sql lines 1-52) inside ONE transaction that the runner ROLLS BACK. Synthetic data only.
create or replace function pg_temp.jobs(e text, a text default null) returns bigint language sql as $$ select count(*) from public.booking_notification_jobs where enquiry_id = split_part(e,'|',1)::uuid and (a is null or audience = a) $$;
create or replace function pg_temp.job(e text, a text, n int default 1) returns uuid language sql as $$ select id from public.booking_notification_jobs where enquiry_id = split_part(e,'|',1)::uuid and audience = a order by (select version from public.enquiry_booking_confirmations c where c.id = confirmation_id), id limit 1 offset (n - 1) $$;
create or replace function pg_temp.conf_of(e text) returns uuid language sql as $$ select id from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid order by version limit 1 $$;
create or replace function pg_temp.cl(e text, a text, retry boolean default false) returns int language sql as $$ select count(*)::int from public.claim_booking_notification_job(pg_temp.conf_of(e), a, retry) $$;

-- A. a CONFIRMATION creates exactly the two jobs, pending, in the same transaction
do $$ declare a text := pg_temp.mk(41, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); begin
  perform pg_temp.must(pg_temp.jobs(a) = 0, 'A0: nothing before a confirmation');
  perform pg_temp.conf(pg_temp.pl(a));
  perform pg_temp.must(pg_temp.jobs(a) = 2 and pg_temp.jobs(a,'client') = 1 and pg_temp.jobs(a,'internal') = 1, 'A1: a confirmation creates one client job and one internal job');
  perform pg_temp.must((select bool_and(status = 'pending' and attempt_count = 0 and event = 'confirmed') from public.booking_notification_jobs where enquiry_id = split_part(a,'|',1)::uuid), 'A2: both are pending, untried, event confirmed');
  perform pg_temp.must((select count(*) from public.booking_notification_jobs j join public.enquiry_booking_confirmations c on c.id = j.confirmation_id where c.enquiry_id = j.enquiry_id) = (select count(*) from public.booking_notification_jobs), 'A3: every job points at a confirmation of its own enquiry');
  insert into t values ('n41', a);
end $$;

-- B. a CHANGE and a CANCELLATION create none; a renewed confirmation (after a cancellation) creates two more
do $$ declare a text; begin
  select v into a from t where k = 'n41';
  perform pg_temp.conf(pg_temp.pl(a, jsonb_build_object('supersedes', (select id from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1), 'segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-15T09:00:00Z','endsAt','2026-12-15T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Synthetic studio, Doha')))));
  perform pg_temp.must(pg_temp.jobs(a) = 2, 'B1: a reschedule (changed version) creates no notification job');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'cancelled for the notification rehearsal', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(pg_temp.jobs(a) = 2, 'B2: a cancellation creates no notification job');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(a)) = '', 'B3: it can be confirmed again');
  perform pg_temp.must(pg_temp.jobs(a) = 4 and pg_temp.jobs(a,'client') = 2, 'B4: the renewed confirmation notifies again (two more jobs, a new booking)');
  perform pg_temp.must((select count(distinct confirmation_id) from public.booking_notification_jobs where enquiry_id = split_part(a,'|',1)::uuid) = 2, 'B5: one confirmation per pair of jobs');
end $$;

-- C. money and stage events never create a job
do $$ declare a text := pg_temp.mk(42, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); n0 bigint; begin
  select count(*) into n0 from public.booking_notification_jobs;
  set local session_replication_role = replica;
  update public.enquiries set amount_paid = 1000, payment_status = 'Paid' where id = split_part(a,'|',1)::uuid;
  update public.enquiries set crm_stage = 'negotiation' where id = split_part(a,'|',1)::uuid;
  update public.enquiries set crm_stage = 'quotation_sent' where id = split_part(a,'|',1)::uuid;
  set local session_replication_role = origin;
  perform pg_temp.must((select count(*) from public.booking_notification_jobs) = n0, 'C1: paying in full and moving the stage create no notification job');
  perform pg_temp.must(pg_temp.err(format($q$select public.confirm_ordinary_booking(%L, %L)$q$, pg_temp.pl(a, jsonb_build_object('assignedProfileId', '00000000-0000-4000-8000-0000000000a2', 'segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T09:00:00Z','endsAt','2026-12-14T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','x')))), '00000000-0000-4000-8000-0000000000a1')) ilike '%not_authorised%', 'C2: a refused confirmation raises');
  perform pg_temp.must((select count(*) from public.booking_notification_jobs) = n0, 'C3: a refused confirmation creates no job');
end $$;

-- D. claim: atomic, one winner, retry rules, stale recovery
do $$ declare a text; c uuid; begin
  select v into a from t where k = 'n41'; c := pg_temp.conf_of(a);
  perform pg_temp.must(pg_temp.cl(a, 'client') = 1, 'D1: the first claim wins');
  perform pg_temp.must(pg_temp.cl(a, 'client') = 0 and pg_temp.cl(a, 'client', true) = 0, 'D2: a second claim (even a retry) gets nothing while it is processing');
  perform pg_temp.must((select attempt_count = 1 and status = 'processing' from public.booking_notification_jobs where id = pg_temp.job(a,'client')), 'D3: attempt counted once');
  update public.booking_notification_jobs set last_attempted_at = now() - interval '5 minutes' where id = pg_temp.job(a,'client');
  perform pg_temp.must(pg_temp.cl(a, 'client') = 1, 'D4: a stale processing job (crash) is claimable again');
  perform pg_temp.must((select attempt_count from public.booking_notification_jobs where id = pg_temp.job(a,'client')) = 2, 'D5: attempt 2');
  perform pg_temp.must(pg_temp.cl(a, 'bogus') = 0, 'D6: an unknown audience claims nothing');
end $$;

-- E. finish: only while processing; sent is final; failed / skipped can be retried
do $$ declare a text; j uuid; begin
  select v into a from t where k = 'n41'; j := pg_temp.job(a,'client');
  perform pg_temp.must(pg_temp.err(format($q$select public.finish_booking_notification_job(%L, 'sent', null, 'logged', '[]'::jsonb, 1, 's', 'b')$q$, pg_temp.job(a,'internal'))) ilike '%not_processing%', 'E1: a pending job cannot be finished (it must be claimed first)');
  perform pg_temp.must(pg_temp.err(format($q$select public.finish_booking_notification_job(%L, 'weird', null, null, '[]'::jsonb, 0, 's', 'b')$q$, j)) ilike '%bad_status%', 'E2: only sent / failed / skipped are accepted');
  perform public.finish_booking_notification_job(j, 'failed', 'provider-down', null, '[{"recipient":"client","ok":false}]'::jsonb, 1, 'subj', 'body');
  perform pg_temp.must((select status = 'failed' and last_error = 'provider-down' and sent_at is null and subject = 'subj' from public.booking_notification_jobs where id = j), 'E3: a failure is recorded with its error and the message');
  perform pg_temp.must(pg_temp.cl(a, 'client') = 0 and pg_temp.cl(a, 'client', true) = 1, 'E4: a failed job is claimed only by an explicit retry');
  perform public.finish_booking_notification_job(j, 'sent', null, 'logged', '[{"recipient":"client","ok":true,"mode":"logged"}]'::jsonb, 1, 'subj', 'body');
  perform pg_temp.must((select status = 'sent' and sent_at is not null and attempt_count = 3 and last_error is null from public.booking_notification_jobs where id = j), 'E5: sent, with a time, three attempts in all');
  perform pg_temp.must(pg_temp.cl(a, 'client') = 0 and pg_temp.cl(a, 'client', true) = 0, 'E6: a sent job can never be claimed again, so it can never be sent twice');
  perform pg_temp.must(pg_temp.err(format($q$update public.booking_notification_jobs set status = 'pending' where id = %L$q$, j)) ilike '%already_sent%', 'E7: a sent row cannot be changed');
  perform pg_temp.must(pg_temp.err(format($q$delete from public.booking_notification_jobs where id = %L$q$, j)) ilike '%permanent%', 'E8: no job is ever deleted');
  perform pg_temp.must(pg_temp.err(format($q$update public.booking_notification_jobs set event = 'cancelled' where id = %L$q$, pg_temp.job(a,'internal'))) ilike '%identity_is_fixed%', 'E9: the identity of a job cannot be edited');
  -- skipped (e.g. no e-mail on file) is retryable once the address is fixed
  perform pg_temp.cl(a, 'internal'); perform public.finish_booking_notification_job(pg_temp.job(a,'internal'), 'skipped', null, 'no_recipients', '[]'::jsonb, 0, 's', 'b');
  perform pg_temp.must(pg_temp.cl(a, 'internal', true) = 1, 'E10: a skipped job can be retried');
end $$;

-- F. exactly-once at the data level, privileges
do $$ declare a text; begin
  select v into a from t where k = 'n41';
  perform pg_temp.must(pg_temp.err(format($q$insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience) values (%L, %L, 'client')$q$, pg_temp.conf_of(a), split_part(a,'|',1))) ilike '%duplicate key%', 'F1: a second job for the same confirmation and audience is impossible');
  perform pg_temp.must(not has_table_privilege('authenticated', 'public.booking_notification_jobs', 'select') and not has_table_privilege('anon', 'public.booking_notification_jobs', 'select'), 'F2: clients and the public cannot read it');
  perform pg_temp.must(has_table_privilege('service_role', 'public.booking_notification_jobs', 'select') and not has_table_privilege('service_role', 'public.booking_notification_jobs', 'insert') and not has_table_privilege('service_role', 'public.booking_notification_jobs', 'update') and not has_table_privilege('service_role', 'public.booking_notification_jobs', 'delete'), 'F3: the application can read, and can only write through the two functions');
  perform pg_temp.must(has_function_privilege('service_role', 'public.claim_booking_notification_job(uuid,text,boolean,interval)', 'execute') and not has_function_privilege('authenticated', 'public.claim_booking_notification_job(uuid,text,boolean,interval)', 'execute') and not has_function_privilege('authenticated', 'public.finish_booking_notification_job(uuid,text,text,text,jsonb,int,text,text)', 'execute'), 'F4: the functions are server-only');
  perform pg_temp.must((select relrowsecurity from pg_class where oid = 'public.booking_notification_jobs'::regclass), 'F5: row level security is on');
end $$;
select 'BOOKING NOTIFICATIONS REHEARSAL PASSED' as result;
