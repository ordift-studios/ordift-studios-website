-- READ-ONLY DIAGNOSTIC (a person runs it against the target database; it changes nothing). Payment auto-booking cutover, 10 Nov 2026.
-- Each block answers one question the release plan (RELEASE_PLAN_payment_auto_booking_2026_11_10.md) needs answered BEFORE anything is switched. No client details beyond the enquiry reference are selected.

-- 1. Projects the OLD behaviour already moved to "booked" (stage_change by the system, reason full_payment). They have no booking record; when booking confirmation is switched on they read "Booked (no booking record)" to staff.
select e.reference_number, e.crm_stage::text as stage, e.payment_status, e.amount_due, e.amount_paid,
       (select max(a.created_at) from public.activity_log a where a.entity_id = e.id::text and a.action = 'enquiry.stage_change' and a.metadata ->> 'reason' = 'full_payment') as booked_by_payment_at,
       exists (select 1 from public.activity_log a where a.entity_id = e.id::text and a.action = 'enquiry.booking_confirmed_email_sent') as client_got_booking_email
  from public.enquiries e
 where e.crm_stage::text in ('booked', 'in_progress', 'delivered', 'completed') and coalesce(e.commercial_intent, '') <> 'creative_crew_support'
   and exists (select 1 from public.activity_log a where a.entity_id = e.id::text and a.action = 'enquiry.stage_change' and a.metadata ->> 'reason' = 'full_payment')
 order by booked_by_payment_at desc nulls last;

-- 2. Paid in full but NOT booked (only possible for projects paid before the old behaviour existed, or whose stage was moved back by hand): these would show "Paid — scheduling pending".
select e.reference_number, e.crm_stage::text as stage, e.payment_status, e.amount_due, e.amount_paid from public.enquiries e
 where e.payment_status = 'Paid' and e.crm_stage::text in ('new_lead', 'contacted', 'discovery_meeting', 'quotation_sent', 'negotiation') and coalesce(e.commercial_intent, '') <> 'creative_crew_support' order by e.reference_number;

-- 3. The weak 'Paid' classification: a completed payment on an enquiry with NO amount due reads Paid (and, with the old behaviour, books it). Should be empty; each row needs a person's look.
select e.reference_number, e.crm_stage::text as stage, e.amount_due, e.amount_paid from public.enquiries e where e.payment_status = 'Paid' and coalesce(e.amount_due, 0) <= 0 order by e.reference_number;

-- 4. The CUTOVER WINDOW: payments that could complete while the switch is changed (their effect is decided at completion time by whichever code is running then).
select p.record_id, p.status, p.payment_method, p.payment_type, p.reference_amount_usd, e.reference_number from public.payments p join public.enquiries e on e.id::text = p.entity_id
 where p.entity_type = 'enquiry' and p.status in ('pending', 'awaiting_verification', 'additional_info_required') order by p.created_at;

-- 5. How many clients have been sent the generic "Booking Confirmed" e-mail by the old behaviour, and how recently (the volume that stops, and the communication that must be replaced).
select date_trunc('month', created_at)::date as month, count(*) as booking_confirmed_emails, count(distinct entity_id) as projects from public.activity_log where action = 'enquiry.booking_confirmed_email_sent' group by 1 order by 1 desc limit 12;

-- 6. Payment receipts: every completed enquiry payment should have a sent receipt job (the acknowledgement that continues to go). Anything not sent is a client who has paid with no acknowledgement TODAY.
select p.record_id, j.status, j.attempt_count, j.last_error from public.payments p left join public.payment_receipt_jobs j on j.payment_id = p.id and j.outcome = 'completed'
 where p.entity_type = 'enquiry' and p.status = 'completed' and p.payment_type <> 'refund' and (j.id is null or j.status <> 'sent') order by p.created_at desc limit 50;
