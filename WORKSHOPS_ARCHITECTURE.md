# Workshop Platform — Architecture

Status: **content served from a local CMS-agnostic repository; not yet
connected to Sanity or a real Google Sheet.** This documents the Workshop
Platform's content model, the `ContentRepository` abstraction it's built
against, the registration flow, capacity/waitlist logic, and Sheet
mapping, so it can be reviewed before Portfolio and Journal are started.

**Two things changed since the original registration-only build (both
approved 2026-07-23):**
1. The Workshop Platform expanded from a single registration page into a
   full platform — categories, instructors, venues, galleries, agendas,
   FAQs, certificates, testimonials, sponsors, related workshops,
   countdown timers, upcoming/past sections. All content types now live
   in a CMS-agnostic domain model (`src/lib/content/`), not a
   workshop-specific file — see "Content architecture" below and
   `CMS_MIGRATION.md`.
2. A real bug in the waitlist-position formula was found and fixed during
   verification: positions were being recomputed from the registered
   count, so every waitlisted registrant after the first also got
   position 1. It now increments correctly (see "Capacity and waitlist
   logic").

**Core principle (approved 2026-07-23):** Workshop Registrations is a
**structurally separate system from the Contact/Book Enquiry system** —
separate content model, separate schema, separate API route, separate
storage adapter, separate Sheet tab, separate test log. Nothing here reads
from or writes to `src/lib/enquiry/*` or the `Enquiries` tab. This isn't
just naming discipline: it means a future change to enquiry pricing,
consent wording, or storage never has to be checked against workshops, and
vice versa.

## Content architecture

All Workshop Platform content (workshops, instructors, categories,
venues, testimonials, sponsors) is read through `ContentRepository` —
a CMS-agnostic interface defined in `src/lib/content/repository.ts` — not
through a workshop-specific file, and not through any Sanity-specific
code. Every page and API route imports a single `contentRepository`
constant from `src/lib/content/index.ts`; today that constant points at
`localContentRepository` (sample data), and connecting a real CMS later
is a one-line change in that file. Full reasoning, the domain types, and
the exact migration recipe are in **`CMS_MIGRATION.md`** — read that
alongside this document; it isn't duplicated here.

The domain type (`src/lib/content/types.ts`) is the shape a future CMS
schema should be modeled *to match*:

```ts
type WorkshopStatus = "coming-soon" | "open" | "full" | "closed" | "completed";
type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "all-levels";
type WorkshopFormat = "in-person" | "online" | "hybrid";

type Workshop = {
  id: string; slug: string; title: string; shortDescription: string; description: string;
  status: WorkshopStatus;
  categoryIds: string[]; instructorIds: string[]; venueId: string | null;
  capacity: number;
  startDate: string | null; endDate: string | null; // endDate supports multi-day workshops
  registrationDeadline: string | null;
  experienceLevels: ExperienceLevel[];
  requiresPayment: boolean;           // no price shown publicly — pending pricing approval
  learningOutcomes: string[];
  agenda: AgendaItem[];
  gallery: GalleryImage[];
  faqs: FAQ[];
  certificate: { offered: boolean; description: string | null };
  testimonialIds: string[]; sponsorIds: string[]; relatedWorkshopIds: string[];
  isRecurring: boolean; recurrenceNote: string | null; // free text, not a structured rule — see CMS_MIGRATION.md
  isOnlineAttendancePossible: boolean; hasRecordedSession: boolean; isMembersOnly: boolean;
};
```

`Instructor`, `Category`, `Venue`, `Testimonial`, and `Sponsor` are
separate top-level types, referenced by ID from `Workshop` — see
`src/lib/content/types.ts` for the full shape of each.

Until a real CMS is connected, `src/lib/content/local/data.ts` is the
only content source, and it holds **four clearly-labeled sample
workshops** (plus sample instructors, categories, venues, testimonials,
and a sponsor) chosen to demonstrate every status and content feature:

| Workshop | Status | Demonstrates |
|---|---|---|
| `[SAMPLE] Portrait Lighting Fundamentals` | `open` | The original registration/waitlist demo — capacity 3, in-person, single instructor, agenda, FAQs, certificate |
| `[SAMPLE] Social Media Content — Two-Day Intensive` | `open` | Multi-day (`startDate`≠`endDate`), online venue, two instructors, no payment required, recurring, has a sponsor |
| `[SAMPLE] Brand Storytelling Masterclass` | `completed` | Populates "Past Workshops," has placeholder testimonials and a certificate |
| `[SAMPLE] Introduction to Drone Cinematography` | `coming-soon` | Members-only flag, no registration form shown |

Per the empty-state and zero-invention rules, **none of this reaches
production as-is** — it must be replaced with real, approved content (via
this same file, or by connecting a real CMS per `CMS_MIGRATION.md`)
before launch.

### Status meanings and what each allows

| Status | Registration form shown? | Notes |
|---|---|---|
| `coming-soon` | No | Workshop is announced but not yet open |
| `open` | Yes | Accepts registrations; capacity/waitlist logic applies automatically |
| `full` | No | Manual admin override to stop *all* new registrations, including the waitlist — distinct from capacity being reached under `open` |
| `closed` | No | Registration period has ended (e.g. past the deadline) |
| `completed` | No | Workshop has already taken place |

Only `open` accepts submissions — enforced server-side (the API 409s any
other status), not just hidden in the UI, so a stale cached page or direct
API call can't bypass it.

## Pages

1. **Hub page** (`/workshops`, `src/app/workshops/page.tsx`) — hero,
   category filter chips (`?category=<slug>`, server-rendered via
   `Link`s, no client JS needed), an **Upcoming Workshops** section
   (everything not `completed`) and, when at least one exists, a **Past
   Workshops** section (`status === "completed"`). Each workshop renders
   as a `WorkshopCard` (`src/components/workshops/WorkshopCard.tsx`)
   showing status badge, in-person/online/hybrid badge, members-only
   badge, date range, and category names. If no workshops exist (or a
   category filter matches none), shows a plain message rather than
   hiding the page.
2. **Detail page** (`/workshops/[slug]`, `src/app/workshops/[slug]/page.tsx`)
   — hero with status/format/multi-day/recurring/members-only badges; a
   countdown timer to the registration deadline (`CountdownTimer.tsx`,
   client component, only shown when `status === "open"` and a deadline
   exists); date/venue/deadline/experience-level facts; category links
   back to the filtered hub; learning outcomes; agenda; instructor cards
   linking to their profile; image gallery grid; certificate info; an FAQ
   accordion (`FAQAccordion.tsx`, client component); testimonials
   (`TestimonialCard.tsx`, visibly labeled when `isPlaceholder`); the
   manual-payment note if `requiresPayment`; the registration form or a
   status-specific message; and a Related Workshops section
   (`relatedWorkshopIds`).
3. **Instructor profile page** (`/workshops/instructors/[slug]`,
   `src/app/workshops/instructors/[slug]/page.tsx`) — bio, credentials,
   and every workshop that instructor teaches (queried by
   `instructorIds.includes(instructor.id)`, not stored redundantly on the
   instructor record).

## Registration flow

1. **Registration form** (`RegistrationForm.tsx`, client component) —
   name, email, phone, optional country, optional experience level,
   required consent checkbox linked to the Privacy Notice, honeypot field.
   Generates an `idempotencyKey` via `crypto.randomUUID()` on mount so an
   accidental double-submit (e.g. double-click, retry after a slow
   network) can't create two registrations.
2. **API route** (`POST /api/workshop-registration`,
   `src/app/api/workshop-registration/route.ts`):
   - Rate limit (reuses `src/lib/shared/rateLimit.ts` — same in-memory
     sliding-window implementation, keyed separately with a `workshop:`
     prefix so enquiry and workshop traffic don't share a bucket).
   - Parse + validate against `workshopRegistrationSchema`.
   - Honeypot check.
   - Idempotency check (reuses `src/lib/shared/idempotency.ts` — same
     cache, same 30-minute TTL).
   - Look up the workshop by slug via `contentRepository.getWorkshopBySlug()`
     — 404 if it doesn't exist, 409 if its status isn't `open`.
   - Count current `Registered` **and** `Waitlisted` entries for that
     workshop (`countRegisteredForWorkshop`, `countWaitlistedForWorkshop`)
     and decide `Registered` vs `Waitlisted` against `capacity`
     (`decideRegistrationStatus`).
   - Save the record (test log in staging, Google Sheets in production —
     same `productionSendingEnabled()` gate as enquiries).
   - Store the idempotency result.
   - Send acknowledgement + admin emails (branded, different copy for
     Registered vs Waitlisted).
   - Return `{ ok, registrationReference, registrationStatus, waitingListPosition }`.

## Capacity and waitlist logic

`decideRegistrationStatus(workshop, currentRegisteredCount, currentWaitlistedCount)`:
- `currentRegisteredCount < capacity` → **Registered**.
- Otherwise → **Waitlisted**, with `waitingListPosition = currentWaitlistedCount + 1`.

This is **automatic** — no admin action is needed for a registrant to be
correctly placed on the waitlist once capacity is reached.

**Bug found and fixed during verification (2026-07-23):** the position
formula originally read `currentRegisteredCount - capacity + 1`. Once a
workshop is full, `currentRegisteredCount` stays constant at `capacity`
for every subsequent registrant, so that formula gave **every** waitlisted
person position 1 instead of 1, 2, 3… A second counter,
`countWaitlistedForWorkshop`, was added specifically so the position is
based on how many people are already waiting, not on the (by-then-static)
registered count. Verified live: with the sample workshop already at
capacity (3 Registered) and 2 people already Waitlisted (from testing
before the fix), a new test registration correctly returned position 3
— confirming the count is now based on the waitlist, not the stale
registered count.

**Known limitation (documented, not silently assumed safe):** the
count-then-write is not atomic. On a single dev/staging instance this is
correct; under genuinely high concurrent demand at the exact moment
capacity is reached, two near-simultaneous registrations could both read
"space available" before either is written, both landing as Registered
instead of one being waitlisted. The same caveat already applies to the
in-memory rate limiter and idempotency cache — all three need a shared,
atomic store (e.g. Redis, or a database transaction) before a real launch
expects meaningful concurrent traffic. Flagged here rather than fixed
speculatively, since the actual fix depends on which backing store gets
chosen for production infrastructure generally.

## Payment (manual-only, approved 2026-07-23)

**No online payment collection exists.** `requiresPayment` on a workshop
only controls whether a registrant's `paymentStatus` starts at `Pending`
(→ an administrator confirms payment by hand and updates the Sheet) or
`Not Required`. No price is ever shown publicly — this mirrors the
enquiry form's budget-range gate (no currency amounts until pricing is
approved). Adding real online payment later means:
1. Choosing and approving a payment provider.
2. Approved legal terms covering payment, refunds, and cancellation.
3. A new, explicit build step — not an assumed extension of this system.

## Storage

Supabase is the primary, required record (2026-07-27 — see
`GOOGLE_SHEETS_INTEGRATION.md` §1); Google Sheets is a best-effort
secondary copy. `src/lib/workshops/registrationStorage.ts` owns both the
Supabase-backed capacity/waitlist counts and the Sheets sync:

- **Staging** (or production before `FORMS_SENDING_ENABLED=true`): the
  Sheets sync appends to `.data/staging-workshop-registrations.jsonl` —
  gitignored, never committed, structurally separate file from
  `.data/staging-enquiries.jsonl`. This is a secondary audit trail only;
  the authoritative staging record is Supabase.
- **Production**: the Sheets sync appends a row to the `Workshop
  Registrations` tab of the "Ordift Studios Operations" spreadsheet.

The full, current column mapping (A–T) and the record ID format now
written into column B (`WSH-2026-000042`, replacing the old
`WKS-YYYYMMDD-XXXX` format for new registrations) live in
`GOOGLE_SHEETS_INTEGRATION.md` §3 and `RECORD_ID_STANDARD.md` — not
duplicated here, to avoid the two documents drifting out of sync.

## Emails

`src/lib/workshops/registrationEmailTemplates.ts` +
`registrationEmail.ts` — a deliberate local copy of the enquiry system's
email-safe HTML wrapper (Georgia/system-sans font stack, same navy/gold
palette) rather than a shared import, so the two systems' email copy can
evolve independently without cross-editing risk.

- **Acknowledgement email** (to the registrant): different subject/body
  for Registered ("you're in, payment details to follow if applicable")
  vs Waitlisted ("you're on the list at position N").
- **Admin notification email**: full registration details table,
  including status, waitlist position, and payment status, so an
  administrator can act without opening the Sheet.

Same `productionSendingEnabled()` gate as enquiries — in staging, emails
are logged to the console instead of sent (`mode: "logged"`), and a
failed acknowledgement email never blocks the registrant from seeing a
successful registration (the record is already saved by the time email
sending is attempted).

## What's intentionally out of scope for this build

- Online payment collection (see Payment section above).
- Connecting a real CMS (no `workshop`/`instructor`/etc. document types
  exist in Sanity yet, since no Sanity project is connected — Plan Part F
  / `ARCHITECTURE.md` §4.2). The domain model and repository interface
  are ready for this; see `CMS_MIGRATION.md`.
- Structured recurrence rules (`isRecurring`/`recurrenceNote` is a
  boolean + free text today, not an RRULE — see `CMS_MIGRATION.md` for
  why).
- Live webinars / virtual-attendance session tooling — `isOnlineAttendancePossible`
  and `hasRecordedSession` exist on the domain model as flags an admin
  can set, but no actual video/streaming integration exists yet.
- Uploaded gallery images — `GalleryImage.url` is a plain string field;
  no upload handling or object storage exists yet (see `ARCHITECTURE.md`
  §4.5, tied to the Portfolio build).
- Editing or cancelling a registration after submission (would need a
  lookup-by-reference flow, not built yet).
- Automatic waitlist promotion emails when a Registered attendee cancels
  (cancellation itself isn't built yet — today, an administrator would
  need to notice a cancellation and manually contact the next person on
  the waitlist from the Sheet).
