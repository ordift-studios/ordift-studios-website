import { describe, expect, it } from "vitest";
import { buildEmail } from "@/lib/notifications/engagementNotification";

// Phase H.7 (2026-09-05) — H.6 found that marking an engagement
// completed sent zero notification at all (only work_approved was
// wired). This is the pure render coverage for the new
// engagement_completed event, same pattern as
// newBookingNotification.test.ts. sendEngagementNotification() itself
// (recipient lookup via admin.auth.admin.getUserById(), the actual
// Resend dispatch) needs a live Supabase session and isn't locally
// testable — same established limitation as every other DB-dependent
// notification path in this suite; what's verified here is the part
// that's both directly testable and where the actual content risk is:
// this must read as a plain "you're done" notice, never leak internal
// financial or media-lifecycle mechanics.

describe("buildEmail — engagement_completed", () => {
  const { subject, html, text } = buildEmail("engagement_completed", "eng-123");

  it("has a plain, contractor-facing subject and heading", () => {
    expect(subject).toBe("Engagement Completed — Ordift Studios");
    expect(html).toContain("Your engagement has been marked completed");
  });

  it("links to the specific engagement's portal page", () => {
    expect(html).toContain("/portal/collaborator/engagement/eng-123");
    expect(text).toContain("/portal/collaborator/engagement/eng-123");
  });

  it("mentions nothing about payment, payout, backup, purge, or cleanup — those are internal lifecycle details, not part of this notice", () => {
    for (const term of ["payment", "payout", "paid", "backup", "purge", "cleanup", "retain"]) {
      expect(html.toLowerCase()).not.toContain(term);
      expect(text.toLowerCase()).not.toContain(term);
    }
  });
});
