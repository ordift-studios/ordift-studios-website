# Deployment Request 4 — Organisation registry and supplier-approval confirmation, v1 (for review; nothing deployed)

Branch `supplier-approval-v1`, based on `main` = `f8a6108`. One additive migration (`0163`), **not applied anywhere**. Preparation and local testing only.

## 1. What it does

Supplier application recorded → approval email **pasted by a person** → matched to the application and to the organisation directory → an administrator **confirms** → the organisation's **client** relationship is created or moved to approved.

* No mailbox connection, no monitoring, no outbound email, no automation. An email exists in the system only because someone pasted it.
* An email never changes a record by itself. Only `confirmApproval()` does, and only after a Super Admin attests that they read the email and judge it genuine (a required tick, recorded; a note too if the match is weak).
* Everything read from the pasted email, including SPF/DKIM/DMARC results, is labelled **as pasted, not independently verified**: pasted headers can be edited or invented, so they are consistency hints, never proof.
* Confirming records a relationship and nothing else: it creates no booking, quotation, invoice, payable, payment or financial entry (checked by tests: no such import, no such table).
* `client` = the organisation approved Ordift as **its** supplier. Vendors and contractors supplying services **to** Ordift stay in their existing tables, untouched; the shared `organisations` record has a separate `vendor` kind reserved for later, with no screen creating it.

## 2. Schema (migration `0163_organisations_supplier_approvals.sql`, schema only, inserts nothing)

Existing structures cannot hold this: Production has no organisation entity (clients are profiles, plus free-text company fields on quotations and partnership opportunities), so three tables are the minimum. Nothing existing is altered.

| Table | Purpose |
|---|---|
| `organisations` | one row per organisation; unique normalised name; optional domain |
| `supplier_applications` | the application, plus the evidence kept from the pasted email (sender **domain**, subject, date, authentication verdicts, short excerpt, hash) and who confirmed; the email text itself is not stored |
| `organisation_relationships` | `client` / `vendor` per organisation, unique per (organisation, kind); `approved_at` is set once and never rewritten |

Super-Admin-only read (RLS), server-only write, no delete grant, delete-refusing triggers, approved applications frozen. Duplicates are blocked by the database (unique normalised name, one relationship per organisation and kind, one email per application) and by the application layer (similar names and shared domains are shown and must be set aside explicitly). Rollback: `supabase/rollbacks/down_0163.sql` (refuses once any record exists).

## 3. Code (new unless stated)

`src/lib/organisations/` — `names.ts` (normalisation, matching), `approvalEmail.ts` (paste parser), `approvalSignals.ts` (how well the email matches; what confirmation requires), `registry.ts` (server layer) · `src/app/admin/organisations/` — directory, applications list, application detail, actions · modified: `src/lib/organization/authority.ts` (+1 capability string), `src/lib/portal/adminNavigation.ts` (+1 Super-Admin-only nav item).

## 4. Verification run locally (no database, no Production access)

`tsc --noEmit` clean · ESLint clean on changed files · full unit suite 236 files / 3,973 tests pass (59 new) · the SQL parses with PostgreSQL's own parser (syntax only; it has **not** been executed against any database, by instruction).

## 5. Not done

Migration not applied · nothing pushed or deployed · no real data entered · no database-level test (no test database authorised) · `next build` not run locally (needs the Production environment variables; CI's build job already fails for that reason) · no browser check of the new screens (they need a signed-in Super Admin and the new tables).

## 6. Runbook once authorised (three separate approvals)

1. **Apply migration 0163 to Production** — same method as 0154: `supabase link --project-ref <production>` → `supabase migration list --linked` (expect 0163 as the only local-only entry) → `supabase db push --yes` → `supabase unlink` and confirm `supabase/.temp` is gone. Take a Production backup first.
2. **Deploy the code** — merge to `main` (auto-deploys Production). While the repository is public this works as usual; after the repository is made private the Vercel Hobby limit applies and the route must be decided first (manual `vercel deploy --prod`, or Pro).
3. **First use** — the Founder records a real application and attaches a real approval email through the Admin screens. Real organisation data is never put in code, migrations or seeds (the repository is public).

Post-deploy checks: `/admin/organisations` loads for Super Admin and redirects others; the migration's tables exist with RLS on; recording an application, attaching a pasted email and confirming works end to end on one real record; no booking/invoice/payable row is created.

Migration numbering: `0163` is deliberately clear of the unmerged local branches that target `0155`–`0162`; reconcile numbers when those are merged.
