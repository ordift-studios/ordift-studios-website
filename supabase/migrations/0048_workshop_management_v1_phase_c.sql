-- Workshop Management V1, Phase C (2026-08-25).
--
-- Closes the one Phase B deferred item that is a genuine correctness
-- gap: the overall workshop.capacity registered/waitlist decision was a
-- separate count-then-insert (two round trips), so two near-simultaneous
-- registrations for the same near-capacity workshop could both read the
-- same count and both be admitted as "Registered" — the same class of
-- race the ticket_type reservation (0047) already closed with a single
-- atomic UPDATE...RETURNING. The workshop-wide decision has no existing
-- per-workshop counter row to UPDATE (capacity lives in Sanity, not
-- Postgres) so the equivalent fix here is a single SECURITY DEFINER
-- function that takes a session-independent transaction-scoped advisory
-- lock (pg_advisory_xact_lock, keyed by workshop_slug — released
-- automatically at the end of this function's own implicit
-- transaction), counts, decides, and inserts the registration row all
-- within that one lock — never two round trips a concurrent request
-- could interleave with.
--
-- Purely additive: one new function, zero changes to
-- workshop_registrations' columns, RLS, or any other existing table.
-- The exact same column set src/lib/supabase/primaryWrite.ts's
-- saveWorkshopRegistrationToSupabase() already inserted is preserved
-- unchanged — this function performs that same insert, just with the
-- registration_status/waiting_list_position decision made atomically
-- inside it instead of being computed by the caller beforehand.

begin;

create or replace function public.create_workshop_registration(p_workshop_slug text, p_capacity int, p_row jsonb)
returns table(id uuid, registration_status text, waiting_list_position int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered_count int;
  v_waitlisted_count int;
  v_status text;
  v_waiting_list_position int;
  v_id uuid;
begin
  -- Transaction-scoped (not session-scoped) — safe under connection
  -- pooling, since it's acquired and released within this single
  -- function call's own implicit transaction, never held across
  -- separate round trips.
  perform pg_advisory_xact_lock(hashtext(p_workshop_slug));

  select count(*) into v_registered_count from public.workshop_registrations
    where workshop_slug = p_workshop_slug and registration_status = 'Registered';
  select count(*) into v_waitlisted_count from public.workshop_registrations
    where workshop_slug = p_workshop_slug and registration_status = 'Waitlisted';

  v_status := case when v_registered_count < p_capacity then 'Registered' else 'Waitlisted' end;
  v_waiting_list_position := case when v_status = 'Waitlisted' then v_waitlisted_count + 1 else null end;

  insert into public.workshop_registrations (
    user_id, registration_reference, email, full_name, first_name, middle_name, surname,
    phone, phone_country_code, country_of_residence, consent_accepted_at, ticket_type_id,
    amount_due, workshop_id, workshop_slug, workshop_title, registration_status,
    waiting_list_position, payment_status, registration_date
  )
  values (
    nullif(p_row->>'user_id', '')::uuid,
    p_row->>'registration_reference',
    p_row->>'email',
    p_row->>'full_name',
    p_row->>'first_name',
    p_row->>'middle_name',
    p_row->>'surname',
    p_row->>'phone',
    p_row->>'phone_country_code',
    p_row->>'country_of_residence',
    nullif(p_row->>'consent_accepted_at', '')::timestamptz,
    nullif(p_row->>'ticket_type_id', '')::uuid,
    nullif(p_row->>'amount_due', '')::numeric,
    p_row->>'workshop_id',
    p_row->>'workshop_slug',
    p_row->>'workshop_title',
    v_status,
    v_waiting_list_position,
    p_row->>'payment_status',
    nullif(p_row->>'registration_date', '')::timestamptz
  )
  returning workshop_registrations.id into v_id;

  return query select v_id, v_status, v_waiting_list_position;
end;
$$;

revoke all on function public.create_workshop_registration(text, int, jsonb) from public;
revoke all on function public.create_workshop_registration(text, int, jsonb) from anon;
revoke all on function public.create_workshop_registration(text, int, jsonb) from authenticated;
grant execute on function public.create_workshop_registration(text, int, jsonb) to service_role;

commit;
