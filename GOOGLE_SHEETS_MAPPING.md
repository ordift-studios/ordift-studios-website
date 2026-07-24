# Google Sheet Field Mapping — Contact/Book Enquiry System

Status: **not yet connected**. This documents the column layout the
production integration (`src/lib/enquiry/storage.ts`, `saveToGoogleSheets`)
writes to once `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
and `GOOGLE_SHEETS_SPREADSHEET_ID` are set and `LEGAL_PAGES_APPROVED=true`
in production (see `.env.example` and `src/lib/shared/env.ts`).

Until then, every submission (in staging, and in production before legal
approval) goes to a local test log instead —
`.data/staging-enquiries.jsonl`, gitignored, never mixed with the real
Sheet, and never committed to the repository.

## Sheet setup required (once you own the Google Cloud project — Plan Part I)

1. Create a Google Sheet named e.g. **"Ordift Studios — Enquiries"**, owned
   by an Ordift Studios Google account (not a personal one).
2. Add a tab named exactly **`Enquiries`** (the code writes to
   `Enquiries!A:X` — rename the tab or update the range in
   `storage.ts` if you'd prefer a different name).
3. Add the header row below (row 1) so the columns are self-explanatory
   to anyone opening the sheet directly.
4. Share the Sheet with the service account's email address (from your
   Google Cloud service account JSON) as an **Editor** — the API can't
   write without this, and per Plan Part I, no one else should have a
   standing share beyond named Ordift Studios administrators (no public
   or "anyone with the link" sharing).
5. Set up a **second, separate Sheet (or a second tab)** for staging test
   submissions if you ever want staging to write to a real Sheet instead
   of the local test log — not required for now, since the local test log
   already satisfies the "separate test workflow" requirement.
6. Add a second tab named **`Workshop Registrations`** — see
   `WORKSHOPS_ARCHITECTURE.md` for that mapping; it's a structurally
   separate dataset from Enquiries, not a variant of it.

## Column mapping

**A–P — visitor-submitted fields** (written at submission time, same as
before):

| Col | Header | Source field | Notes |
|---|---|---|---|
| A | Reference Number | `referenceNumber` | e.g. `ORD-20260723-0042` |
| B | Submitted At (UTC) | `submittedAt` | ISO 8601 timestamp |
| C | Environment | `environment` | Always `production` in the real Sheet — staging never reaches here |
| D | Service | `service` | Pathway value (e.g. `photography`, `partnership`) |
| E | Full Name | `fullName` | Required |
| F | Company / Brand | `companyName` | Optional, blank if not given |
| G | Email | `email` | Required |
| H | Phone / WhatsApp | `phone` | Required |
| I | Country / Location | `country` | Optional |
| J | Project Type | `projectType` | Optional |
| K | Project Location | `projectLocation` | Optional |
| L | Timeframe | `timeframe` | Free text — no assumed date format |
| M | Budget Range | `budgetRange` | One of the configured ranges in `src/lib/enquiry/budgetRanges.ts` (no currency/amounts shown publicly yet — pending pricing approval) |
| N | Description | `description` | Required, free text |
| O | Reference Link | `referenceLink` | Optional URL, validated client- and server-side |
| P | Heard About Us | `hearAboutUs` | Optional |

**Q–X — internal management block** (approved 2026-07-23). The public
form never asks for these directly — four are auto-populated by the
system at submission time, four are left blank for an administrator to
fill in later, directly in the Sheet:

| Col | Header | Populated by | Notes |
|---|---|---|---|
| Q | Enquiry Status | System (default) | Auto-set to `New` on insert. Suggested values as the enquiry progresses: `New`, `Contacted`, `Discovery Scheduled`, `Quoted`, `Confirmed`, `Declined`, `Closed` — an administrator updates this manually in the Sheet |
| R | Assigned To | Administrator | Blank on insert |
| S | Follow-Up Date | Administrator | Blank on insert |
| T | Last Contacted | Administrator | Blank on insert |
| U | Internal Notes | Administrator | Blank on insert |
| V | Consent Timestamp | System (auto) | Same as Submitted At — required consent is captured at the moment of submission, not separately |
| W | Source Page | System (auto) | `document.referrer` when the visitor opened `/book` (or the current path if there's no referrer) — shows which page/CTA sent them |
| X | Marketing Consent | Visitor (optional checkbox) | `Yes`/`No` — a separate, optional, unchecked-by-default checkbox distinct from the required consent in column V. Submitting an enquiry never implies marketing opt-in |

**Deliberately not a column:** any uploaded file (this phase accepts
reference *links*, not direct uploads — column O is the only place a URL
appears), and the visitor's **raw IP address**. The rate limiter uses IP
in memory only, transiently, to throttle abuse — it's never written to
the Sheet, the test log, or any persistent record. If IP logging is ever
needed for security/abuse investigation, that requires its own disclosure
in the approved Privacy Notice first, not a silent addition here.

## Access control

Once real, this Sheet should be restricted to Ordift Studios
administrators only (Editor access via the service account for writes,
human accounts added individually as Viewer/Editor as needed — no shared
public link). Retention policy (how long enquiry data is kept, and
whether/when it's deleted) is a decision for the approved Privacy Notice,
not something assumed here.
