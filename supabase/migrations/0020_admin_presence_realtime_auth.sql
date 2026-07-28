-- Ordift Studios — Realtime Authorization for the admin presence
-- channel (2026-07-28)
--
-- Backs the "Active Users" dashboard panel: a Supabase Realtime
-- Presence channel named 'admin-presence' that staff/admin/super_admin
-- accounts join while viewing /admin/**, so everyone sees who else is
-- currently online.
--
-- Realtime channels are NOT private by default — any authenticated
-- Supabase client can create or join a channel with any topic name
-- purely client-side, regardless of what the app's own UI chooses to
-- render. Per explicit instruction ("Public-facing accounts such as
-- Clients, Models, Vendors, Workshop Participants... must never have
-- access to this channel"), route-gating the component that joins the
-- channel (it only ever mounts inside /admin/layout.tsx, itself gated
-- to staff/admin/super_admin) is not sufficient on its own — a
-- technical user could still open a Realtime channel with this exact
-- topic name directly from browser dev tools. Supabase Realtime
-- Authorization closes that gap: the channel is created client-side
-- with `{ config: { private: true } }`, and Postgres RLS policies on
-- realtime.messages (matched via realtime.topic()) decide who can
-- actually subscribe to or broadcast on that topic.
--
-- The role check below is an inline `exists (...)` against
-- user_roles/roles/profiles rather than a call to the shared
-- private.is_staff_or_admin() helper used everywhere else in this
-- schema. That helper does not resolve auth.uid() correctly when
-- evaluated from inside Realtime's authorization path — confirmed by
-- isolating the failure against a topic-only test policy (no role
-- check) during staging verification, which connected successfully,
-- proving the role-check function itself was the failure point, not
-- the client-side auth-token wiring or Realtime Authorization more
-- generally. The inline query replicates has_role()'s own logic
-- (active, unexpired profile; role in staff/admin/super_admin — the
-- same set src/lib/portal/roles.ts's isStaffOrAdmin() grants the
-- /admin/** console to) rather than is_staff_or_admin()'s narrower
-- staff-or-admin-only check, since super_admin accounts must also
-- reach this channel and the layout they connect from already gates
-- on isStaffOrAdmin(), not is_staff_or_admin().

begin;

create policy "admin_presence_channel_read" on "realtime"."messages"
  for select
  to authenticated
  using (
    realtime.topic() = 'admin-presence'
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where ur.user_id = auth.uid()
        and r.slug in ('staff', 'admin', 'super_admin')
        and p.access_status = 'active'
        and (p.access_expires_at is null or p.access_expires_at > now())
    )
  );

create policy "admin_presence_channel_write" on "realtime"."messages"
  for insert
  to authenticated
  with check (
    realtime.topic() = 'admin-presence'
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where ur.user_id = auth.uid()
        and r.slug in ('staff', 'admin', 'super_admin')
        and p.access_status = 'active'
        and (p.access_expires_at is null or p.access_expires_at > now())
    )
  );

commit;
