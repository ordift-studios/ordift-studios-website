# Deployment Request 5 — Client Directory v1 (for review; nothing deployed)

Branch `client-directory-v1`, based on `main` = `df7e586`. One additive migration (`0164`), **not applied anywhere**. Local development and testing only.

## 1. What it adds

Individuals and organisations as directory records, with optional human-set links from enquiries and quotations.

* **Contacts** (`contacts`, `contact_emails`): an individual client is a contact with no organisation; an organisation (the existing `organisations` registry) can have several contacts; a contact can have several email addresses. A contact is **not** a portal account: `profile_id` is an optional link a Super Admin sets for a suggested account, never automatically.
* **Email identity**: a *personal* address belongs to one active contact (database rule); an identical personal address sends you to the existing contact instead of creating another, and never merges anyone. A *shared* mailbox (info@, bookings@ …) can be held by several contacts and is never identity. Only lowercasing is applied, so `+tags` and dots never join two different people. Names alone never block anything; phone numbers are suggestions only.
* **Links** (four nullable columns): `enquiries.contact_id`, `enquiries.organisation_id`, `client_quotations.contact_id`, `client_quotations.organisation_id`. A planner enquiring for a hotel: the contact is the planner (employer on the contact), the organisation on the enquiry is the hotel.
* **Screens** (Super Admin only, under Organisations): Directory (add organisation), Organisation detail, Contacts, Contact detail, Link enquiries (one-off, human-reviewed), and a "Client record" panel on each enquiry and quotation page.

## 2. Ghana / Qatar and `business_id`

`business_id` on the new tables is the **platform** scope (`public.businesses`, one row: Ordift Studios), the same as every other table. It is not a legal entity: Ghana and Qatar are `employing_entities`, a separate table. A client therefore carries no exclusive entity. The legal entity that contracts (`booking_contracting_entities`, chosen explicitly, append-only, never inferred) and the payment market (`enquiries.payment_country`) stay on each enquiry/quotation. The directory only **reads and shows** them and warns when one client's records span entities or markets; nothing in it sets either. No financial column exists in the new tables.

## 3. Existing records

Nothing is linked, merged, backfilled or reassigned. The migration touches no row. Existing enquiries, quotations, crew-support requests, profiles, vendors and payees are unchanged. The existing enquiries are linked only through the Link enquiries screen, one at a time, by a person, each logged.

## 4. Exact database changes (`0164_client_directory_contacts.sql`)

* `contacts` and `contact_emails` (RLS on, Super-Admin read, server-only write, no delete grant; delete-refusing and edit-restricting triggers; unique indexes for personal addresses, per-contact addresses, one primary, one account per contact).
* Four nullable columns with `on delete restrict` foreign keys, and partial indexes.
* `private.directory_link_guard()` + triggers on `enquiries` and `client_quotations`: staff can update enquiries/quotations through row-level security, so only a Super Admin or server code (service role) may set or change the four link columns.
* Rollback `supabase/rollbacks/down_0164.sql` refuses if any contact exists or any record is linked.

## 5. Verification run (no database, no Production access)

`tsc --noEmit` clean · ESLint clean on changed files · full unit suite 238 files / 4,033 tests pass (62 new: matching, normalisation, entity-context, link planning, and structural checks that the module imports no money/stage/vendor code, writes only its own tables plus the four link columns, never deletes, authorises first in every function, and that the migration is additive and locked down) · SQL parses with PostgreSQL's own parser (syntax only) · local `next build` with placeholder environment passes and lists the new routes.

## 6. Not done / limitations

Migration not applied; nothing pushed or deployed; no real data; no database-level test (none authorised), so the unique indexes, guard triggers and row-level security are verified by reading and parsing only, then by read-only catalogue checks after the migration; screens not exercised in a browser with real data. Suggestions for a quotation tied to a registered account (no prospect name) are empty; link those by hand. No merge tool (flagged "may be the same person" only).

## 7. Runbook once authorised (separate approvals)

1. **Backup + apply 0164**: fresh logical backup into the encrypted volume (`supabase db dump --linked`), verify; read-only pre-counts; `supabase link` → `migration list --linked` (expect 0164 only) → `supabase db push --yes` → unlink; verify tables, policies, indexes, triggers, grants, the four columns all NULL, existing row counts unchanged, object deltas as expected (+2 tables, +4 columns, +4 triggers, +3 functions, +12 indexes, +2 policies), site pages 200.
2. **Deploy**: fast-forward push to `main`; monitor Vercel; verify public pages and that the new admin routes redirect when signed out. (Must precede any repository-visibility change, or a Vercel route be decided.)
3. **First use**: Super Admin links the seven existing enquiries through Link enquiries, with real records entered only through the screens (never in code).

Migration numbering: `0164` follows `0163` (applied). The unmerged local branches that target `0155`–`0162` still need reconciling when they merge.
