# PLAN (NOT approved; nothing applied, pushed or deployed): migration 0188 — asset legal-owner record and acquisition↔asset link

Local branch `local/finance-0188-asset-link` (on Production main 1be073f).
| Part | Fingerprint / content |
|---|---|
| Migration `supabase/migrations/0188_asset_ownership_and_acquisition_link.sql` | sha256 `47de78a9dd1a3ed91d4c0c84b2cdfd451bb0f53812aefaff36c96bb01ea72ecb` |
| Rollback `supabase/proposals/ROLLBACK_asset_ownership_and_acquisition_link.sql` | sha256 `aa77d042fbb5341bb7bbe8969667d70f25643924c31fae636b3cd3f98c901733` |
| Adds | 1 table (`entity_asset_ownership`), 3 audited functions (record owner, void owner, link acquisition to asset), 1 guard trigger on acquisitions (fires ONLY when the asset link changes), 1 unique index (one active acquisition per asset), widens the audit-event list. **Nothing is added to or changed on the asset register (`company_assets`): no column, no trigger.** |
| Code | pure ownership rules, read-only asset loader + 3 audited-function wrappers, 3 server actions, panel section "Registered assets and legal owner" and a "Link to an existing registered asset" control per purchase |

## How ownership is established and recorded (purchaser ≠ owner)
Five facts stay separate and none is inferred from another: **purchaser** (as stated/printed — on the acquisition and echoed in the owner record), **legal owner** (the legal entity — recorded once per asset in `entity_asset_ownership` with the written basis, optional vault evidence document, and business purpose), **funding source** (on the acquisition: Founder-reported company card, pending statement), **assigned user** (the existing asset-assignments custody record — not touched), **business purpose** (owner record; incidental personal use is flagged for accountant review). The record starts and stays *pending professional review*: no function here marks ownership accountant-approved. A receipt in the Founder's name never makes the Founder the owner and never makes the asset the company's: the Founder records the **intended** owner entity with the basis, and the accountant confirms.

## Controls enforced by the database
Link set ONCE (null → asset), never changed or cleared (also against a direct update); the asset must have a CURRENT ownership record for the SAME legal entity as the acquisition (Qatar/Ghana separation); one active acquisition per asset (unique index; a voided acquisition frees it); ownership can be voided (with a written reason) only while no acquisition is linked; records are append-only; Super Admin only; no client write grants; service_role cannot delete; audit events for owner recorded/voided and for the link; the rehearsal proves the asset-register rows are byte-identical before and after and no expense is created.

## Evidence (local; synthetic data)
Lab rehearsal of the exact 0188 file on top of 0186 + 0187: apply PASS, rollback PASS (restores the audit-event list), verifier fails as designed (the lab already held empty 0186/0187 objects; the rehearsal removes them inside its rolled-back transaction first). Unit/UI: ownership rules, library, actions, panel and source-level isolation tests pass (89 files / 1,345 tests in the affected areas).

## Release sequence (needs your separate written approval; same gates as 0187)
Backup (your Terminal) → local restore check → read-only preflight → gated apply of 0188 only → verification → push → smoke checks → your iPad check. Then, as SEPARATE approvals: (1) record the Wacom's owner (Qatar entity) with its basis; (2) record the FNAC acquisition; (3) link it to the existing asset. Scripts for 0188 are derived from the 0187 set at that time (not yet created).
## Residual risks
Ownership stays "pending professional review" until the accountant confirms; the asset register still has no entity column (ownership lives in the new table); a mistaken ownership record can only be voided while unlinked; the link itself cannot be undone (correct by voiding the acquisition, which frees the asset).
