-- Section 11 (availability before quoting): the read-only preview used by the pre-quotation check agrees, case by case, with what confirmation enforces. Appended by rehearse_availability.sh after the shared setup of REHEARSE_booking_body.sql.
do $$ declare ent text := '44444444-4444-4444-8444-444444444401'; p2 text := '00000000-0000-4000-8000-0000000000a2'; p3 text := '00000000-0000-4000-8000-0000000000a3';
  ea text := pg_temp.mk(71, ent, 'QAR', 100, 'photography', 100, 0); eb text := pg_temp.mk(72, ent, 'QAR', 100, 'photography', 100, 0); ec text := pg_temp.mk(73, ent, 'QAR', 100, 'photography', 100, 0);
  seg_a jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-10T06:00:00Z','endsAt','2027-01-10T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));      -- 09:00-12:00 Doha
  seg_overlap jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-10T07:00:00Z','endsAt','2027-01-10T08:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));   -- inside A
  seg_partial jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-10T08:00:00Z','endsAt','2027-01-10T10:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));   -- overlaps A's last hour
  seg_adjacent jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-10T09:00:00Z','endsAt','2027-01-10T10:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));   -- starts when A ends
  seg_moved jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-12T06:00:00Z','endsAt','2027-01-12T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));
  a_conf text; pre jsonb;
begin
  -- nothing booked yet: a pre-check finds nothing ("tentatively available" at best, never a reservation)
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_a, null)) = 0, '11.1 an empty calendar has no conflict');
  a_conf := pg_temp.conf(pg_temp.pl(ea, jsonb_build_object('assignedProfileId', p2, 'segments', seg_a)));
  perform pg_temp.must((select count(*) from public.enquiry_booking_confirmations where enquiry_id = split_part(eb,'|',1)::uuid) = 0, '11.2 a pre-check by itself created no booking, hold or record for the other enquiry');
  -- the same person, overlapping, partially overlapping, adjacent, another person, another day
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_overlap, split_part(eb,'|',1)::uuid)) = 1 and (public.preview_booking_conflicts(p2::uuid, seg_overlap, split_part(eb,'|',1)::uuid) -> 0 ->> 'firm') = 'true', '11.3 a window inside a confirmed booking is a firm conflict');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_partial, split_part(eb,'|',1)::uuid)) = 1, '11.4 a partial overlap is a conflict');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_adjacent, split_part(eb,'|',1)::uuid)) = 0, '11.5 a window that starts when the other ends is not a conflict');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p3::uuid, seg_overlap, split_part(eb,'|',1)::uuid)) = 0, '11.6 another person is not affected');
  -- the preview and the confirmation agree: whatever the preview calls firm, confirmation refuses without documented verification; whatever it calls free, confirmation accepts
  perform pg_temp.must(pg_temp.try(pg_temp.pl(eb, jsonb_build_object('assignedProfileId', p2, 'segments', seg_overlap))) ilike '%booking_overlap_not_overridable%', '11.7 confirmation refuses the overlap the preview reported');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(eb, jsonb_build_object('assignedProfileId', p2, 'segments', seg_partial))) ilike '%booking_overlap_not_overridable%', '11.8 confirmation refuses the partial overlap');
  perform pg_temp.must((select count(*) from public.enquiry_booking_confirmations where enquiry_id = split_part(eb,'|',1)::uuid) = 0, '11.9 the refused attempts left nothing behind');
  -- a pre-check that said "no conflict" does not protect against a booking confirmed in between: the confirmation re-checks and refuses
  pre := public.preview_booking_conflicts(p3::uuid, seg_overlap, split_part(ec,'|',1)::uuid);
  perform pg_temp.must(jsonb_array_length(pre) = 0, '11.10 the pre-check for person 3 found it free');
  perform pg_temp.conf(pg_temp.pl(eb, jsonb_build_object('assignedProfileId', p3, 'segments', seg_overlap)));      -- someone else is booked for person 3 in between
  perform pg_temp.must(pg_temp.try(pg_temp.pl(ec, jsonb_build_object('assignedProfileId', p3, 'segments', seg_overlap))) ilike '%booking_overlap_not_overridable%', '11.11 the earlier "free" result is not honoured: confirmation re-checks and refuses');
  -- the same enquiry is never confirmed twice
  perform pg_temp.must(pg_temp.try(pg_temp.pl(ea, jsonb_build_object('assignedProfileId', p2, 'segments', seg_moved))) ilike '%booking_already_confirmed%', '11.12 an enquiry already confirmed cannot be confirmed again, only changed');
  -- editing one's own booking is not a conflict with itself; a change frees the old window and takes the new one
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_overlap, split_part(ea,'|',1)::uuid)) = 0, '11.13 a booking does not conflict with itself while it is being changed');
  perform pg_temp.conf(pg_temp.pl(ea, jsonb_build_object('assignedProfileId', p2, 'segments', seg_moved, 'supersedes', a_conf)));
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_overlap, split_part(ec,'|',1)::uuid)) = 0, '11.14 after a change the old window is free');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_moved, split_part(ec,'|',1)::uuid)) = 1, '11.15 and the new window is taken');
  -- a cancellation frees the window
  perform public.cancel_ordinary_booking(split_part(ea,'|',1)::uuid, 'client withdrew in writing', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg_moved, split_part(ec,'|',1)::uuid)) = 0, '11.16 a cancelled booking no longer blocks the window');
  -- an unassigned pre-check cannot be answered by the database: no person, no conflicts (the application reports it as "unverified")
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(null, seg_a, null)) = 0, '11.17 with no person chosen the database reports nothing (the application treats that as unverified, never as available)');
end $$;
select 'AVAILABILITY REHEARSAL PASSED: pre-quotation preview agrees with confirmation' as result;
