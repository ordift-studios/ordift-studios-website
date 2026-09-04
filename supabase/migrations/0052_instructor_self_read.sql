begin;

-- Phase H.1/H.2 (2026-09-04), Section 5 — minimum additive, read-safe
-- integration for the instructor-as-contractor experience. Purely
-- additive: adds one new SELECT policy, touches no existing policy,
-- column, or row. workshop_instructor_engagements had no self-read
-- policy at all before this (admin-only) — an instructor with a real
-- profile_id can now read their own engagement rows (status, agreed
-- compensation, linked payment_obligation_id) for display in the
-- shared contractor portal. Full workshop title/session date/topic
-- (which live in Sanity, referenced only by the opaque workshop_id
-- text column here) is explicitly NOT wired in this pass — see the
-- Phase H.1/H.2 report's Known Limitations.
create policy "workshop_instructor_engagements: self read" on public.workshop_instructor_engagements
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

commit;
