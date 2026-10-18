-- Enquiry-to-booking M1: staff-recorded enquiries. ADDITIVE ONLY: four new columns on public.enquiries. Inserts, updates and deletes nothing, backfills
-- nothing, and changes no existing row, stage, amount, payment, quotation or booking.
--
--   source_channel                 how the enquiry reached Ordift. NULL on every existing row (website form or earlier than this column: not guessed).
--   received_at                    when the client made contact, as recorded by staff (submitted_at stays "when the row was created").
--   created_by                     the staff member who recorded it. NULL for website enquiries.
--   email_notifications_suppressed true = no AUTOMATIC client email (quotation ready, booking confirmed, files ready) is sent for this enquiry. Default
--                                  false, so every existing enquiry behaves exactly as before. Staff-recorded enquiries are created with it true.
--
-- enquiries.email stays NOT NULL (many existing screens and flows read it). An enquiry recorded without an address carries the reserved placeholder
-- '<reference>@no-email.invalid' (the .invalid domain is reserved and can never be a mailbox); the shared email dispatcher refuses it.
--
-- A guard trigger lets only a Super Admin (or server code, which runs as service_role) set or change these four columns through a signed-in session:
-- staff can update enquiries through row-level security, and the suppression flag decides whether a client is emailed.
begin;

alter table public.enquiries
  add column source_channel text check (source_channel is null or source_channel in ('website', 'whatsapp', 'telephone', 'email', 'in_person', 'referral', 'other')),
  add column received_at timestamptz,
  add column created_by uuid references public.profiles (id),
  add column email_notifications_suppressed boolean not null default false,
  add constraint enquiries_staff_recorded_shape check (created_by is null or (source_channel is not null and received_at is not null));

comment on column public.enquiries.source_channel is 'How the enquiry reached Ordift. NULL = website form or recorded before this column existed (not guessed).';
comment on column public.enquiries.received_at is 'When the client made contact, as recorded by the staff member who created the enquiry. Not the time the row was created.';
comment on column public.enquiries.created_by is 'The staff member who recorded the enquiry by hand. NULL for enquiries submitted through the website.';
comment on column public.enquiries.email_notifications_suppressed is 'true = no automatic client email (quotation ready, booking confirmed, files ready) is sent for this enquiry. Staff-recorded enquiries start true; changing it is a Super Admin action.';

create or replace function private.enquiry_intake_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if (new.source_channel is not null or new.received_at is not null or new.created_by is not null or new.email_notifications_suppressed) and not private.is_super_admin() then
        raise exception 'intake fields can only be set by a Super Admin or by the server' using errcode = '42501';
      end if;
    elsif (new.source_channel, new.received_at, new.created_by, new.email_notifications_suppressed) is distinct from (old.source_channel, old.received_at, old.created_by, old.email_notifications_suppressed) and not private.is_super_admin() then
      raise exception 'intake fields can only be changed by a Super Admin or by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.enquiry_intake_guard() from public;
create trigger enquiries_intake_guard before insert or update on public.enquiries for each row execute function private.enquiry_intake_guard();

commit;
