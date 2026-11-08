# PROPOSAL (detailed implementation design; not approved to build; no migration, no code, no deployment)

Prepared 2026-11-08 for Founder review. Builds on `PROPOSAL_booking_confirmation_for_accepted_quotations.md` and on the Founder's business-rule approvals of 2026-11-08 (initial rules, not authorisation to migrate or deploy). Reuses the existing enquiry, quotation, acceptance, amount-due, contracting-entity and Crew Support infrastructure; **no parallel booking system.** Anything below that is a legal question is marked "to be confirmed"; this document asserts no legal requirement.

## 1. Approved business rules (initial)
| Topic | Rule |
|---|---|
| Agreement | Required for higher-risk or larger assignments; not necessarily for simple photography sessions |
| Payment | Follow the payment condition stated in the accepted quotation. Upfront payment required -> confirmation waits for **verified** payment. Otherwise record the outstanding amount, never as received |
| Date and place | Confirmed date, time and location required; online, multi-location and multi-day assignments supported |
| Conflicts | Conflicting confirmed bookings are identified and reviewed **before** confirmation |
| Who | Super Admin only, initially; every confirmation action audited |

## 2. Reuse map (nothing here is new infrastructure)
| Need | Existing piece reused |
|---|---|
| "Accepted quotation" | `recordOrdinaryQuotationAcceptance` (evidence, who, when, channel) + the quotation's content fingerprint |
| Which entity contracts, and is it still eligible | `booking_contracting_entities` + `private.entity_issue_standing(entity, date, activities)` (re-run at confirmation) |
| Payment gate | `paymentCondition.ts` (`none` / `deposit` / `full`, `paymentBlocker`) and the verified-only amounts (`amount_due`, `amount_paid`; a bank transfer credits only after independent verification) |
| Agreement gate | `assessAgreement` shape from Crew Support (executed agreement, or accepted quotation terms as the contract) |
| Conflict definition | `classifyConflicts` (firm = confirmed commitment or approved leave; soft = in progress). Generalised once so Crew Support and ordinary bookings share ONE definition |
| Override with reason | `validateOverrideReason` pattern (recorded justification, at least a sentence) |
| Stage change | the guarded, idempotent update used by `enquirySync.ts`: confirmation moves the enquiry to `booked`; typing `booked` by hand for an enquiry with an accepted ordinary quotation is refused while the flag is on (as it already is for Crew Support) |
| Audit | `logActivity` + an append-only table (same pattern as the contracting-entity table) |

## 3. Service-category matrix: PROPOSED defaults for the Founder to edit
Categories are the activity families already used by quotation issuance. "Default" is the proposed starting rule; **thresholds are left blank for the Founder to set** (no figures are invented); legal sufficiency of any agreement is for counsel and is not asserted here.

| Category | Agreement default | Escalates to "agreement required" when |
|---|---|---|
| Photography (simple session) | Not required: the accepted quotation's own terms are the contract | total at or above the Founder's threshold; more than one day; usage or licensing rights beyond the standard; exclusivity requested; the people photographed include children (also triggers the safeguarding checks) |
| Videography | Required | (always, proposed: a larger production footprint) |
| Graphic design / branding | Not required for a fixed, single deliverable | total above threshold; ongoing or retainer work; rights assignment requested |
| Talent management | Required | always |
| Production services (crew, equipment, locations) | Required | always |
| Drone operations | Required | always (the entity must also hold the activity coverage, which issuance already checks) |
| Any category | Required if the quotation says "Agreement required" | the quotation or a Super Admin marks it |

Stored as a small, versioned rules file with unit tests first (reviewed like code); a settings table only if you later want to change it without a release.

## 4. Payment gates (confirmation rules)
1. Read the condition from the accepted quotation. **Today the quotation carries payment terms only as free text.** Proposed: the Super Admin records the structured condition (`none` / `deposit n%` / `full`) at confirmation, with the quotation's own terms text shown beside it and the choice stored in the confirmation record. (A later, separate improvement could add the structured condition to the quotation itself; that would change the fingerprinted quotation and is not part of this feature.)
2. `none`: confirm; store "outstanding QAR/GHS/USD x, not received" as a note. Creates **no** payment, receivable, invoice or email.
3. `deposit` / `full`: confirmation is refused until verified payment covers the required amount (the same arithmetic Crew Support uses). A shortfall message names the amount still needed.
4. Currency: amounts use the system's existing reference-currency handling (as Crew Support does); no new conversion logic.

## 5. Date, place and schedule model (online, multi-location, multi-day)
One booking has one or more **schedule segments**: start and end (with the time zone), type (`on_site`, `online`, `studio`), location text for on-site and studio, platform for online, optional note. Required: at least one segment; end after start; on-site needs a place; online needs a platform. A shoot over several days or places is several segments. An overall start/end is derived for conflict checks.

## 6. Conflict handling
- **What conflicts:** an overlapping segment on another confirmed ordinary booking, a confirmed Crew Support slot, or approved leave, for the same assigned person; and (soft warning) overlapping confirmed bookings with no person assigned, as a capacity warning.
- **Before confirmation:** the panel lists every conflict (firm and soft) with the other booking's reference and dates.
- **Firm conflict:** confirmation is refused unless the Super Admin records an override reason (at least a sentence), kept on the record and in the audit log.
- **Races:** the confirmation function takes a lock per assignee and re-runs the check inside the transaction, so two confirmations cannot both win.
- Test records (is_test) never block real scheduling, as today.

## 7. Confirmation evidence and audit trail
One append-only row per confirmation, holding: enquiry; accepted quotation and its fingerprint; acceptance evidence reference; contracting entity (as issued) and its eligibility result; agreement requirement, reason and the agreement reference if executed; the structured payment condition, required and verified amounts, outstanding amount; the schedule segments; the conflict list and any override reason; confirmed by; confirmed at; basis note. A change or cancellation is a **new row** referring to the one it replaces (nothing is edited). Audit events: `booking.confirmed`, `booking.changed`, `booking.cancelled`, `booking.conflict_override`.

## 8. Flag, roles, screens
- Flag `BOOKING_CONFIRMATION_ENABLED`, off by default; with it off, nothing changes, including hand-typed `booked`.
- Super Admin only to confirm, change or cancel; staff and admins can read blockers if you wish (decision later).
- A "Booking" panel on the enquiry page (blockers, schedule form, conflict review, payment gate, confirm button with an explicit confirmation sentence). Separate small change: rename the workshop list "Bookings" to "Workshop registrations".

## 9. Database (one additive migration, proposal only, when you approve)
`enquiry_booking_confirmations`, `enquiry_booking_segments`, one confirm function and one cancel/change function (security definer, atomic, lock, re-checks), guards (append-only, no delete), RLS Super Admin read, service role write through the functions only. Rehearsed on the Production-shaped scratch database (`rehearse_production_shape.sh`) with a rollback that refuses to run over data, and the usual backup and hash-gated apply.

## 10. Tests
Pure: matrix, payment gates (none / deposit / full, partial payments), schedule validity (multi-day, multi-location, online, time zones), conflict classification (firm/soft/test records). Isolated database: concurrency (two confirmations), supersede and cancel, refusal when the quotation changed or the entity lost eligibility, no payment/email/invoice created. Static: flag off changes nothing; no role but Super Admin can confirm.

## 11. Order and gates
Founder review of this document -> local pure rules and tests -> migration proposal and rehearsal -> approval, backup, apply -> app release behind the flag -> first real confirmation checked read-only. Each Production step needs its own approval.

## 12. Founder inputs still needed
The thresholds in section 3 (larger value, per currency); whether videography and production services should always require an agreement (proposed yes); who may read blockers (staff or admins); whether a confirmed booking may be changed by anyone but a Super Admin (proposed no).
