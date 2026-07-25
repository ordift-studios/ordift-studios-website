// Central environment gates, shared by every form-driven system on the
// site (Enquiries, Workshop Registrations, and future ones — Plan Part H
// / approved 2026-07-23, sending gate split from legal-page approval
// 2026-07-25). Real sends and real Sheet writes are impossible unless
// forms-sending is explicitly turned on — staging always uses the test
// workflow regardless of what else is configured.

export function isStaging(): boolean {
  return process.env.SITE_ENV !== "production";
}

// Governs only whether the legal pages (Privacy Notice, Website Terms,
// Booking Terms, Cookie Notice) are published as approved — not whether
// forms send real email. Kept separate so publishing real legal-page
// text and turning on real form delivery can happen on independent
// timelines.
export function legalPagesApproved(): boolean {
  return process.env.LEGAL_PAGES_APPROVED === "true";
}

// Governs only whether Enquiries/Workshop Registrations actually send
// real email and write to the real Google Sheet, independent of legal
// page approval.
export function formsSendingEnabled(): boolean {
  return process.env.FORMS_SENDING_ENABLED === "true";
}

// True only in a real production deployment with forms-sending
// explicitly turned on.
export function productionSendingEnabled(): boolean {
  return !isStaging() && formsSendingEnabled();
}

// Whether visitors should see a working intake form at all (Enquiries,
// Workshop Registrations) rather than a "coming soon" notice. Staging
// always shows the form (it's how the flow gets tested); production
// only shows it once forms-sending is turned on — otherwise a visitor
// would submit into a form that looks successful but silently never
// reaches anyone.
export function visitorFormsOpen(): boolean {
  return isStaging() || formsSendingEnabled();
}
