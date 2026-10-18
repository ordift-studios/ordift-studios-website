-- Rollback for 0165: removes the four intake columns ONLY if nothing has been recorded in them
-- (otherwise it refuses, so no channel, received time, author or suppression setting can be lost). Safe to run before any enquiry is recorded by hand.
begin;
do $$
begin
  if exists (select 1 from public.enquiries where source_channel is not null or received_at is not null or created_by is not null or email_notifications_suppressed) then
    raise exception 'down_0165 refused: enquiries already carry intake information';
  end if;
end $$;
drop trigger enquiries_intake_guard on public.enquiries;
drop function private.enquiry_intake_guard();
drop index public.enquiries_placeholder_email_uniq;
alter table public.enquiries drop constraint enquiries_staff_recorded_shape;
alter table public.enquiries drop column source_channel, drop column received_at, drop column created_by, drop column email_notifications_suppressed;
commit;
