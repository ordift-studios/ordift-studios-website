# Release plan — rate card system (editions migration + application). LOCAL ONLY: nothing here is authorized, pushed, deployed or applied.

Branch `pdf-poc` (on top of deployed `ce429d0`). Needs the Founder's separate written authorization for the exact commit.

## What ships
- Application: shared PDF foundation, rate card builder (personal sessions, weddings/events, corporate headshots, commercial/product), QAR conversion review, licensed-activity eligibility, edition server module, admin page `/admin/pricing/rate-card` (Super Admin only), `/dev/*` pages (404 in every production build).
- Migration (proposed `0176_pdf_document_editions`): one table, one guard trigger, one approval function. Additive; existing records untouched. Rollback: `ROLLBACK_0176.sql` (rehearsed).
- NOT shipping / unchanged: quotations, payments, selling-rate tables, Ghana records, legal records, the portfolio library (flag stays off), QAR client publication (`CURRENCY_POLICY.clientPublicationOfConvertedPricesApproved` stays false).

## Pre-release decisions (Founder)
1. Migration number: 0175 is the separate Ghana enhancement (proposal only). Either release 0175 first, or renumber this file (the CLI plan check expects exactly the authorized file).
2. Remove or keep the `/dev/*` pages (they cannot be reached in production either way).
3. Rate card content: families, structure, approved wording, conditions, contact, cover photograph, rounding rule, approver(s).

## Order
1. Written authorization naming the commit and the migration number.
2. Read-only pre-checks: ledger (expect 0174 / 167 versions), selling-rate table fingerprints, Qatar/Ghana records, audit counts; Production = `ce429d0`.
3. Move `PROPOSED_0176_pdf_document_editions.sql` to `supabase/migrations/<number>_pdf_document_editions.sql`; confirm the CLI plan lists exactly that file; apply (gated script, as for 0174); verify table, guard, function, grants (anon/authenticated cannot execute), RLS.
4. Clean build; fast-forward `main`; Vercel Ready; verify deployed commit.
5. Read-only verification: routes (`/admin/pricing/rate-card` redirects when signed out; `/dev/*` 404), data fingerprints unchanged, no edition rows exist.
6. Nothing is approved or published by the release. First edition: Founder builds a draft, reviews, approves — separately.

## Verification already done locally
Unit 5,180 pass; real-schema editions suite (7), expense (13) and permit (7) suites pass on scratch databases built with 0176; clean production build; rollback + re-apply rehearsed; stress PDFs audited (fonts, size, watermark, images).
