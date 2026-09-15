-- Ordift Studios Compliance/COMP-SYS-1, Phase B7 Step 3 (2026-09-15) —
-- Ghana 2026 official public holiday configuration, resolving the
-- CONFIGURATION REQUIRED status public_holidays (migration 0112) was
-- deliberately left in.
--
-- Source: fetched directly this session (WebFetch) from the specific
-- authoritative page the Founder named — mint.gov.gh's "Statutory
-- Public Holidays and Commemorative Days in the Republic of Ghana for
-- the Year 2026". No other source was used; no date below was guessed
-- or taken from a generic holiday website/calendar/Wikipedia.
--
-- Nominal vs. observed dates: the fetched page itself shows DUAL dates
-- (with the "Day" column matching the SECOND date) only for Republic
-- Day ("1st July/3rd July, Friday") and Boxing Day ("26th December/
-- 28th December, Monday") — confirmed by a second, more targeted
-- fetch of the same page asking specifically whether any explanatory
-- substitution text exists. Both are recorded here with holiday_date
-- = the nominal date and observed_date = the actual non-working date;
-- the Working-Day Resolver (workingDayCalendar.ts, fixed in this same
-- commit) now correctly treats ONLY the observed date as non-working
-- when observed_date is set, never both.
--
-- Constitution Day — GENUINE DISCREPANCY, FLAGGED RATHER THAN
-- SILENTLY RESOLVED: the Founder's instruction stated a government-
-- declared observance of Friday 9 January 2026 (nominal 7 January).
-- The specifically-cited official page does NOT show this — it lists
-- only "7th January, Wednesday" with no dual-date notation, unlike
-- Republic Day/Boxing Day which explicitly do. Rather than fabricate
-- a substitution the cited source doesn't show, this migration
-- records Constitution Day as a single date (7 January 2026, its
-- statutory/nominal date, matching the source) with NO observed_date
-- override, and documents this exact discrepancy in source_reference
-- for the Founder to resolve with the actual declaration document if
-- one exists elsewhere.
--
-- Founder's Day (Monday 21 September 2026) matches the source exactly
-- as a single statutory date — no substitution needed or claimed.
--
-- Movable Islamic holidays (Eid-Ul-Fitr, Shaqq Day, Eid-Ul-Adha):
-- the source itself states these "do not have fixed dates... the
-- dates for their observation are provided by the Office of the Chief
-- Imam in the course of the year" — genuinely no 2026 date exists yet
-- on the official source. NOT inserted. Left CONFIGURATION REQUIRED /
-- UNRESOLVED, per explicit instruction never to infer an Eid date from
-- an international Islamic calendar.
--
-- African Union Day (25 May) is explicitly labelled a "Commemorative"
-- day on the source, not a public holiday. NOT inserted — the current
-- public_holidays schema has no distinct "commemorative, informational
-- only" status, and inserting it here would incorrectly make the
-- Working-Day Resolver treat it as a non-working day, contaminating
-- working-day/leave calculations. Left for a later additive schema
-- enhancement, per explicit instruction.
--
-- 2026 only. No extrapolation into 2025/2027 — each year requires its
-- own independent sourcing (Easter moves, Eid moves, Farmers' Day
-- varies, substitutions can change).
--
-- created_by/verified_by are NULL: this is a migration-time data entry
-- performed by verifying the cited government source directly in this
-- session, not an authenticated in-app action by a specific admin
-- user — same precedent as migrations 0107/0109/0110. verification_status
-- is 'verified' for every row: each date/name below was checked
-- directly against the specifically-named official source.

begin;

insert into public.public_holidays (
  employment_jurisdiction_id, holiday_date, observed_date, holiday_year, name,
  source_reference, source_authority, verification_status, created_by
)
select v.jurisdiction_id, v.holiday_date, v.observed_date, 2026, v.name,
       v.source_reference, 'Government of Ghana — Ministry of the Interior', 'verified', null
from (
  values
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-01-01'::date, null::date, 'New Year''s Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — "Statutory Public Holidays and Commemorative Days in the Republic of Ghana for the Year 2026", fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-01-07'::date, null::date, 'Constitution Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — page lists 7 January as the sole date (Wednesday), with NO dual-date/substitution notation, unlike Republic Day/Boxing Day which do show one. A claimed government observance of Friday 9 January 2026 could NOT be corroborated on this specific source page (re-fetched and checked directly for substitution text) — recorded here as the unsubstituted nominal date only; resolve with the actual Ministry declaration if a Friday observance genuinely exists.'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-03-06'::date, null::date, 'Independence Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-04-03'::date, null::date, 'Good Friday',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-04-06'::date, null::date, 'Easter Monday',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-05-01'::date, null::date, 'Labour Day (Workers'' Day)',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-07-01'::date, '2026-07-03'::date, 'Republic Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — page shows dual dates "1st July/3rd July, Friday"; observed (non-working) date recorded as 3 July 2026, nominal date 1 July 2026'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-09-21'::date, null::date, 'Founder''s Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-12-04'::date, null::date, 'Farmer''s Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-12-25'::date, null::date, 'Christmas Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — fetched 2026-09-15'),
    ('af4f4c69-57a1-4f17-92f9-fcbf8bad80aa'::uuid, '2026-12-26'::date, '2026-12-28'::date, 'Boxing Day',
     'https://www.mint.gov.gh/statutory-public-holidays/ — page shows dual dates "26th December/28th December, Monday"; observed (non-working) date recorded as 28 December 2026, nominal date 26 December 2026')
) as v(jurisdiction_id, holiday_date, observed_date, name, source_reference)
where not exists (
  select 1 from public.public_holidays existing
  where existing.employment_jurisdiction_id = v.jurisdiction_id
    and existing.holiday_date = v.holiday_date
    and existing.holiday_year = 2026
);

commit;
