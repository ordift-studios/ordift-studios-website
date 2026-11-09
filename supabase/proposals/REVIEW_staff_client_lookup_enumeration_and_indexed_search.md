# Staff client lookup: enumeration risk review and the indexed, server-side search for Production (REVIEW + PROPOSAL; nothing applied)

Prepared 9 Nov 2026. Narrow permission retained: authorised staff may attach an enquiry once to an existing active client. Corrections, unlinking and merging stay Super Admin only. Audit logging, duplicate detection and restricted visibility are unchanged.

## 1. What the lookup can reveal, and to whom
Staff and admins (not clients, not anonymous) can learn, for an active client matched by name, phone or a complete email: a display name, the organisation, one masked identifier, an earlier-enquiry count. They cannot read notes, job titles, full contact details, quotations, payments or inactive clients, and cannot create, edit, merge or unlink.

## 2. Enumeration risks and the controls (present and proposed)
| Risk | Control today (local build) | Added by the indexed design |
|---|---|---|
| **Existence oracle**: a staff member (or a stolen staff session) tests whether a known person is a client | complete email only (no partial), phone of 7+ digits, name of 3+ letters; 5 results at most and only a "more" flag; shared mailboxes never match; inactive never shown | the same limits are enforced INSIDE the database function (so a bug or a bypass in the web tier cannot widen them) |
| **Browsing the directory** ("aaa", "a%") | 3-letter minimum, 60-character cap, 20 lookups a minute per person | the database function refuses short, malformed or over-long input and returns at most six rows whatever limit is requested |
| **Bulk harvesting** over time | every lookup is audited (kind, result count, query length; never the text or any result) | add a **daily review**: a Super Admin report of lookups per person per day with a threshold, and an alert on a burst of zero-result name searches (guessing) |
| **Personal data in the web tier** | today the server loads up to 5,000 contacts with every email and phone into memory per search | the function returns ONLY seven already-masked columns; **full identifiers never leave the database for this feature**; the web tier no longer holds the contact list |
| **Personal data in logs and the audit trail** | the audit entry stores query length, not text | unchanged; database statement logs must not record function arguments for this function (to confirm in the Production logging settings before release) |
| **Staff attaching the wrong client** | duplicate detection names the match masked; link only while the enquiry has none; audited; reversed if the audit cannot be written | unchanged |
| **Privilege creep** | uses staff or admin role only; no Super Admin power; no directory authority | function executable by the service role only; revoked from anon and authenticated |
| **Timing and size side channels** | result size is capped | constant cap; indexed lookups are milliseconds at 20,000 contacts so timing leaks no more than size |
Residual risk: even masked output confirms that a person is a client. That is inherent in preventing duplicate profiles; the controls above make abuse slow, bounded and visible.

## 3. The indexed design (`PROPOSAL_staff_client_lookup_indexed_search.sql`, rehearsed locally)
- **Indexes (all partial or functional, additive):** trigram index on a stored, accent-folded `contacts.search_text`; GIN index on a function of the phone numbers (last nine and last seven digits); lower-cased personal-email index; trigram index on the organisation's normalised name. `pg_trgm` is the only extension. `enquiries` already has an index on `contact_id`.
- **One function** `public.staff_client_lookup(kind, value, limit)`: `security definer`, empty search path, read-only, returns seven masked columns, capped at six rows, validates input, executable by the service role only.
- **Change to the application (not made yet):** call the function instead of loading contacts, keeping the authorization check, audit, rate limit and the staff-only link as they are. A fallback to the current in-memory path while the migration is not applied keeps it deployable in either order.
- **Rehearsal results (lab, one rolled-back transaction, 20,000 synthetic contacts):** all result, masking, validation and privilege checks pass (exact email, shared address never matched, phone in any format, inactive never returned, accent folding, organisation names, cap of six, no full email or phone in any output, exactly seven columns, short or partial input refused, service role only). Searches took about 4.5 ms (name), 1.2 ms (phone) and 0.2 ms (email); the plans use bitmap index scans. The rollback rehearsal removes every added object. The lab was unchanged afterwards.

## 4. What is not done
No migration was applied or numbered; the application still uses the in-memory path; Production statement-logging settings and the daily review report are not built; the effect on the Production contact volume (small today) is untested beyond 20,000 synthetic rows.

## 5. Decision
Approve the next step: switch the application to the function with a fallback (local only), then a separate release request for the migration.
