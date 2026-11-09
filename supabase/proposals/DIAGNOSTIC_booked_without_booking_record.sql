-- READ-ONLY DIAGNOSTIC (run by a person against a target database; it changes nothing). Booking-integrity phase, 10 Nov 2026.
-- Lists ordinary enquiries whose stage is 'booked' but which have NO live confirmed booking record (no confirmation row, or the latest one is 'cancelled').
-- Before the booking-confirmation tables exist (Production today) every 'booked' project is legacy and is listed with has_booking_tables = false; that is expected, not an error.
-- Crew Support enquiries are excluded (booked only by their own confirmation). Money columns are shown for context only; this file never writes.
select e.reference_number, e.crm_stage::text as stage, e.payment_status, e.amount_due, e.amount_paid,
       (select c.kind from public.enquiry_booking_confirmations c where c.enquiry_id = e.id order by c.version desc limit 1) as latest_booking_kind,
       (select a.created_at from public.activity_log a where a.entity_id = e.id::text and a.action = 'enquiry.stage_change' and a.metadata ->> 'reason' = 'full_payment' order by a.created_at desc limit 1) as booked_by_payment_at
  from public.enquiries e
 where e.crm_stage::text = 'booked'
   and coalesce(e.commercial_intent, '') <> 'creative_crew_support'
   and not exists (select 1 from public.enquiry_booking_confirmations c where c.enquiry_id = e.id
                    and c.version = (select max(version) from public.enquiry_booking_confirmations where enquiry_id = e.id) and c.kind <> 'cancelled')
 order by e.reference_number;
