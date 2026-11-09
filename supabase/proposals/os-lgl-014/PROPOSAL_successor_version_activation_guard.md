# Successor-version activation guard (PROPOSAL ONLY; not implemented, not authorised)

The Founder has not decided on this change. Nothing in the code or the database changes. This explains how a future, approved version could replace the active version without bypassing a legal control.

## The problem today
`activateMasterVersion` refuses unless the version is already the master's current version, and only the activation itself repoints that pointer. For OS-LGL-014 the pointer sits on the legacy active 1.0, so a Founder-approved, registered 1.1 can never be activated. Activation also does not retire the row it replaces, and nothing prevents two active versions of one master.

## Proposed rule (all existing preconditions stay)
A version V of master M may be activated only if **every existing precondition holds** (approved with a registry stamp or an attestation, registered, no review markers, stored files re-verified, effective date valid) **and**, in addition, one of:
- V is already M's current version (today's rule, unchanged); or
- M's current version C exists, is `active`, V is a different row with a numerically higher version than C, V has no legacy code, V's approval is a real registry stamp, and V has not already superseded anything.

## How the replacement happens (one database function, one transaction)
`activate_successor_version(V, effective_date, backdated_reason, actor)` - service-role only, like the booking functions:
1. Lock M's row; re-check that C is still current and active (compare-and-swap); refuse if not.
2. Set V.supersedes_id = C; C: active -> superseded (a transition the lifecycle already allows) with its end timestamp; V: approved -> active with the real activation time and the effective date; M.current_version_id = V.
3. Write the audit entries (effective date set, two status changes, one "successor activated" entry holding both versions' ids, hashes and approval basis).
4. Any failure rolls back everything; a partial result is impossible.
A partial unique index (one active version per master) would be added only after a read-only check that no master has two active rows today.

## What it must not do
- It must not activate an unapproved version, skip a higher approved version, or supersede a version that is not active.
- It must not change what the website shows: `/legal/booking` is served from code, not the registry, and changes only through a separate release.
- It must not alter anything already issued. Agreements keep the version they were composed from (v1.0 clause 140); an unsigned draft or sent agreement stays on C. The function lists them and the Founder acknowledges the list before activating.
- It must not be reversible by deleting history. "Going back" would be its own audited function that reactivates the predecessor.

## Screen (later, if approved)
A separate step on the Founder screen, never part of recording the approval: its own typed sentence (`activate OS-LGL-014 1.1`), the effective date, the list of in-flight agreements, and the statement of what changes and what does not.

## Tests and rehearsal the change would need
Refuses when C changed since the page loaded; refuses an unapproved, lower-numbered or already-superseding V; refuses a legacy row; rolls back fully on an audit failure; two concurrent activations (one wins); agreements and bookings under C unchanged; a rolled-back rehearsal on a Production-shaped lab.

## Founder's preferred decisions (recorded 9 Nov 2026; DESIGN DIRECTIONS ONLY)
These are directions for the design. Nothing is implemented, activated or migrated, and each needs a separate authorization. OS-LGL-014 v1.1 stays pending the actual counsel consultation and the clean final master.

### 1. An atomic, auditable successor-version switch, not a manual database operation
The switch is the single database function described above: one transaction, compare-and-swap on the current version, full audit, complete rollback on any failure. No hand-run SQL is part of the procedure. Reversal is a second audited function ("reactivate the predecessor"), never an edit of history.

### 2. Future effective dates are permitted, with scheduling and safeguards
Design: the switch is a **scheduled switch** that the Founder triggers, not a background job (automated scheduling is deliberately deferred in this platform).
- A successor is **scheduled** by recording the effective date; until that date the predecessor stays active and is the only version used for new agreements. A scheduled successor is visible on the Founder screen with its date.
- The actual atomic switch runs on or after the effective date, by the Founder pressing the switch button; it repeats every check at that moment (stored files re-hashed, approval stamp, no unresolved markers, predecessor still current, no newer approved version).
- Safeguards: a maximum horizon (proposed 90 days); a date not earlier than the approval date and not earlier than the predecessor's effective date; a past date needs the existing written reason; only one schedule per master at a time; cancelling a schedule is its own audited step; changing the approved text after scheduling is impossible (a changed master is a new version that must be approved and scheduled afresh); the Founder screen warns on the day of and after the effective date if the switch has not been made.
- New agreements are composed from the version in force on the day they are composed; an agreement keeps the version it was composed from (v1.0 clause 140).

### 3. Existing agreements stay under their applicable versions; material conflicts are flagged for review
- Nothing already issued, sent, signed or booked changes. Each agreement and each booking keeps the master version it was composed under.
- At scheduling time and again at the switch, the system lists every in-flight agreement (draft, sent, awaiting signature) and every booking made under the predecessor whose terms are affected.
- **Material conflicts** are flagged from a recorded comparison of the two versions' clauses in the areas counsel is asked about (currency and payment, governing law, usage rights, cancellation and refunds, liability, minors and safeguarding). An in-flight agreement composed under the old text, whose area changed, is listed for a human decision (leave it, re-issue it under the new version, or amend it by the existing amendment process). The system proposes nothing automatically and changes nothing.
- A draft that was never sent may be re-composed under the new version by an explicit, audited action; a sent or signed one never is.

### 4. Renewed counsel consultation when substantive amendments follow the reviewed text (not for every activation)
- The approval record already stores the hash of the draft counsel heard, the hash of the registered master, and how they relate.
- **Rule:** if the registered master differs from the reviewed text by anything other than a recorded counsel recommendation or a non-substantive correction (typography, numbering, defined-term consistency), a further consultation is required before approval. The Founder screen already refuses "different text"; the proposal adds a required "substantive change after review" declaration that blocks approval until a later consultation is recorded.
- Activation itself does **not** need a fresh consultation when the approved text is unchanged; it needs only the Founder's explicit switch and the safeguards above.
- A change after approval is never an edit: it is a new version with its own review.

## Remaining decisions
1. Approve building the switch (separate authorization, after the clean master exists).
2. The scheduling horizon (90 days proposed) and whether the Founder wants a reminder on the effective date.
3. Which clause areas count as "material" for flagging (the six listed are proposed).
4. Whether a never-sent draft may be re-composed under the new version by staff, or only by the Founder.
