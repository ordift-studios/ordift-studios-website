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

## Decisions for the Founder
1. Do you want this change at all, or prefer a manual, counsel-supervised database step for the one-off OS-LGL-014 1.1 activation?
2. Future-dated effective dates: allowed, or the effective date must be today or earlier?
3. In-flight agreements under 1.0: warn only, or refuse activation while any exist?
4. Should activation require a second consultation with counsel (a different decision from approving the text)?
