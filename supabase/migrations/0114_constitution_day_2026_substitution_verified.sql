-- Ordift Studios Compliance/COMP-SYS-1, Phase B7 Step 4 (2026-09-15) —
-- Constitution Day 2026 discrepancy resolution.
--
-- The previous migration (0113) recorded Constitution Day as a single,
-- unsubstituted date (7 January 2026) because the general statutory
-- holidays summary page it cited showed no dual-date notation for it
-- (unlike Republic Day/Boxing Day, which do). Per explicit instruction,
-- that discrepancy was flagged rather than guessed at.
--
-- This migration resolves it with a fresh, targeted, authoritative
-- source investigation — NOT by trusting the previously-stated claim
-- merely because it was stated again. Found and fetched directly this
-- session: a real, individual Ministry of the Interior declaration
-- page (not the general summary table), independently confirmed via a
-- second raw HTTP fetch of the same URL to cross-check the AI-assisted
-- extraction against the actual page text:
--
--   https://www.mint.gov.gh/declaration-of-friday-9th-january2026-as-a-public-holiday/
--
-- Verbatim body text (fetched 2026-09-15):
--   "The general public is hereby informed that Wednesday, 7th
--   January 2026, marks Constitution Day, which is a Statutory Public
--   Holiday. However, in view of the fact that 7th January 2026 falls
--   on a Wednesday, His Excellency, the President of the Republic of
--   Ghana, has, by Executive Instrument (E.I), in accordance with
--   Section 2 of the Public Holidays and Commemorative Days Act
--   (Act 601), as amended, declared Friday, 9th January 2026, as a
--   Public Holiday and should be observed as such throughout the
--   country."
--   Signed: Muntaka Mohammed-Mubarak (MP), Minister for the Interior.
--   Issued: 2 January 2026.
--
-- This is a genuine, dated, signed, legally-cited Executive Instrument
-- declaration — corroborated further by the same Ministry issuing an
-- identically-patterned declaration in each of the three preceding
-- years for the same recurring reason (Constitution Day landing on a
-- non-Friday weekday), confirmed via a domain-restricted search of
-- mint.gov.gh itself (e.g. "Declaration of Tuesday, 7th January 2025
-- as a Statutory Public Holidays", "Declaration of Monday, 8th
-- January, 2024", "Declaration of Monday, 9th January, 2023") — an
-- established, recurring administrative practice, not a one-off or
-- disputed claim.
--
-- The declaration text does not state that 7 January ALSO remains a
-- separately observed non-working day — per the authorizing
-- instruction's own decision rule ("do not cause both dates to become
-- non-working unless the official declaration expressly makes both
-- public holidays"), only 9 January is recorded as the actual
-- non-working (observed) date. This is the SAME nominal-vs-observed
-- pattern already applied to Republic Day and Boxing Day in migration
-- 0113, and the existing Working-Day Resolver query (fixed in the
-- previous phase to match holiday_date only when observed_date is
-- null, or observed_date directly) already handles this correctly
-- with no further code change needed.
--
-- public_holidays is a correctable reference table (service_role has
-- update, migration 0112) — this UPDATEs the existing row to add the
-- now-verified observed_date rather than inserting a duplicate row,
-- since this is completing a previously-incomplete record with
-- genuinely new evidence, not correcting a previously-wrong fact.

begin;

update public.public_holidays
set observed_date = '2026-01-09',
    source_reference = 'https://www.mint.gov.gh/declaration-of-friday-9th-january2026-as-a-public-holiday/ — "Declaration of Friday, 9th January, 2026 as a Public Holiday", Ministry of the Interior, Republic of Ghana. Executive Instrument under Section 2 of the Public Holidays and Commemorative Days Act (Act 601), as amended. Signed Muntaka Mohammed-Mubarak (MP), Minister for the Interior. Issued 2 January 2026. Verified by direct fetch of the declaration page (2026-09-15), corroborated by the Ministry''s identically-patterned declarations in 2023, 2024 and 2025 for the same recurring reason.',
    verified_at = now()
where employment_jurisdiction_id = 'af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'
  and holiday_date = '2026-01-07'
  and name = 'Constitution Day'
  and holiday_year = 2026
  and observed_date is null;

commit;
