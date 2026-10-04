-- Creative Crew Support (2026-10-04)
--
-- INSPECTION SUMMARY:
--   - enquiries (0001/0014) is the existing commercial anchor: CRM stage,
--     amount_due/payments, quotations and project_assignments all key off
--     an enquiry. A Crew Support request therefore creates a normal
--     enquiries row (service = 'crew-support') so it appears in the
--     existing Admin Enquiries / quotation / payment workflow, and
--     crew_support_requests EXTENDS it with the crew-specific detail
--     (enquiry_id FK). No parallel customer/lead/quote/payment system.
--   - The three commercial intents (Ordift-led, Creative Crew Support,
--     Post-production/Creative Support) are recorded once, on the anchor:
--     enquiries.commercial_intent. Every existing row defaults to
--     'ordift_led', so no historical record changes meaning. Part 3
--     ('creative_post_support') is only reserved here, not built.
--   - operational_titles (0009/0041) is the existing workforce role
--     taxonomy (Photographer, Videographer, Production Assistant, ...);
--     requirements reference it instead of a new role table. A free-text
--     custom_role covers anything not configured.
--   - Per-person slots (crew_support_slots) are what staff assign. The
--     assignee is an existing profiles row (staff, contractor, freelancer
--     or the Founder) — no parallel workforce record. Nothing is ever
--     auto-assigned, and a submitted request guarantees no availability.
--   - No booking calendar exists yet (only the HR working-day calendar),
--     so this migration creates no calendar rows. Dates are stored on the
--     request for a future calendar.
--   - No pricing is invented: there is no rate column. Quotes go through
--     the existing quotation engine against the anchor enquiry.
--   - No legal template is created or marked Counsel Approved.
--   - Everything here is additive. No existing row, policy or function is
--     modified (the enquiries column has a default, so existing rows are
--     untouched).

begin;

alter table public.enquiries
  add column commercial_intent text not null default 'ordift_led'
  check (commercial_intent in ('ordift_led', 'creative_crew_support', 'creative_post_support'));

comment on column public.enquiries.commercial_intent is
  'Who owns the principal client engagement. ordift_led = the client hired Ordift as the principal provider. creative_crew_support = another professional/company owns the project and asked Ordift for supporting personnel (Ordift is NOT the principal provider). creative_post_support = reserved for post-production/creative support (not built yet).';

create table public.crew_support_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null unique references public.enquiries (id),
  reference_number text not null unique,
  status text not null default 'received'
    check (status in ('received', 'under_review', 'availability_review', 'quoted', 'agreement_pending', 'payment_pending', 'confirmed', 'declined', 'cancelled')),
  requester_type text not null
    check (requester_type in ('photographer', 'videographer', 'creative_studio', 'production_company', 'agency', 'brand_business', 'event_professional', 'other')),
  requester_name text not null,
  requester_email text not null,
  requester_phone text not null,
  requester_company text,
  lead_company text,
  service_family text not null,
  project_name text not null,
  project_type text,
  project_description text,
  start_date date not null,
  end_date date not null,
  call_time text,
  finish_time text,
  location text not null,
  on_site_contact text,
  urgency text not null default 'standard' check (urgency in ('flexible', 'standard', 'urgent')),
  budget_note text,
  requester_notes text,
  service_details jsonb not null default '{}'::jsonb,
  consent_accepted_at timestamptz not null,
  idempotency_key text unique,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crew_support_requests_dates_check check (end_date >= start_date)
);

comment on table public.crew_support_requests is
  'Creative Crew Support request header. A submitted request is an ENQUIRY, not a booking and not a guarantee of crew availability; status only reaches confirmed through staff action after review, quote, agreement and any payment requirement. Ordift is the supporting party — the requester/lead_company owns the principal engagement.';

create table public.crew_support_requirements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.crew_support_requests (id) on delete cascade,
  operational_title_id uuid references public.operational_titles (id),
  role_label text not null,
  custom_role text,
  quantity integer not null check (quantity between 1 and 50),
  responsibilities text,
  equipment_note text,
  sort_order integer not null default 0
);

create table public.crew_support_slots (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.crew_support_requirements (id) on delete cascade,
  request_id uuid not null references public.crew_support_requests (id) on delete cascade,
  slot_number integer not null check (slot_number >= 1),
  status text not null default 'unfilled' check (status in ('unfilled', 'proposed', 'assigned', 'declined', 'released')),
  assignee_profile_id uuid references public.profiles (id),
  note text,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (requirement_id, slot_number),
  constraint crew_support_slots_assignee_check check (status in ('unfilled', 'declined', 'released') or assignee_profile_id is not null)
);

comment on table public.crew_support_slots is
  'One row per person requested (a 2-photographer requirement has 2 slots). Assigned only by explicit staff action to an existing profiles row — never automatically.';

create index crew_support_requests_status_idx on public.crew_support_requests (status, submitted_at desc);
create index crew_support_requirements_request_idx on public.crew_support_requirements (request_id, sort_order);
create index crew_support_slots_request_idx on public.crew_support_slots (request_id);
create index crew_support_slots_assignee_idx on public.crew_support_slots (assignee_profile_id) where assignee_profile_id is not null;

alter table public.crew_support_requests enable row level security;
alter table public.crew_support_requirements enable row level security;
alter table public.crew_support_slots enable row level security;

create policy "crew_support_requests: staff read" on public.crew_support_requests
  for select to authenticated using ((select private.is_staff_or_admin()));
create policy "crew_support_requirements: staff read" on public.crew_support_requirements
  for select to authenticated using ((select private.is_staff_or_admin()));
create policy "crew_support_slots: staff read" on public.crew_support_slots
  for select to authenticated using ((select private.is_staff_or_admin()));

grant select on public.crew_support_requests, public.crew_support_requirements, public.crew_support_slots to authenticated;
grant select, insert, update, delete on public.crew_support_requests, public.crew_support_requirements, public.crew_support_slots to service_role;

-- Atomic create: enquiry anchor + request + requirements + one slot per
-- person, in a single transaction (same approach as
-- create_workshop_registration). Returns the new ids.
create or replace function public.create_crew_support_request(p_request jsonb, p_requirements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry_id uuid;
  v_request_id uuid;
  v_requirement_id uuid;
  v_req jsonb;
  v_i integer := 0;
  v_slot integer;
begin
  insert into public.enquiries (user_id, reference_number, email, full_name, phone, service, commercial_intent, submitted_at)
  values (
    nullif(p_request ->> 'user_id', '')::uuid,
    p_request ->> 'reference_number',
    p_request ->> 'requester_email',
    p_request ->> 'requester_name',
    p_request ->> 'requester_phone',
    'crew-support',
    'creative_crew_support',
    (p_request ->> 'submitted_at')::timestamptz
  )
  returning id into v_enquiry_id;

  insert into public.crew_support_requests (
    enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, requester_company,
    lead_company, service_family, project_name, project_type, project_description, start_date, end_date, call_time,
    finish_time, location, on_site_contact, urgency, budget_note, requester_notes, service_details,
    consent_accepted_at, idempotency_key, submitted_at
  )
  values (
    v_enquiry_id, p_request ->> 'reference_number', p_request ->> 'requester_type', p_request ->> 'requester_name',
    p_request ->> 'requester_email', p_request ->> 'requester_phone', nullif(p_request ->> 'requester_company', ''),
    nullif(p_request ->> 'lead_company', ''), p_request ->> 'service_family', p_request ->> 'project_name',
    nullif(p_request ->> 'project_type', ''), nullif(p_request ->> 'project_description', ''),
    (p_request ->> 'start_date')::date, (p_request ->> 'end_date')::date, nullif(p_request ->> 'call_time', ''),
    nullif(p_request ->> 'finish_time', ''), p_request ->> 'location', nullif(p_request ->> 'on_site_contact', ''),
    coalesce(nullif(p_request ->> 'urgency', ''), 'standard'), nullif(p_request ->> 'budget_note', ''),
    nullif(p_request ->> 'requester_notes', ''), coalesce(p_request -> 'service_details', '{}'::jsonb),
    (p_request ->> 'consent_accepted_at')::timestamptz, nullif(p_request ->> 'idempotency_key', ''),
    (p_request ->> 'submitted_at')::timestamptz
  )
  returning id into v_request_id;

  for v_req in select * from jsonb_array_elements(p_requirements)
  loop
    v_i := v_i + 1;
    insert into public.crew_support_requirements (request_id, operational_title_id, role_label, custom_role, quantity, responsibilities, equipment_note, sort_order)
    values (
      v_request_id, nullif(v_req ->> 'operational_title_id', '')::uuid, v_req ->> 'role_label', nullif(v_req ->> 'custom_role', ''),
      (v_req ->> 'quantity')::integer, nullif(v_req ->> 'responsibilities', ''), nullif(v_req ->> 'equipment_note', ''), v_i
    )
    returning id into v_requirement_id;

    for v_slot in 1..(v_req ->> 'quantity')::integer
    loop
      insert into public.crew_support_slots (requirement_id, request_id, slot_number) values (v_requirement_id, v_request_id, v_slot);
    end loop;
  end loop;

  return jsonb_build_object('request_id', v_request_id, 'enquiry_id', v_enquiry_id);
end;
$$;

revoke all on function public.create_crew_support_request(jsonb, jsonb) from public;
revoke all on function public.create_crew_support_request(jsonb, jsonb) from anon;
revoke all on function public.create_crew_support_request(jsonb, jsonb) from authenticated;
grant execute on function public.create_crew_support_request(jsonb, jsonb) to service_role;

commit;
