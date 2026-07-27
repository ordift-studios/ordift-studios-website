# Ordift Studios — Google Sheets Integration

**Established:** 2026-07-23 (Enquiries only). **Rebuilt:** 2026-07-27 into
a single reusable service covering every public form, present and
future, inside one spreadsheet — "Ordift Studios Operations". **Extended
same day** to a third live integration (Project Requests) and an
Admin Portal operational-reporting layer that reads from Supabase, never
from this spreadsheet — see §9 and `ADMIN_GUIDE.md` §16.

**Status: code complete, not yet connected.** Every route/module below
runs today; what's missing is the Google Cloud service account and the
spreadsheet itself, both of which must be created and owned by Ordift
Studios (see §2). Until then, every environment falls back to a local
test log — nothing is silently dropped.

---

## 1. How this fits the dual-storage workflow

As of 2026-07-27, **Supabase is the primary, required application
database** for every public form — a submission isn't "saved" until its
Supabase write succeeds (`src/lib/supabase/primaryWrite.ts`). **Google
Sheets is a best-effort secondary copy**, written after the Supabase save
already succeeded:

- If the Sheets append succeeds: the submission now exists in both
  places.
- If it fails (misconfigured, rate-limited, network error, spreadsheet
  temporarily unreachable): the failure is logged to a retry queue
  (`sheet_sync_failures`, see §6) and the request still returns success
  to the visitor. **A Sheets failure never loses, blocks, or retries the
  visitor's submission** — the Supabase record is already durable by the
  time Sheets is even attempted.

This is the inverse of the original 2026-07-23 design, where Google
Sheets was primary/fail-closed (a Sheets failure meant the whole
submission failed) and Supabase was an additive, best-effort mirror. Read
`RECORD_ID_STANDARD.md` for the other half of this change — the record
IDs written into both stores now follow one shared, sequential format.

## 2. Setup (do this once, as the Ordift Studios Google account owner)

1. **Create a Google Cloud project** under an Ordift Studios-owned Google
   account (never a personal one — same ownership principle as every
   other third-party account this project uses).
2. **Enable the Google Sheets API** for that project.
3. **Create a service account** (IAM & Admin → Service Accounts), then
   create a JSON key for it. This gives you three values:
   - the service account's **email address**
   - its **private key** (inside the downloaded JSON, the `private_key`
     field)
   - (the project ID isn't needed directly — only the two values above)
4. **Create a Google Sheet named exactly "Ordift Studios Operations"**,
   owned by the same Ordift Studios Google account. Copy its ID from the
   URL: `https://docs.google.com/spreadsheets/d/`**`<SPREADSHEET_ID>`**`/edit`.
5. **Share the Sheet with the service account's email address** as an
   **Editor** — the API cannot write without this. No one else should
   have a standing share beyond named Ordift Studios administrators (no
   "anyone with the link" sharing).
6. **Set the three environment variables** (see `.env.example`):
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=...
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
   GOOGLE_SHEETS_SPREADSHEET_ID=...
   ```
   The private key is a multi-line PEM string — when pasting it into a
   single-line env var (`.env.local`, Vercel's env var UI), escape
   newlines as literal `\n`; the code un-escapes them automatically
   (`src/lib/googleSheets/client.ts`).
7. **Run the setup script** to create and prepare every worksheet (see
   §5):
   ```bash
   npx tsx scripts/setupGoogleSheets.ts
   ```
   (or `npm run setup:google-sheets`.) It creates any missing tab and
   writes its header row — safe to re-run any time.
8. **Staging vs. production:** staging never writes to the real Sheet at
   all — it falls back to a local test log regardless of whether these
   credentials are set (see §4). A second Sheet/tab for staging is
   optional and not required for the current setup.

Nothing above is committed to the repository or fabricated on your
behalf — every value is generated in your own Google Cloud console and
supplied out-of-band (`.env.local` locally, Vercel's environment variable
UI in deployment).

## 3. The 10 worksheets

All inside one spreadsheet, "Ordift Studios Operations". The full
registry (tab names + header rows) lives in
`src/lib/googleSheets/registry.ts` — this table mirrors it:

| Worksheet | Status | Fed by |
|---|---|---|
| Workshop Registrations | **Live** | `/api/workshop-registration` |
| Contact Enquiries | **Live** | `/api/enquiry` |
| Project Requests | **Live** | `/portal/client/projects/[kind]/[id]/requests` (authenticated client-portal action, not a public form) |
| Client Bookings | Reserved | *(no form yet — Client Bookings is a distinct future entity from Contact Enquiries)* |
| Newsletter Subscribers | Reserved | *(no form yet)* |
| Vendor Applications | Reserved | *(no form yet)* |
| Model Applications | Reserved | *(no form yet)* |
| Employment Applications | Reserved | *(no form yet)* |
| Equipment Rentals | Reserved | *(no form yet)* |
| Studio Reservations | Reserved | *(no form yet)* |

"Reserved" worksheets are fully created with the correct header row the
moment you run the setup script — they simply receive no rows until the
corresponding form is built (a deliberate scope decision: building 7 new
form systems was explicitly out of scope for this pass; only the
reusable plumbing and spreadsheet structure were prepared in advance so
none of them need a redesign later).

Every header row starts with **Timestamp, Record ID, Submission Source,
Status, Assigned Staff** and ends with **Last Updated**, with
form-specific fields in between — the standard requested for every
worksheet on the spreadsheet. "Record ID" is the `PREFIX-YYYY-NNNNNN`
value from `RECORD_ID_STANDARD.md`. "Assigned Staff" is always blank on
insert, for an administrator to fill in directly in the Sheet — no form
ever asks a visitor to assign themselves.

### Contact Enquiries — full column mapping

| Col | Header | Source |
|---|---|---|
| A | Timestamp | `submittedAt` |
| B | Record ID | `referenceNumber` (e.g. `ENQ-2026-000042`) |
| C | Submission Source | Always `Website Form` |
| D | Status | Always `New` on insert — an administrator updates this in the Sheet as the enquiry progresses (`Contacted`, `Quoted`, `Confirmed`, `Declined`, `Closed`, ...) |
| E | Assigned Staff | Blank on insert — administrator-filled directly in the Sheet |
| F | Service | `service` |
| G | Full Name | `fullName` |
| H | Company / Brand | `companyName` |
| I | Email | `email` |
| J | Phone | `phone` |
| K | Country | `country` |
| L | Project Type | `projectType` |
| M | Project Location | `projectLocation` |
| N | Timeframe | `timeframe` |
| O | Budget Range | `budgetRange` |
| P | Description | `description` |
| Q | Reference Link | `referenceLink` |
| R | Heard About Us | `hearAboutUs` |
| S–U | Follow-Up Date / Last Contacted / Internal Notes | Blank on insert — administrator-filled directly in the Sheet |
| V | Consent Timestamp | Same as Timestamp — consent is captured at the moment of submission |
| W | Source Page | `sourcePage` — which page/CTA sent the visitor to `/book` |
| X | Marketing Consent | `Yes`/`No` — a separate, optional, unchecked-by-default checkbox; submitting an enquiry never implies marketing opt-in |
| Y | Last Updated | Same as Timestamp at insert time |

**Deliberately not a column:** any uploaded file (this phase accepts
reference *links*, column Q — not direct uploads) and the visitor's raw
IP address (used transiently, in memory only, by the rate limiter;
never written to any persistent record).

### Workshop Registrations — full column mapping

| Col | Header | Source |
|---|---|---|
| A | Timestamp | `registrationDate` |
| B | Record ID | `registrationReference` (e.g. `WSH-2026-000042`) |
| C | Submission Source | Always `Website Form` |
| D | Status | `registrationStatus` (`Registered` or `Waitlisted`) |
| E | Assigned Staff | Blank on insert — administrator-filled directly in the Sheet |
| F | Workshop | `workshopTitle` |
| G | Workshop Slug | `workshopSlug` |
| H | Full Name | `fullName` |
| I | Email | `email` |
| J | Phone | `phone` |
| K | Country | `country` |
| L | Experience Level | `experienceLevel` |
| M | Waiting List Position | `"Waiting (position N)"` if waitlisted, else blank |
| N | Payment Status | `paymentStatus` (`Not Required` / `Pending` / `Paid` / `Refunded`) |
| O–P | Amount Due / Amount Paid | Blank on insert — administrator-filled once pricing/payment is confirmed |
| Q | Attendance Status | Blank on insert — administrator-filled after the workshop |
| R | Consent Timestamp | Same as Timestamp |
| S | Internal Notes | Blank on insert |
| T | Environment | `staging` or `production` |
| U | Last Updated | Same as Timestamp at insert time |

### Project Requests — full column mapping

Unlike the two above, this is fed by an **authenticated client-portal
action** (`src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts`),
not a public form — Submission Source reflects that distinction.

| Col | Header | Source |
|---|---|---|
| A | Timestamp | `createdAt` |
| B | Record ID | `referenceNumber` (e.g. `PRJ-2026-000042`) — best-effort; may be blank for the rare case where sequence generation itself failed (see `RECORD_ID_STANDARD.md`) |
| C | Submission Source | Always `Client Portal` |
| D | Status | Always `Pending` on insert — an administrator updates this via the existing request-decision flow (`src/app/admin/project-requests`), which stays the source of truth; the Sheet copy isn't synced back on status change |
| E | Assigned Staff | Blank on insert — administrator-filled directly in the Sheet |
| F | Request Type | The request type's label (e.g. "Reschedule", from `request_types`) |
| G | Related Project Reference | The linked enquiry's or workshop registration's own reference number |
| H | Related Project Type | `Enquiry` or `Workshop Registration` |
| I | Client Name | From the linked enquiry/registration |
| J | Email | From the linked enquiry/registration |
| K | Phone | From the linked enquiry/registration |
| L | Client Notes | `clientNotes` — free text the client entered |
| M | Staff Response | Blank on insert — populated once staff decide the request (not synced back retroactively) |
| N | Decided At | Blank on insert, same reasoning as Staff Response |
| O | Last Updated | Same as Timestamp at insert time |

## 4. Staging behavior (unchanged)

Staging (and any production deploy before `FORMS_SENDING_ENABLED=true`)
never touches the real spreadsheet, regardless of whether the three
Google credentials happen to be set — it always appends to a local,
gitignored test log instead:

- `.data/staging-enquiries.jsonl`
- `.data/staging-workshop-registrations.jsonl`
- `.data/staging-project-requests.jsonl`

This is the same "separate test workflow" isolation Plan Part J already
established — staging activity must never land in the production Sheet.
Only `productionSendingEnabled()` (`SITE_ENV=production` **and**
`FORMS_SENDING_ENABLED=true`) routes a submission's Sheets sync to the
real spreadsheet.

## 5. Extending this for a future form

1. Add a worksheet entry to `WORKSHEET_REGISTRY` in
   `src/lib/googleSheets/registry.ts` — a tab name and header row. No
   other file needs to change for the worksheet itself to exist; re-run
   `npm run setup:google-sheets` to create it.
2. Write a small `toSheetRow()` mapper next to the new form's own schema
   (same pattern as `src/lib/enquiry/storage.ts` and
   `src/lib/workshops/registrationStorage.ts`), producing a row in the
   same column order as the header.
3. Call `appendToWorksheet("yourWorksheetKey", row)`
   (`src/lib/googleSheets/writer.ts`) after the form's Supabase primary
   write succeeds — never before, and never as the thing that decides
   whether the submission succeeded.
4. On a failed append, call `logSheetSyncFailure(...)`
   (`src/lib/shared/sheetSyncFailures.ts`) so the failure is queued for
   retry instead of silently dropped.
5. Give the new record type its own prefix in `RECORD_ID_STANDARD.md` /
   `src/lib/shared/recordId.ts` if it doesn't already have one.

No form needs its own Google auth, worksheet-creation logic, or retry
handling — all three are shared.

## 6. Resilience: the sheet_sync_failures retry queue

`supabase/migrations/0013_record_ids_and_sheet_sync.sql` adds
`sheet_sync_failures` — one row per failed Sheets append, holding the
worksheet key, the record's ID, the full row payload (so nothing has to
be reconstructed to retry it), the error message, and a timestamp. It's
service-role-only (no `authenticated`/`anon` access), written via
`src/lib/shared/sheetSyncFailures.ts`.

Nothing currently drains this queue automatically — replaying failed
rows is a manual or future-scheduled-job operation (query
`sheet_sync_failures where resolved_at is null`, re-attempt the append,
set `resolved_at` on success). Building that replay job wasn't in scope
for this pass; the queue's job is purely to make sure a transient Sheets
outage is *recoverable* rather than *silent*.

## 7. Testing procedure

1. **Before credentials are set:** submit either form in staging and
   confirm the row appears in the corresponding `.data/staging-*.jsonl`
   file, and that the API response is a success with a
   `PREFIX-YYYY-NNNNNN` record ID.
2. **After running the setup script:** open the spreadsheet and confirm
   all 10 tabs exist with the correct header row (compare against §3).
3. **After setting `FORMS_SENDING_ENABLED=true` in a production
   deploy:** submit a real test enquiry/registration and confirm:
   - the row appears in Supabase (`enquiries` / `workshop_registrations`
     tables) — this must succeed for the API to return success at all.
   - the same row appears in the correct worksheet, with matching Record
     ID between the two stores.
4. **Simulate a Sheets failure** (e.g. temporarily revoke the service
   account's Editor share, or unset one of the three env vars) and
   confirm: the form submission still succeeds end-to-end (Supabase
   write unaffected), and a new row appears in `sheet_sync_failures`
   with the correct worksheet key and record ID. Restore the share/env
   var afterward.
5. **Capacity/waitlist check (Workshop Registrations only):** confirm
   `countRegisteredForWorkshop`/`countWaitlistedForWorkshop`
   (`src/lib/workshops/registrationStorage.ts`) reflect Supabase counts,
   not the Sheet — register enough test participants to cross a
   workshop's capacity and confirm the next one is `Waitlisted`.

## 8. Access control

The spreadsheet should be restricted to Ordift Studios administrators
only — Editor access via the service account for writes, human accounts
added individually as Viewer/Editor as needed, no shared public link.
Retention policy (how long submission data is kept, and whether/when
it's deleted) is a decision for the approved Privacy Notice, not
something assumed here.

## 9. This spreadsheet is a mirror, not a report source

The Admin Portal's operational reporting (search, filter, CSV/XLSX
export, "Email to Operations" — `ADMIN_GUIDE.md` §16) reads **only from
Supabase**, never from this spreadsheet. That's deliberate: Supabase is
the single authoritative record (§1), and a report that read from the
Sheet instead would silently reflect whatever the last successful sync
happened to be, rather than the true current state — especially for a
row an administrator has since edited directly in the Sheet (Assigned
Staff, Status, Internal Notes), which never flows back into Supabase.
Treat this spreadsheet as a convenient, human-editable operational
mirror for people who work in spreadsheets day-to-day — not as a data
source for anything the app itself computes or reports on.

---

*Companion documents: [RECORD_ID_STANDARD.md](RECORD_ID_STANDARD.md) (the sequential ID format written into column B of every worksheet above), [ADMIN_GUIDE.md](ADMIN_GUIDE.md) §16 (the reporting layer built on top of this).*
