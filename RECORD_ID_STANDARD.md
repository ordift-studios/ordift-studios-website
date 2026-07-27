# Ordift Studios — Record ID Standard

**Established:** 2026-07-27, alongside the dual-storage (Supabase + Google
Sheets) form workflow — see `GOOGLE_SHEETS_INTEGRATION.md` for that half.

**Purpose:** a single, platform-wide format for every human-facing record
identifier the site generates, so every current and future module (forms,
bookings, invoices, projects) is quotable, sortable, and instantly
recognizable by its prefix alone — without each module inventing its own
scheme.

---

## 1. The format

```
PREFIX-YYYY-NNNNNN
```

- **PREFIX** — a short, fixed code identifying the record type (see §2).
- **YYYY** — the 4-digit calendar year (UTC) the record was created in.
- **NNNNNN** — a 6-digit, zero-padded sequential number, starting at
  `000001` on the first record of that prefix in that year.

Example: the 42nd Contact Enquiry of 2026 is `ENQ-2026-000042`.

Each `(prefix, year)` pair gets its own independent counter that starts
over at `000001` every January 1st (UTC) — `ENQ-2026-000042` and
`WSH-2026-000042` can both exist; `ENQ-2027-000001` starts fresh the
following year regardless of where 2026 left off.

## 2. The 9 reserved prefixes

Defined once, centrally, in `src/lib/shared/recordId.ts`:

| Prefix | Entity | Status |
|---|---|---|
| `WSH` | Workshop Registration | **Live** — assigned by `/api/workshop-registration` |
| `ENQ` | Contact Enquiry | **Live** — assigned by `/api/enquiry` |
| `PRJ` | Project Request | **Live** — assigned by the client-portal request action (`src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts`); best-effort rather than required (see §7) |
| `BK` | Client Booking | Reserved — no form exists yet |
| `MDL` | Model Application | Reserved — no form exists yet |
| `VND` | Vendor Application | Reserved — no form exists yet |
| `EMP` | Employment Application | Reserved — no form exists yet |
| `CLT` | Client | Reserved — no form exists yet |
| `INV` | Invoice | Reserved — no form exists yet |

Adding a 10th prefix later is a one-line addition to the
`RECORD_PREFIXES` array — no schema change, since `record_sequences`
(see §3) keys on the prefix string itself rather than a fixed enum.

## 3. How it's generated (the mechanics)

```ts
import { generateRecordId } from "@/lib/shared/recordId";

const referenceNumber = await generateRecordId("ENQ"); // "ENQ-2026-000042"
```

Under the hood, `generateRecordId()` calls a Postgres function,
`public.next_record_sequence(p_prefix, p_year)`
(`supabase/migrations/0013_record_ids_and_sheet_sync.sql`), which does an
atomic `INSERT ... ON CONFLICT (prefix, year) DO UPDATE ... RETURNING` on
a small counter table, `record_sequences`. That single SQL statement
takes a row lock, so two near-simultaneous submissions for the same
prefix/year can never be handed the same number — no separate
read-then-write race window.

The function is `SECURITY DEFINER`, `search_path = ''`, and only
callable by the `service_role` — the same hardened shape as the existing
`find_user_id_by_email()` (`0003_find_user_by_email.sql`). It's invoked
via `createAdminClient().rpc("next_record_sequence", ...)`, same pattern
as every other privileged Supabase call in this codebase.

`generateRecordId()` **throws** on failure rather than returning a soft
error — Supabase is the primary, required application database (see §5
and `src/lib/supabase/primaryWrite.ts`), so a caller that can't obtain a
record ID can't proceed with the submission. Both form API routes catch
this and return a `503` with a generic message, exactly like a failed
primary save.

## 4. Existing records keep their old IDs — no backfill

Before 2026-07-27, Enquiries used `ORD-YYYYMMDD-XXXX` (a 4-digit random
suffix, not sequential) and Workshop Registrations used
`WKS-YYYYMMDD-XXXX`. **Neither format is retired retroactively.**
Existing rows in Supabase keep whatever reference they were assigned at
submission time — there is no migration script rewriting old IDs into
the new format, and none is planned. Only records created from
2026-07-27 onward use `PREFIX-YYYY-NNNNNN`.

This means a CRM/search view over historical + new data will see both
formats side by side indefinitely: `ORD-20260723-0417` next to
`ENQ-2026-000512`. Both are valid, permanent identifiers for their
respective record — an administrator should never assume every reference
number matches the new pattern.

## 5. Why Supabase, not Google Sheets, backs the counter

Sequential, gapless-per-race-condition numbering needs one authoritative,
transactional source of truth. Google Sheets' API has no equivalent to
an atomic row-level lock across concurrent requests, so it was never a
candidate for this. Supabase is also, as of this same change, the
platform's primary/required datastore for every form submission (see
`GOOGLE_SHEETS_INTEGRATION.md` §1) — so the counter lives in the same
database as the records it numbers, with the same durability guarantees.

## 6. Extending this for a future module

1. Add the new prefix to `RECORD_PREFIXES` in `src/lib/shared/recordId.ts`.
2. Call `await generateRecordId("XYZ")` when the new form/route creates
   its record — no other setup needed. The first call for that prefix
   in the current year automatically starts its counter at `000001`;
   `record_sequences` has no fixed list of valid prefixes to update.
3. If the new module also needs a Google Sheets worksheet, add it to
   `WORKSHEET_REGISTRY` in `src/lib/googleSheets/registry.ts` — see
   `GOOGLE_SHEETS_INTEGRATION.md` §5.

## 7. Project Requests: a deliberate exception

`PRJ` is generated best-effort, not required, unlike `ENQ`/`WSH`. The
client-portal request action
(`src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts`)
catches a `generateRecordId` failure, logs it, and proceeds with
`reference_number: null` rather than failing the whole request — there's
no user-facing confirmation that quotes the reference number back the
way the public forms' acknowledgement emails do, so a sequence hiccup
shouldn't block a client from submitting a request. `project_requests`
never had a reference number before this change at all; `reference_number`
was added as a nullable, partial-unique column
(`supabase/migrations/0015_project_requests_record_id.sql`) rather than
`not null`, since existing rows have nothing to backfill it with — same
"don't retroactively renumber history" principle as §4, just starting
from zero instead of from an old format.

---

*Companion document: [GOOGLE_SHEETS_INTEGRATION.md](GOOGLE_SHEETS_INTEGRATION.md) (the dual-storage workflow this ID standard feeds into).*
