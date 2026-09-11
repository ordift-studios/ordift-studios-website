// Google Workspace Corporate Email — Milestone 1B: provider
// abstraction (2026-09-10). Pure types + interface + the mock
// implementation — zero I/O, zero network, zero credentials of any
// kind. A future real provider (e.g. googleWorkspaceProvider.ts,
// calling the Admin SDK Directory API over Domain-Wide Delegation)
// implements this exact same interface and is injected by the caller —
// corporateProvisioning.ts's orchestration functions never construct a
// provider themselves, so they cannot accidentally reach a real
// service merely by being called.

export type ProvisioningType = "licensed_mailbox" | "alias" | "group";

// Only 'licensed_mailbox' has a built workflow in this milestone (see
// the Admin UI) — 'alias'/'group' are modeled here, and accepted by
// the database check constraint (migration 0076), purely so a future
// phase can add them without another schema change. Deliberately not
// exposed as a real choice yet, per explicit instruction not to
// overbuild what isn't needed.
export const PROVISIONING_TYPES: readonly ProvisioningType[] = ["licensed_mailbox", "alias", "group"];

export type ProvisioningAvailability = "available" | "taken" | "unavailable" | "ambiguous";

export type ProvisioningRequest = {
  email: string;
  provisioningType: ProvisioningType;
  legalFirstName: string;
  legalSurname: string;
};

// Every non-success reason a real provider (or this mock) can report —
// modeled explicitly rather than a bare boolean, so a caller can never
// collapse "the address already exists" and "we couldn't tell" into
// the same handling. Per explicit instruction, NONE of these are ever
// resolved automatically — every non-success outcome routes to
// provisioning_failed for a human to look at, never a silent retry or
// a different address.
//
// 'partial_success' (Milestone 1C-A, 2026-09-11) — the real Google
// Workspace flow this models is genuinely two API calls, not one:
// Directory API user creation, then a *separate* Enterprise License
// Manager API call to assign a license. The account can exist while
// the license assignment still fails. This is deliberately still a
// FAILURE reason, not a third top-level outcome shape — it must
// resolve to provisioning_failed exactly like every other non-success
// case (resolveProvisioningOutcomeStatus() needs no change at all: it
// already treats every `ok: false` outcome identically), and per
// explicit instruction the account must never be auto-retried-created
// merely because this reason is seen.
export type ProvisioningFailureReason = "already_exists" | "unavailable" | "ambiguous" | "partial_success";

export type ProvisioningOutcome =
  | { ok: true; externalId: string }
  // externalId here is optional and populated ONLY when a failure
  // genuinely knows a real external account id already exists (today,
  // only the 'partial_success' reason does this) — every other failure
  // reason (already_exists/unavailable/ambiguous) has never actually
  // created anything, so it stays absent for those, exactly as before
  // this change. Preserved specifically so a human reconciling a
  // 'provisioning_failed' identity can see "Google already has this
  // account, do not blindly retry creation" rather than having to
  // guess or check Google Admin Console cold.
  | { ok: false; reason: ProvisioningFailureReason; externalId?: string };

// A real implementation must never be constructible from client code —
// this interface itself has no browser-safe concerns baked in (no
// method returns or accepts a credential), but the discipline is
// enforced by where it's ever imported from: server-only modules
// (corporateProvisioning.ts, actions.ts) exclusively.
export interface ProvisioningProvider {
  // A stable, human-readable identifier for whichever concrete
  // implementation this is — written verbatim into
  // corporate_identities.provider on a confirmed success, so "mock"
  // vs. a future "google_workspace" is always visible on the row
  // itself, never inferred.
  readonly name: string;

  // Read-only pre-check for the Admin UI's preview step. Never
  // mutates anything on either side — safe to call as often as the UI
  // needs while a Super Admin is composing a request. Because a real
  // provider's state can change between this check and the actual
  // provision() call, provision() below must perform its own
  // equivalent check-then-create sequence rather than trusting this
  // result — the same reason a real Google Directory API flow does
  // both a users.get() and handles a users.insert() collision.
  checkAvailability(email: string): Promise<ProvisioningAvailability>;

  // The actual attempt. Must itself be safe to call at most once per
  // confirmed request (the caller in corporateProvisioning.ts enforces
  // this with an atomic status guard) — this method's own job is only
  // to report exactly what happened, honestly, never to guess.
  provision(request: ProvisioningRequest): Promise<ProvisioningOutcome>;
}

// The mock provider (Milestone 1B). Deterministic, driven entirely by
// the requested email's local part — a real, addressable way for both
// automated tests and a live Super Admin exploring the Admin UI to
// reach every outcome on purpose, without any hidden state or timing
// dependency. Every externalId this provider returns is prefixed
// "mock-" specifically so it can never be mistaken for a real Google
// user id if it ever appeared somewhere unexpected — belt-and-braces
// alongside the Admin UI's own explicit "MOCK PROVIDER" banner.
function classifyMockLocalPart(email: string): ProvisioningFailureReason | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.includes("taken") || local.includes("exists")) return "already_exists";
  if (local.includes("unavailable")) return "unavailable";
  if (local.includes("ambiguous")) return "ambiguous";
  return null;
}

export const mockProvisioningProvider: ProvisioningProvider = {
  name: "mock",

  async checkAvailability(email: string): Promise<ProvisioningAvailability> {
    const failure = classifyMockLocalPart(email);
    if (failure === "already_exists") return "taken";
    if (failure === "unavailable") return "unavailable";
    if (failure === "ambiguous") return "ambiguous";
    return "available";
  },

  async provision(request: ProvisioningRequest): Promise<ProvisioningOutcome> {
    // Test-only trigger for the 'partial_success' case (Milestone
    // 1C-A) — deliberately checked separately from
    // classifyMockLocalPart() rather than folded into it, since
    // "partial success" isn't a meaningful pre-check/availability
    // state (checkAvailability() above is completely untouched by
    // this addition — a "...partial..." local part still reports
    // "available" from that method, which is correct: this scenario
    // can only be known at actual provision()-time, mirroring the real
    // Google flow where the account genuinely gets created before the
    // separate license call can fail).
    const local = request.email.split("@")[0]?.toLowerCase() ?? "";
    if (local.includes("partial")) {
      return { ok: false, reason: "partial_success", externalId: `mock-${crypto.randomUUID()}` };
    }

    const failure = classifyMockLocalPart(request.email);
    if (failure) return { ok: false, reason: failure };
    return { ok: true, externalId: `mock-${crypto.randomUUID()}` };
  },
};
