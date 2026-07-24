# Ordift Studios — Architecture Audit & Standing Decisions

Status: **living document**. This is the audit requested before building the
Workshop Platform, Portfolio, Journal, and everything beyond — reviewed
against 15 forward-looking scale dimensions, plus the standing
architectural decisions that come out of it. Every future major system
(Portfolio, Academy, CRM, Client Portal, Talent, Commerce) should be
checked against this document before it's built, and this document should
be updated whenever a decision here changes.

**Ground rule for this document, and for the project generally:** build
the foundation that today's actual scale needs, plus the cheap seams that
make tomorrow's scale a swap-in rather than a rewrite. Do **not** build
infrastructure for load, team size, or feature surface that doesn't exist
yet — that's a different kind of rebuild risk (complexity you maintain for
years before it earns its keep). Every recommendation below is labeled
**Do now**, **Seam only (defer the real thing)**, or **Explicit trigger —
do not build until then**.

---

## 1. Current architecture, as of this audit (2026-07-23)

- **Framework:** Next.js 16.2.11 (App Router), TypeScript, Tailwind CSS v4, Node.js Active LTS.
- **Content:** every page (Home, About, Services/departments, legal) is hand-authored JSX. No CMS is connected yet — Sanity was scoped in the original plan (Plan Part F) but the project/dataset doesn't exist yet.
- **Workshops:** content lives in one hardcoded array (`src/lib/workshops/data.ts`), read through `getAllWorkshops()`/`getWorkshopBySlug()`. Deliberately built as a thin data-access seam so swapping the source for a real CMS/DB later touches zero page components.
- **Forms/data:** two independent write paths — Enquiries and Workshop Registrations — each with its own schema, API route, storage adapter, and Google Sheet tab. Staging writes to local gitignored `.jsonl` files; production writes to Google Sheets via a JWT service account. No relational database exists anywhere in the stack.
- **Shared infrastructure:** rate limiting, idempotency, and the staging/legal-gate logic were duplicated in spirit between the two systems from day one and have now been consolidated into `src/lib/shared/` (this audit — see §3) so a third system (Portfolio contact forms, Academy enrollment, CRM webhooks) has one obvious place to import from instead of reaching into another module's internals.
- **Auth:** none. There is no login, no session, no user table, no role concept anywhere in the codebase. The only "admin interface" today is the Google Sheet itself (and Sanity's own login, once connected, for content).
- **File/object storage:** none. No upload handling exists. Portfolio galleries, workshop photos, and future certificates will all need this and don't have it yet.
- **Email:** Resend, server-side only, HTML templates with email-safe font stacks. Two independent template sets (Enquiry, Workshop) by design (documented reasoning in `WORKSHOPS_ARCHITECTURE.md`) — they're allowed to diverge without cross-editing risk.
- **Deployment target:** Vercel-style serverless (assumed from the plan; not yet actually deployed). In-memory rate limiting/idempotency are explicitly documented as **not** safe across multiple serverless instances.

---

## 2. Audit against the requested scale dimensions

| Dimension | Today | Ceiling | Verdict |
|---|---|---|---|
| Multiple countries | Free-text `country` field on every form; no locale routing, no currency, no translated content | Fine indefinitely for "we serve clients in multiple countries." Breaks down only if Ordift needs the *site itself* in another language, or region-specific pricing/legal pages | **No action now** — see §4.1 |
| Multiple departments | 7 hand-coded page files (`src/app/services/*`) | Comfortable up to maybe 10–15 hardcoded pages before editing becomes a developer bottleneck instead of an admin one | **Seam exists, not connected** — see §4.2 |
| Multiple administrators | ✅ Six-role system (Supabase Auth + RLS) — see §4.3 | Scales to as many staff/admin accounts as needed, each independently scoped | **Resolved, V1.3** — see §4.3 |
| Thousands of clients / enquiries | ✅ Supabase Postgres (dual-written alongside Sheets) — see §4.4 | Relational querying, RLS-scoped reads, no Sheets API rate-limit ceiling | **Resolved, V1.3** — see §4.4 |
| Hundreds of workshops | Hardcoded array of 1 | Same seam as departments — `getAllWorkshops()` already reads as if it were a query | **Seam exists, not connected** — see §4.2 |
| Future employee accounts | ✅ `staff`/`admin` roles exist and are grantable via `/portal/admin` | Scales with the six-role system above | **Resolved, V1.3** — same as §4.3 |
| Talent management, Client dashboards, Academy, CRM, e-commerce, mobile app, API integrations, AI features, cloud storage | Client dashboards ✅ live (V1.3); the rest remain future V2.0+/V3.0+ modules per the roadmap (`MILESTONES.md`) | Auth + database prerequisites are now both satisfied — each remaining module is its own scoping decision, not blocked on infrastructure anymore | **Prerequisites resolved (§4.3, §4.4)** — each module still needs its own scope decision before building |

The headline finding: **almost every item on the requested scale list reduces to the same two unmade decisions** — when to introduce authentication, and when to introduce a relational database. Everything else (departments, workshops, content) already has a seam designed for the swap. That's a good sign — it means the foundation doesn't need fifteen different fixes, it needs two decisions made deliberately, at the right time, not preemptively.

---

## 3. Implemented now (this audit)

Low-risk, cheap-today, expensive-later changes made as part of this audit:

1. **Relocated shared infrastructure out of the `enquiry` module.** `rateLimit.ts`, `idempotency.ts`, and `env.ts` moved from `src/lib/enquiry/` to `src/lib/shared/`. Workshops was already importing these from inside "enquiry" — backwards naming that gets worse, not better, every time a new module (Portfolio, Academy, CRM) also needs rate limiting. Fixing it now touched 7 call sites; leaving it would mean untangling it later across a dozen. All imports updated, `tsc --noEmit` and `eslint` both clean, both API routes smoke-tested afterward (422 on empty body, same as before the move).
2. **This document and `MILESTONES.md`**, so architectural reasoning and roadmap status live in the repo, not only in conversation history — per the standing instruction to document every major decision for future developers.

No other code changes were made in this pass. Everything below is analysis and decision points, not yet implemented.

---

## 4. Decision points

### 4.1 Internationalization — no action now

Forms already capture country as free text, which is sufficient for "we have clients in multiple countries." Real i18n infrastructure (locale-prefixed routing, translated content, currency formatting) is expensive to retrofit *and* expensive to carry if it turns out to be unnecessary. **Trigger to revisit:** the day Ordift confirms the site itself needs to render in a second language, or a second country needs distinct pricing/legal pages — not before.

### 4.2 CMS connection (Sanity) — do next, tied to Portfolio/Workshop Platform build

This is the one piece of groundwork worth doing **before**, not after, the Workshop Platform and Portfolio expansion, because both of those features are explicitly requested to include content an admin should be able to edit without a code deploy (instructor profiles, workshop galleries, case-study content, journal posts). Building them as hardcoded JSX now and migrating to Sanity later means rewriting every one of those pages twice. Building them against Sanity from the start costs the same effort now and saves a rewrite.

**Recommendation:** connect the Sanity project (once you've created it under Ordift's ownership, per the standing ownership rule) as the very first step of the Workshop Platform build, and model `workshop`, `instructor`, `portfolioProject`, and `journalPost` as real schemas from day one. `getAllWorkshops()`/`getWorkshopBySlug()` already read like queries, so this is a source swap, not a rewrite, in the workshop case specifically.

### 4.3 Authentication & administrators — ✅ RESOLVED (V1.3, 2026-07-24)

*Original reasoning (2026-07-23), kept for historical record:* nothing here should be built until you decide it, because it's genuinely hard to reverse (the choice of provider shapes every future dashboard, and per your ownership rule it has to be an Ordift-owned account from day one, not mine). What's true then: zero auth existed, and nothing needed it yet — the Sheet-as-admin-interface worked fine for one founder reviewing enquiries by hand. The trigger was the first feature that structurally required scoped access — the Client Portal — and it fired.

**Decision made and implemented:** Supabase Auth, not Auth.js/Clerk as originally speculated — chosen because it pairs with Postgres in the same platform (see §4.4, same trigger, same decision), avoiding a second vendor relationship for what's really one need. Six roles (`client`, `workshop_participant`, `model`, `vendor`, `staff`, `admin`), Row Level Security from day one, project created and owned by Ordift Studios. Live, fully verified end-to-end (see `MILESTONES.md` V1.3). Not yet done: a second, separate Supabase project for production (Production Readiness & Launch Preparation phase — see `DEPLOYMENT.md`).

### 4.4 Real database — ✅ RESOLVED (V1.3, 2026-07-24)

*Original reasoning (2026-07-23), kept for historical record:* Google Sheets was a genuinely reasonable choice for where the project was then (low volume, one administrator, human-readable, zero infrastructure cost). It was expected to stop being reasonable once enquiry/registration volume climbed, cross-system querying was needed, or a dashboard needed to read the data programmatically — the Client Portal is exactly that dashboard, so this trigger fired at the same moment as §4.3, for the same reason.

**Decision made and implemented:** Supabase (managed Postgres), not Neon as originally speculated — again, bundling with Auth in one platform rather than running two vendors for two halves of the same need. Google Sheets was **not replaced** — per the original recommendation, it stays the system of record for admin-facing editing (status, payments, internal notes), while Supabase is a dual-written, RLS-scoped read layer purpose-built for the Client Portal. The CRM `crm_stage` enum from the original brief (New Lead → ... → Referral) is implemented exactly as recommended here, as a real Postgres enum column, not a manually-typed cell — see `enquiries.crm_stage` in `supabase/migrations/0001_init.sql`.

### 4.5 File/object storage — seam only, build when Portfolio needs it

No decision needed today because nothing uploads a file yet. When the Portfolio case-study galleries are built (next major module after the Workshop Platform), that's the natural point to introduce a storage provider — Cloudflare R2 or S3-compatible storage, using signed URLs so images aren't served through the Next.js server, is the standard choice and works identically for portfolio galleries, workshop photos, and (later) client-portal downloads and certificates. Building this in isolation now, before there's a real gallery to hang it on, would be guessing at requirements.

### 4.6 API surface — no action now

Two route handlers (`/api/enquiry`, `/api/workshop-registration`) is not enough surface area to need versioning, a shared API framework, or a different pattern than "one route handler per form." Revisit only once a real third-party integration (mobile app, external CRM sync) needs a stable, versioned contract — premature `/api/v1/...` namespacing today would be speculative.

---

## 5. What this means for the next build (Workshop Platform)

The Workshop Platform expansion (instructor profiles, categories, galleries, FAQs, certificates, related workshops, etc.) can proceed **without** waiting on the auth or database decisions in §4.3/§4.4 — none of those new fields need a login system or relational queries to exist. It **should** be built against Sanity schemas from the start (§4.2) rather than hardcoded, since editable content is explicitly part of what's being asked for (instructor bios, galleries, FAQs are exactly the kind of content an admin should be able to update without a deploy). The registration system itself (capacity, waitlist, manual payment, Sheets, emails) stays exactly as built and verified — it doesn't need to change to support richer workshop *content*.

---

## 6. Non-goals (explicitly, so they don't get built by accident later)

- ~~No database until §4.4's trigger.~~ **Resolved V1.3** — Supabase Postgres is live.
- ~~No auth/login system until §4.3's trigger.~~ **Resolved V1.3** — Supabase Auth is live.
- No i18n/locale routing until §4.1's trigger.
- No object storage until Portfolio needs it.
- No API versioning until an external integration needs it.
- No microservices / separate backend service — Next.js API routes remain sufficient for the foreseeable feature set; splitting out a separate backend would add operational complexity with no current benefit.
