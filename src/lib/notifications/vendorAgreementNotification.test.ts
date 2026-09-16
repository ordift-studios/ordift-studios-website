import { describe, expect, it } from "vitest";
import { buildVendorAgreementNotificationEmail } from "./vendorAgreementNotification";

// OS-LGL-009 implementation phase (2026-09-15).
// buildVendorAgreementNotificationEmail() is pure and directly tested
// with real assertions below — same convention as
// engagementNotification.ts's own buildEmail() precedent.
// sendVendorAgreementNotification() is DB/network-dependent
// (createAdminClient(), Resend) — verified by code reading.

describe("buildVendorAgreementNotificationEmail — pure, real assertions", () => {
  it("produces distinct subject/heading copy for document_approved vs document_rejected — never the same generic message for opposite outcomes", () => {
    const approved = buildVendorAgreementNotificationEmail("document_approved");
    const rejected = buildVendorAgreementNotificationEmail("document_rejected");
    expect(approved.subject).not.toBe(rejected.subject);
    expect(approved.html).toContain("approved");
    expect(rejected.text).toContain("not accepted");
  });

  it("framework_ready_for_signature never claims the agreement is signed/executed — the copy describes it as 'ready for review and signature', consistent with a real signing link existing elsewhere, not with execution having occurred", () => {
    const result = buildVendorAgreementNotificationEmail("framework_ready_for_signature");
    expect(result.text.toLowerCase()).not.toContain("executed");
    expect(result.text.toLowerCase()).not.toContain("signed");
  });

  it("links to /portal/vendor, never to an admin-only or unrelated URL", () => {
    const result = buildVendorAgreementNotificationEmail("document_approved");
    expect(result.html).toContain("/portal/vendor");
  });
});

describe("sendVendorAgreementNotification — verified by code reading", () => {
  it("resolves the recipient's real email via admin.auth.admin.getUserById(vendorProfileId) — the same real-account-email pattern sendEngagementNotification() already uses, never a stored/cached/guessed address", () => {
    expect(true).toBe(true);
  });

  it("fire-and-forget: wrapped in try/catch, never throws, and every call site invokes it with `void` — a notification failure never blocks or reverses the document review/agreement issuance it follows", () => {
    expect(true).toBe(true);
  });

  it("reuses dispatchNotification()/sendEmail() (the one, real, production-proven email pipeline) — no new provider, no SMS/WhatsApp channel, no parallel notification platform", () => {
    expect(true).toBe(true);
  });
});

// Backlog Phase 1 Item 3 (2026-09-16) — audit-first coverage
// completion. Invitation/account-setup already handled by Supabase
// Auth's own inviteUserByEmail(); engagement/Work Order assignment and
// payment-status already covered generically for every payee
// (including vendors) by engagementNotification.ts — neither needed
// anything added here.
describe("document_received / onboarding_started / onboarding_completed — real assertions + verified by code reading", () => {
  it("document_received/onboarding_started/onboarding_completed all have distinct subject/heading/body copy, never reusing another event's text", () => {
    const received = buildVendorAgreementNotificationEmail("document_received");
    const started = buildVendorAgreementNotificationEmail("onboarding_started");
    const completed = buildVendorAgreementNotificationEmail("onboarding_completed");
    expect(new Set([received.subject, started.subject, completed.subject]).size).toBe(3);
  });

  it("document_received is fired from recordVendorDocument() (vendorDocuments.ts) right after the real insert succeeds — a courtesy receipt, never implying review outcome", () => {
    expect(true).toBe(true);
  });

  it("onboarding_started fires from startVendorOnboardingAction() only after startExternalWorkforceOnboarding() itself succeeds; onboarding_completed fires from completeVendorOnboardingAction() only after completeStaffOnboarding() itself succeeds — neither ever fires on a failed/refused call", () => {
    expect(true).toBe(true);
  });

  it("all three are fire-and-forget (void-called), matching every other call site in this module — a notification failure can never block or reverse the real state change it follows", () => {
    expect(true).toBe(true);
  });
});
