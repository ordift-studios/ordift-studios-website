// Google Workspace Corporate Email — Milestone 1B: pure lifecycle
// guards (2026-09-10). No I/O, no database — every function here is
// a plain, deterministic decision given the current status (and, for
// resolveProvisioningOutcomeStatus, a provider outcome). This is
// deliberately factored out of corporateProvisioning.ts (which does
// the actual DB read/write and is DB-dependent, per this codebase's
// established convention) so the lifecycle rules themselves — not
// merely "the DB call was made" — get real, executable unit tests.
//
// The fix this milestone exists to make (Milestone 1A's identified
// gap): a Corporate Identity must never become 'active' merely because
// provisioning was requested or attempted — only
// resolveProvisioningOutcomeStatus(), given a genuine provider
// outcome, can ever produce "active", and only when that outcome is a
// real, parsed success.

import type { ProvisioningOutcome } from "./provisioningProvider";

export type CorporateIdentityStatus = "reserved" | "pending_provisioning" | "provisioning_failed" | "active" | "suspended" | "deactivated";

// Only a still-'reserved' identity may have provisioning requested —
// this is the reserved -> pending_provisioning transition itself.
// Every other status (including an already-pending or already-failed
// one) is refused: a second request on the same identity would
// silently discard whatever provisioning_type/timestamp the first
// request already recorded, which is exactly the kind of "silently
// rewritten history" this project's standing discipline avoids.
export function canRequestProvisioning(status: CorporateIdentityStatus): boolean {
  return status === "reserved";
}

// A provisioning ATTEMPT (the actual provider call) is allowed from
// 'pending_provisioning' (the normal first attempt) or from
// 'provisioning_failed' (an explicit retry after a prior non-success
// outcome) — never from 'reserved' (a request must happen first),
// never from 'active'/'suspended'/'deactivated' (nothing to attempt;
// re-provisioning an already-active or already-retired identity is a
// different, not-yet-built operation, not this one).
export function canAttemptProvisioning(status: CorporateIdentityStatus): boolean {
  return status === "pending_provisioning" || status === "provisioning_failed";
}

// The one function that may ever produce "active" as a target status —
// and it can only do so given a genuine ProvisioningOutcome with
// ok: true. Every other outcome (already_exists / unavailable /
// ambiguous), and by construction anything that isn't a recognized
// success shape at all, resolves to 'provisioning_failed' — there is
// no path through this function that reaches 'active' without a real,
// parsed provider success.
export function resolveProvisioningOutcomeStatus(outcome: ProvisioningOutcome): "active" | "provisioning_failed" {
  return outcome.ok ? "active" : "provisioning_failed";
}

// A provisioning attempt that throws (a network error, a bug in a
// future real provider, anything not shaped as a normal
// ProvisioningOutcome at all) must be treated exactly like an
// unsuccessful outcome — never left in 'pending_provisioning'
// indefinitely (which would look like nothing happened) and never
// promoted to 'active' (which would be the actual danger). Exists as
// its own named function, rather than inlining "provisioning_failed"
// at the catch site, so the guarantee is visible and testable on its
// own rather than implied by a call site's structure.
export function resolveProvisioningExceptionStatus(): "provisioning_failed" {
  return "provisioning_failed";
}
