# Ordift Studios — Platform Master Architecture

**Status:** Living document, created 2026-08-06 as part of the Payment/Finance Architecture Approval Gate (Part 8). Authoritative **high-level connective map only** — every subsystem below is described at the level needed to see how it fits with the others; implementation detail lives in the specialized document each section names, and that document remains authoritative for its own domain. Update this document when a new subsystem is added or a connection between existing subsystems changes — not on every implementation detail change within a subsystem (that belongs in the specialized doc).

**Relationship to existing documents:** `DOCUMENTATION_INDEX.md` remains the authoritative full document map (every doc, its purpose, when to update it) — this document doesn't replace it. `ARCHITECTURE.md` remains the authoritative historical decision-audit record (why auth/database/CMS decisions were made, reviewed against forward-looking scale dimensions) — this document doesn't re-litigate those decisions, it assumes them as settled and shows how the resulting pieces connect today. Where this document and a specialized document appear to overlap, **the specialized document is always authoritative** — this one is a map, not a source of truth.

---

## 1. The platform in one diagram

```
                                    ┌─────────────────┐
                                    │   Sanity CMS     │  content source
                                    │ (staging+prod    │  (see CMS_MIGRATION.md)
                                    │  datasets)        │
                                    └────────┬─────────┘
                                             │ content
                                             ▼
┌──────────────┐   enquiry/booking   ┌──────────────────┐   auth+data   ┌──────────────┐
│ Public Website│ ───────────────────▶│  Next.js App      │◀─────────────▶│  Supabase     │
│ (Home/About/  │                     │  (Vercel-hosted)   │               │ (Postgres+    │
│  Services/    │◀───────────────────│                    │               │  Auth+RLS+    │
│  Portfolio/   │   rendered pages    │  ┌──────────────┐  │               │  Storage+     │
│  Journal/     │                     │  │ Client Portal │  │               │  Realtime)    │
│  Workshops)   │                     │  ├──────────────┤  │               └──────┬───────┘
└──────────────┘                     │  │ Contributor/  │  │                      │
                                      │  │ Staff Portal  │  │                      │ audit
                                      │  ├──────────────┤  │                      ▼
                                      │  │ Admin Platform│  │               ┌──────────────┐
                                      │  └──────────────┘  │               │ activity_log  │
                                      └─────────┬──────────┘               │ (Audit ID     │
                                                 │                          │  Standard)    │
                          ┌──────────────────────┼──────────────────────┐  └──────────────┘
                          ▼                      ▼                      ▼
                   ┌─────────────┐       ┌─────────────┐        ┌─────────────┐
                   │   Resend     │       │   Sentry     │        │  Payments &  │
                   │ (email/      │       │ (error       │        │  Finance     │
                   │  receipts)   │       │  monitoring) │        │  Module      │
                   └─────────────┘       └─────────────┘        └──────┬──────┘
                                                                        │
                                                          ┌─────────────┴─────────────┐
                                                          ▼                           ▼
                                                   ┌─────────────┐            ┌─────────────┐
                                                   │  Paystack    │            │ Qatar        │
                                                   │  (Ghana,     │            │ Gateway      │
                                                   │  Phase 2)    │            │ (Phase 5,    │
                                                   └─────────────┘            │ not selected)│
                                                                               └─────────────┘
```

Supporting, cross-cutting (not in the diagram above because they touch nearly everything): Upstash Redis (rate limiting/idempotency), Cloudflare Turnstile (CAPTCHA), Google Sheets (secondary form-data copy), GitHub (source of truth, deploy trigger).

---

## 2. Subsystem-by-subsystem, with authoritative document

### 2.1 Public Website
**What it is:** every page a visitor reaches without logging in — Home, About, Services/departments, Portfolio (`/work`), Journal (incl. Ordift Pulse), Workshops, legal pages, the free enquiry/booking form (`/book`).
**Authoritative docs:** `ARCHITECTURE.md` (foundational decisions), `MEDIA_ARCHITECTURE.md` (media components), `PULSE_ARCHITECTURE.md` + `STORIES_PULSE_INTEGRATION.md` (Journal/Pulse), `WORKSHOPS_ARCHITECTURE.md`, `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md` (legal pages), `RECORD_ID_STANDARD.md` (every submission's reference number).
**Connects to:** Sanity (content), Vercel (hosting/rendering), Turnstile (form protection), Supabase (primary write for enquiries/registrations), Google Sheets (secondary write).
**Payment module touch point:** none directly — the enquiry form stays free (confirmed, `PAYMENT_UX_SPEC.md` §1). Payment only enters the flow after staff creates a payable booking/registration.

### 2.2 Admin Platform
**What it is:** the internal operations interface (`/admin/*`) — Overview, Enquiries CRM, Bookings, Content hub, Users & Roles, Portfolio management, Flags, Activity, Reports, Settings.
**Authoritative docs:** `ADMIN_GUIDE.md`, `TECHNICAL_DEBT_REGISTER.md` (known gaps), the Audit Identity Standard (documented inline in `activity_log` usage across admin modules, referenced from `PAYMENT_SECURITY_REVIEW.md` §17).
**Connects to:** Supabase (RLS-scoped data), the capability/permission system (§2.14 below), `activity_log`.
**Payment module touch point:** the Bookings module gains the bank-transfer approval queue and (later) a payment ledger view (`PAYMENT_UX_SPEC.md` §9/§14); Settings gains the exchange-rate and bank-account management screens (architecture proposal §10, Phase 1).

### 2.3 Client, Contributor and Staff Portals
**What it is:** role-scoped authenticated areas (`/portal/*`) — Client dashboard/Project Workspace, Workshop Participant, Model, Vendor, Collaborator, Staff.
**Authoritative docs:** `ARCHITECTURE.md` §4.3 (the original auth decision), the Project Workspace milestones in `MILESTONES.md`.
**Connects to:** Supabase Auth (login/session), Supabase RLS (every portal page's data scope).
**Payment module touch point:** the Client Portal's Project Workspace gains a "Payment Due" widget and a Payment History tab (`PAYMENT_UX_SPEC.md` §1/§14) — the primary place a client actually pays.

### 2.4 Sanity CMS
**What it is:** the headless CMS for all public content (two datasets: staging/production).
**Authoritative doc:** `CMS_MIGRATION.md`.
**Connects to:** the Next.js app's `contentRepository` abstraction (swap-source-without-rewrite design).
**Payment module touch point:** **none, by design.** No payment data, banking detail, or transaction record is ever stored in or exposed through Sanity — confirmed explicitly in `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §17 rule 13 and `PAYMENT_SECURITY_REVIEW.md` §4.

### 2.5 Supabase (Database, Auth, Storage, Realtime)
**What it is:** the platform's single relational data store, authentication provider, file storage, and Realtime presence channel. Two separate projects (staging/production).
**Authoritative docs:** `ARCHITECTURE.md` §4.4, `DISASTER_RECOVERY.md` (backup/PITR posture and upgrade triggers), migration files `0001` through `0023` for schema history.
**Connects to:** every authenticated surface in the platform; RLS is the enforcement layer for all of them.
**Payment module touch point:** the primary one — `supabase/migrations/0024_payments_foundation.sql` adds `payments`, `bank_accounts`, `currencies`, `exchange_rates`, `payment_country_config`, all RLS-scoped from creation, all detailed in `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §4.

### 2.6 Portfolio
**What it is:** the case-study/project showcase (`/work`), with a full native admin authoring workflow (upload, review, publish).
**Authoritative docs:** the Portfolio Management System milestones in `MILESTONES.md`, `TECHNICAL_DEBT_REGISTER.md` (TD-029, the contractor workflow gap).
**Connects to:** Sanity (content + media), the workflow engine (`src/lib/workflow/`), `activity_log`.
**Payment module touch point:** none currently — the `PaymentProvider`/polymorphic `entity_type` design means a future "paid portfolio consultation" or similar could attach later without restructuring, but nothing is built.

### 2.7 Bookings and Enquiries
**What it is:** the free-to-submit enquiry/booking intake system, plus its Admin Platform CRM view.
**Authoritative docs:** the original enquiry-system milestones in `MILESTONES.md`, `RECORD_ID_STANDARD.md`, `GOOGLE_SHEETS_INTEGRATION.md`.
**Connects to:** Supabase (primary write), Google Sheets (secondary write), Resend (confirmation emails), Turnstile/rate-limiting/idempotency (shared infra).
**Payment module touch point:** **this is the payment module's primary payable entity.** A confirmed booking is where a deposit/balance/full payment gets initiated (`PAYMENT_UX_SPEC.md` §2) — via the polymorphic `entity_type = 'enquiry'`-or-successor pattern on `payments`, not a change to the enquiry system itself.

### 2.8 Workshops and Academy
**What it is:** the Workshop Platform — content, registration, capacity logic.
**Authoritative doc:** `WORKSHOPS_ARCHITECTURE.md`.
**Connects to:** Sanity (workshop content), Supabase (registrations), Resend.
**Payment module touch point:** the second payable entity type (`entity_type = 'workshop_registration'`), same polymorphic attachment as Bookings.

### 2.9 Payments and Finance
**What it is:** the module this Architecture Approval Gate covers — gateway-agnostic payment processing (Paystack now, Qatar later), manual bank transfer, the USD-reference/local-settlement currency model, refunds, receipts, and a schema reserved for future finance features.
**Authoritative docs (this is the payment module's own document set, and each stays authoritative for its slice):**
- `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` — architecture, schema, phased plan, business/currency boundary confirmations
- `PAYMENT_COST_REGISTER.md` — payment-specific cost detail (defers to `TECHNOLOGY_COST_REGISTER.md` for every non-payment service figure)
- `PAYMENT_SECURITY_REVIEW.md` — security controls
- `PAYMENT_UX_SPEC.md` — user/admin experience
- `PAYMENT_TEST_PLAN.md` — test coverage
- `supabase/migrations/0024_payments_foundation.sql` — the schema itself (draft, not applied)
**Status as of this document:** architecture approved in principle; Architecture Approval Gate under your review; no accounts created, no migration applied, no code written beyond the draft migration.
**Connects to:** Bookings, Workshops (as payable entities), Supabase (schema + RLS), Resend (receipts), Sentry (webhook error monitoring), the Admin Platform (bank-transfer approval, bank-account/exchange-rate management).

### 2.10 Notifications and Resend
**What it is:** all transactional email — form confirmations, admin notifications, password reset, (future) payment receipts.
**Authoritative docs:** `GOOGLE_SHEETS_INTEGRATION.md` (the dual-write context), `PRODUCTION_HARDENING_REPORT.md` (retry/dead-letter design).
**Connects to:** every form-submission and (future) payment-completion path.
**Payment module touch point:** receipt emails and bank-transfer status notifications reuse this pipeline directly — no new email service (`PAYMENT_COST_REGISTER.md` §2).

### 2.11 Vercel Deployment
**What it is:** hosting, serverless functions (every `/api/*` route, including future payment webhooks), the production domain, CI-triggered deploys.
**Authoritative docs:** `DEPLOYMENT.md`, `TECHNOLOGY_COST_REGISTER.md` §1.
**Connects to:** GitHub (deploy trigger), every server-side code path in the app.
**Payment module touch point:** webhook endpoints are new Vercel serverless functions; no new hosting concern beyond that.

### 2.12 Sentry Monitoring
**What it is:** production error monitoring (Workstream C) — code written, **not yet activated** (pending your DSN).
**Authoritative docs:** `TECHNOLOGY_COST_REGISTER.md` §9 (cost), this document (connective role).
**Connects to:** `src/instrumentation.ts`/`src/instrumentation-client.ts`, `src/app/error.tsx`, and (once built) every payment webhook handler.
**Payment module touch point:** payment webhook failures are the practical reason to activate Sentry promptly — see `PAYMENT_COST_REGISTER.md` Part 1 §9–14 and `PAYMENT_SECURITY_REVIEW.md` §19.

### 2.13 Storage
**What it is:** Supabase Storage — currently used for Portfolio media; will be used for payment proof-of-payment uploads.
**Authoritative doc:** none dedicated yet — covered inline in `DISASTER_RECOVERY.md` (backup posture) and, for payments specifically, `PAYMENT_SECURITY_REVIEW.md` §13–14 (private storage, signed-URL access).
**Connects to:** the Admin Platform's upload routes, RLS-gated buckets.

### 2.14 Audit Logging
**What it is:** the `activity_log` table and the platform-wide **Audit Identity Standard** — every audited action resolves the actor via `profiles.member_number`, never a raw name.
**Authoritative doc:** documented as a platform-wide architectural rule (referenced from `TECHNICAL_DEBT_REGISTER.md` and this project's memory record `project_ordift_audit_identity_standard`).
**Connects to:** Portfolio, Admin Platform actions generally, and (per `PAYMENT_SECURITY_REVIEW.md` §17) every payment-lifecycle transition.

### 2.15 Security and Permissions
**What it is:** Supabase RLS (data-layer enforcement) + the `WorkflowCapabilityMatrix` pattern (`src/lib/workflow/engine.ts`, first proven for Portfolio via `PORTFOLIO_CAPABILITIES`) for granular, role-based action gating.
**Authoritative docs:** `PHASE_4_PRODUCTION_AUDIT_REPORT.md` (security audit history), `PAYMENT_SECURITY_REVIEW.md` (payment-specific application of the same pattern via a new `PAYMENT_CAPABILITIES` matrix).
**Connects to:** every module above.

### 2.16 Analytics
**What it is:** Google Analytics — scaffolded (`NEXT_PUBLIC_GA_MEASUREMENT_ID` env var exists) but **not built**, pending a decision + Cookie Notice approval.
**Authoritative doc:** `TECHNOLOGY_COST_REGISTER.md` (Future Planned Integrations table), `PRODUCT_ROADMAP.md`.
**Payment module touch point:** none identified — a future decision could add payment-funnel conversion tracking, but that's not proposed here.

### 2.17 Future Modules
**What's reserved, not built:** invoices, quotations, discounts/promo codes, gift cards, subscriptions/memberships, installment plans, tax/VAT, financial reporting, vendor payouts, affiliate commissions, client statements, credit notes — all detailed with their specific attachment mechanism in `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §18. Also reserved, unrelated to payments: Talent Management, full Academy/CRM expansion, mobile app, broader API integrations — tracked in `PRODUCT_ROADMAP.md`, not re-listed here.

---

## 3. Cost — which document is authoritative

Corrected during this same review cycle (see `PAYMENT_COST_REGISTER.md`'s own header note): **`TECHNOLOGY_COST_REGISTER.md` is the single, platform-wide living cost register** — every service, whether payment-related or not, has its confirmed current pricing there, updated whenever a new service is actually introduced. `PAYMENT_COST_REGISTER.md` is a companion, scoped narrowly to payment-gateway fee detail and volume-scenario modeling too specialized to inline into the general register — it never re-prices a non-gateway service independently.

---

## 4. Documentation map — where this fits

`DOCUMENTATION_INDEX.md` is and remains the complete, authoritative list of every project document and when to update each one. This document is a new entry in that index (added alongside this update — see `DOCUMENTATION_INDEX.md`), not a replacement for it. If a future subsystem is added to the platform, the update sequence is: build it, document its own detail in a specialized doc, add that doc to `DOCUMENTATION_INDEX.md`, and add a short connective entry here — in that order, so this document never becomes the first or only place a decision is recorded.
