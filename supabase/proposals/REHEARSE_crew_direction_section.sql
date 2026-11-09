-- Section 12 (two-way overlap): a Crew Support request cannot be confirmed, rescheduled while confirmed, or have a person assigned while confirmed, if that person has an overlapping CONFIRMED ordinary booking; and a booking
-- cannot be confirmed over a confirmed Crew Support assignment. Optional call/finish times make same-day work possible; date-only and unreadable schedules are handled conservatively. Run after the shared setup of
-- REHEARSE_booking_body.sql with PROPOSAL_crew_support_booking_overlap_guard.sql applied (rehearse_booking_on_lab.sh crew).
create or replace function pg_temp.mkcrew(n int, sd date, ed date, call text, fin text, tz text, person uuid, st text default 'quoted') returns uuid language plpgsql as $$
declare r uuid := gen_random_uuid(); req uuid := gen_random_uuid(); e uuid := split_part(pg_temp.mk(200 + n, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0), '|', 1)::uuid;     -- a real enquiry, so the foreign key holds
begin
  set local session_replication_role = replica;
  insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at, status, call_time, finish_time, event_timezone)
    values (r, e, 'CSR-X-' || n, 'photographer', 'X', 'x@e2e.test', '1', 'photography', 'P', sd, ed, 'Doha', now(), st, call, fin, tz);
  insert into public.crew_support_requirements (id, request_id, role_label, quantity) values (req, r, 'Photographer', 1);
  insert into public.crew_support_slots (requirement_id, request_id, slot_number, assignee_profile_id, status) values (req, r, 1, person, 'assigned');
  set local session_replication_role = origin;
  return r;
end $$;
create or replace function pg_temp.confirm_crew(r uuid) returns text language plpgsql as $$ begin update public.crew_support_requests set status = 'confirmed' where id = r; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.sql_err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;

do $$ declare ent text := '44444444-4444-4444-8444-444444444401'; p2 text := '00000000-0000-4000-8000-0000000000a2'; p3 text := '00000000-0000-4000-8000-0000000000a3';
  ea text := pg_temp.mk(81, ent, 'QAR', 100, 'photography', 100, 0); eb text := pg_temp.mk(82, ent, 'QAR', 100, 'photography', 100, 0); ec text := pg_temp.mk(83, ent, 'QAR', 100, 'photography', 100, 0); ed text := pg_temp.mk(84, ent, 'QAR', 100, 'photography', 100, 0);
  d date := date '2027-04-12'; qa text := 'Asia/Qatar'; r uuid;
  seg jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-04-12T06:00:00Z','endsAt','2027-04-12T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));       -- 09:00-12:00 Doha
  
begin
  perform pg_temp.conf(pg_temp.pl(ea, jsonb_build_object('assignedProfileId', p2, 'segments', seg)));            -- person 2 has a CONFIRMED booking 09:00-12:00 Doha on 12 April
  -- ---- Crew Support confirmation sees the booking (the missing reverse check)
  r := pg_temp.mkcrew(1, d, d, '13:00', '16:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) = '', '12.1 same day, later hours (13:00-16:00): no overlap, confirmed');
  r := pg_temp.mkcrew(2, d, d, '10:00', '11:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.2 same day, inside the booking: refused');
  perform pg_temp.must((select status from public.crew_support_requests where id = r) = 'quoted', '12.3 the refused confirmation changed nothing');
  r := pg_temp.mkcrew(3, d, d, '11:00', '14:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.4 partial overlap: refused');
  r := pg_temp.mkcrew(4, d, d, '12:00', '14:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) = '', '12.5 adjacent (starts exactly when the booking ends): confirmed');
  r := pg_temp.mkcrew(5, d, d, null, null, null, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.6 date-only assignment on the same date: conservative, refused (no times are inferred)');
  r := pg_temp.mkcrew(6, d, d, 'morning', 'noon', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.7 unreadable times: conservative, refused');
  r := pg_temp.mkcrew(7, d, d, '18:00', '02:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.8 overnight window: conservative, refused');
  r := pg_temp.mkcrew(8, d - 1, d + 1, '18:00', '20:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) = '', '12.9 multi-day, evening window on each day: no overlap with the morning booking, confirmed');
  r := pg_temp.mkcrew(9, d - 1, d + 1, '08:00', '10:00', qa, p2::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) like '%crew_confirm_overlaps_booking%', '12.10 multi-day whose window on the 12th overlaps the booking: refused');
  r := pg_temp.mkcrew(10, d, d, '10:00', '11:00', qa, p3::uuid); perform pg_temp.must(pg_temp.confirm_crew(r) = '', '12.11 another person is unaffected');
  r := pg_temp.mkcrew(11, d, d, '10:00', '11:00', qa, p2::uuid); perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_requests set status = %L where id = %L', 'under_review', r)) = '', '12.12 only the move to CONFIRMED is guarded: other status changes are unaffected');
  -- ---- changes to existing schedules and assignments while confirmed
  r := pg_temp.mkcrew(12, d, d, '13:00', '16:00', qa, p2::uuid, 'confirmed');
  perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_requests set call_time = %L, finish_time = %L where id = %L', '10:00', '11:00', r)) like '%crew_confirm_overlaps_booking%', '12.13 rescheduling a confirmed assignment into the booking is refused');
  perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_requests set call_time = null, finish_time = null where id = %L', r)) like '%crew_confirm_overlaps_booking%', '12.14 clearing the times (date-only, conservative) on the same date is refused');
  perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_requests set call_time = %L, finish_time = %L where id = %L', '14:00', '17:00', r)) = '', '12.15 rescheduling to other hours that do not overlap is allowed');
  perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_requests set start_date = %L, end_date = %L where id = %L', d + 7, d + 7, r)) = '', '12.16 rescheduling to another date is allowed');
  r := pg_temp.mkcrew(13, d, d, '10:00', '11:00', qa, p3::uuid, 'confirmed');
  perform pg_temp.must(pg_temp.sql_err(format('update public.crew_support_slots set assignee_profile_id = %L where request_id = %L', p2, r)) like '%crew_confirm_overlaps_booking%', '12.17 assigning a person with an overlapping booking to an already-confirmed request is refused');
  -- ---- booking confirmation sees precise Crew Support schedules (the existing direction, now with times)
  r := pg_temp.mkcrew(14, d + 20, d + 20, '13:00', '16:00', qa, p3::uuid, 'confirmed');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(eb, jsonb_build_object('assignedProfileId', p3, 'segments', jsonb_build_array(jsonb_build_object('startsAt','2027-05-02T06:00:00Z','endsAt','2027-05-02T09:00:00Z','timezone',qa,'kind','on_site','location','Doha'))))) = '', '12.18 a booking in the morning of a day with a confirmed 13:00-16:00 assignment is allowed');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(ec, jsonb_build_object('assignedProfileId', p3, 'segments', jsonb_build_array(jsonb_build_object('startsAt','2027-05-02T11:00:00Z','endsAt','2027-05-02T12:00:00Z','timezone',qa,'kind','on_site','location','Doha'))))) ilike '%booking_overlap_not_overridable%', '12.19 a booking that overlaps the assignment is refused (14:00-15:00 Doha)');
  r := pg_temp.mkcrew(15, d + 30, d + 30, null, null, null, p3::uuid, 'confirmed');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(ed, jsonb_build_object('assignedProfileId', p3, 'segments', jsonb_build_array(jsonb_build_object('startsAt','2027-05-12T03:00:00Z','endsAt','2027-05-12T04:00:00Z','timezone',qa,'kind','on_site','location','Doha'))))) ilike '%booking_overlap_not_overridable%', '12.20 a date-only confirmed assignment blocks the whole date for a booking (conservative)');
  -- ---- audit and history: nothing was edited or deleted by the guard
  perform pg_temp.must((select count(*) from public.enquiry_booking_confirmations where enquiry_id = split_part(ea,'|',1)::uuid) = 1, '12.21 the booking record is untouched by every refused Crew Support change');
end $$;
select 'CREW DIRECTION REHEARSAL PASSED: two-way overlap protection, precise and conservative schedules' as result;
