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
