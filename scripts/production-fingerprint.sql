-- READ-ONLY content fingerprint of the existing records a Crew Support release
-- must NOT change. Run before and after each release step; every line must be
-- identical. Only columns that exist both before and after migrations
-- 0146–0149 are hashed, so the migrations themselves can't cause a difference.
select 'enquiries' t, count(*) n, md5(coalesce(string_agg(concat_ws('|', id, reference_number, email, user_id, crm_stage, amount_due, amount_paid, payment_status, is_test), ';' order by id), '')) h from public.enquiries
union all select 'client_quotations', count(*), md5(coalesce(string_agg(concat_ws('|', id, quotation_reference, status, client_profile_id, prospect_name, currency, subtotal, total, usd_total, valid_until, payment_booking_terms, issued_at, accepted_at, version, enquiry_id, crew_support_request_id), ';' order by id), '')) from public.client_quotations
union all select 'client_quotation_items', count(*), md5(coalesce(string_agg(concat_ws('|', id, quotation_id, service_item, quantity, unit_basis, selling_rate, line_total, source_type), ';' order by id), '')) from public.client_quotation_items
union all select 'payments', count(*), md5(coalesce(string_agg(concat_ws('|', id, entity_id, status, payment_type, reference_amount_usd, amount_collected), ';' order by id), '')) from public.payments
union all select 'payment_obligations', count(*), md5(coalesce(string_agg(concat_ws('|', id, payee_profile_id, amount, currency, status), ';' order by id), '')) from public.payment_obligations
union all select 'engagements', count(*), md5(coalesce(string_agg(concat_ws('|', id, payee_profile_id, entity_type, entity_id, status, agreed_amount, currency, payment_obligation_id), ';' order by id), '')) from public.engagements
union all select 'crew_support_requests', count(*), md5(coalesce(string_agg(concat_ws('|', id, reference_number, status, is_test, requester_email, enquiry_id, updated_at), ';' order by id), '')) from public.crew_support_requests
union all select 'crew_support_slots', count(*), md5(coalesce(string_agg(concat_ws('|', id, request_id, status, assignee_profile_id), ';' order by id), '')) from public.crew_support_slots
union all select 'profiles', count(*), md5(coalesce(string_agg(concat_ws('|', id, full_name, access_status, member_number), ';' order by id), '')) from public.profiles
union all select 'user_roles', count(*), md5(coalesce(string_agg(concat_ws('|', user_id, role_id), ';' order by user_id, role_id), '')) from public.user_roles
union all select 'agreements', count(*), md5(coalesce(string_agg(concat_ws('|', id, agreement_reference, status), ';' order by id), '')) from public.agreements
union all select 'workshop_registrations', count(*), md5(coalesce(string_agg(concat_ws('|', id, payment_status, amount_due, amount_paid), ';' order by id), '')) from public.workshop_registrations;
