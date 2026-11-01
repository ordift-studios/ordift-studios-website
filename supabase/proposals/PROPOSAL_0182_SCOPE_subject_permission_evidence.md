# PROPOSAL (scope only, nothing written, nothing applied): structured permission evidence for people and property shown in portfolio photographs

## Why
Draft 3 of the client permission wording promises that an image showing a child or another identifiable person is not used unless the permission needed for that person is in place. Today (no migration) the system can only record the reviewer's STATEMENT: "no such people shown" or "shown, evidence exists" plus a written reference. It does not hold the evidence, does not know who the people are, and cannot tell that a guardian's permission covers a particular use.

## Narrow scope (the smallest change that would let the database itself refuse)
1. `portfolio_file_people` (append-only): per photograph and per identified person or property: `project_file_id`, `subject_kind` (`adult` | `child` | `property`), `subject_label` (a non-identifying label such as "bride's niece, left of frame"), `permission_source` (`subject_written` | `guardian_written` | `client_confirmed_authority` | `contract_release`), `evidence_reference` (>= 10 characters), `destinations text[]` (<@ the eight recorded destinations), `recorded_by`, `recorded_at`, optional `withdrawn_by/at` as a superseding row (same pattern as marketing_permission_records).
2. `portfolio_file_declarations` (append-only): per photograph, `declaration` (`none_shown` | `people_shown`), `declared_by`, `declared_at`.
3. `portfolio_use_eligibility(file, destination)`: add one more condition to the existing function (not a new gate): a declaration must exist; if `people_shown`, every recorded child/adult/property row must be unwithdrawn and cover the destination, and at least one child row must be `guardian_written`. Anything else returns `people_permission_missing`.
4. Same privileges pattern as 0170/0171: RLS on, no client grants, service role insert/select only, append-only trigger, rollback script, local rehearsal, R-backup first.

## What it still would not do
It stores a reference and a label, not the evidence document itself or the person's identity, and it still relies on a person to say who is shown. It narrows what a careless approval can do; it does not prove consent. Storing the evidence files would need the private-bucket design used by the Signature Vault and is a separate decision.

## Until then (already live in code, no migration)
Internal approval requires an explicit statement about people/property shown; "people shown" needs a written evidence reference (a bare tick is refused); a photograph whose latest approval lacks the statement is treated as NOT cleared; limits written by the rights holder must be assessed before approval and again after any newer limit is recorded.

## Decision requested
Approve this scope, and I will write the SQL, test it on the local rehearsal database, and bring the exact file and SHA-256 back for approval before any Production step.

---
## UPDATE (design prepared, nothing applied)
SQL: `PROPOSAL_0182_subject_permission_evidence.sql` (SHA-256 50ee28c7ac6d26d9f7b1be9175c649dcc92bca7c1bc64b7ce56b82407e4a28ef); rollback `ROLLBACK_0182_subject_permission_evidence.sql` (d1c1f2e9...872c); rehearsal `REHEARSE_0182_body.sql` (d379e75b...b6b7). Rehearsed on a throwaway local database: 19 assertions pass, rollback restores the exact 0171 function, re-apply works.
Safeguards: three new append-only tables, no client grants, no update/delete even for the service role, RLS on; one replaced function (same signature/return type) that ONLY adds a condition (an earlier gate can never become more permissive); verified = a separate row by management with a stated check; withdrawal blocks at once and surfaces existing uses in portfolio_uses_needing_review; a child can be covered only by a parent or legal guardian; no identification documents or evidence files are stored.
App side (dormant, SUBJECT_PERMISSIONS_ENABLED=false): subjectRules.ts, subjects.ts, subjectRules.test.ts. Admin forms for declaring, listing, recording, verifying and withdrawing are NOT built until the scope is approved.
Unresolved policy decisions (need the Founder): (1) may the person who records a grant also verify it, or must a second authorised person verify (not enforced now: with one Founder it would block all use); (2) who may be treated as an authorised representative of an adult, and for a venue or property; (3) how to treat crowds and background people: what counts as identifiable (the declaration is a reviewer's judgement); (4) whether a child's guardian must be identified by more than a name (currently name, relationship and where the evidence is kept); (5) default retention period for these records, and whether the evidence files themselves should ever be held in a private bucket; (6) behaviour of already-approved photographs when 0182 is applied (none exist in Production today; each would need a declaration); (7) whether an expiry date should be mandatory.
