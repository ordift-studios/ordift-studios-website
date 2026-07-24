// Central legal/environment gate, shared by every form-driven system on
// the site (Enquiries, Workshop Registrations, and future ones — Plan
// Part H / approved 2026-07-23). Real sends and real Sheet writes are
// impossible unless BOTH are true — staging always uses the test
// workflow regardless of what else is configured.

export function isStaging(): boolean {
  return process.env.SITE_ENV !== "production";
}

export function legalPagesApproved(): boolean {
  return process.env.LEGAL_PAGES_APPROVED === "true";
}

// True only in a real production deployment with the Privacy Notice,
// Website Terms and Booking Terms all approved and published.
export function productionSendingEnabled(): boolean {
  return !isStaging() && legalPagesApproved();
}
