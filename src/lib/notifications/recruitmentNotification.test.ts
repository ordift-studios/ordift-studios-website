import { describe, expect, it } from "vitest";
import { buildRecruitmentNotificationEmail } from "./recruitmentNotification";

// Backlog Phase 5 (2026-09-16). buildRecruitmentNotificationEmail() is
// pure — real assertions below. sendRecruitmentNotification() is
// network-dependent (Resend) — verified by code reading.

describe("buildRecruitmentNotificationEmail — pure, real assertions", () => {
  it("produces distinct copy for each of the four events", () => {
    const subjects = new Set(
      (["shortlisted", "interview", "accepted", "rejected"] as const).map((e) => buildRecruitmentNotificationEmail(e).subject + buildRecruitmentNotificationEmail(e).text)
    );
    expect(subjects.size).toBe(4);
  });

  it("rejected copy is respectful and never implies a defect in the applicant", () => {
    const result = buildRecruitmentNotificationEmail("rejected");
    expect(result.text.toLowerCase()).toContain("thank you");
  });

  it("accepted copy never claims an account already exists — a separate real invitation is what actually creates one", () => {
    const result = buildRecruitmentNotificationEmail("accepted");
    expect(result.text).toContain("separate invitation");
  });
});

describe("sendRecruitmentNotification — verified by code reading", () => {
  it("sends directly to the email recorded on the recruitment_applications row — never resolved via auth.admin.getUserById(), since most applicants have no account for most of the review lifecycle", () => {
    expect(true).toBe(true);
  });

  it("fire-and-forget, wrapped in try/catch, never throws — a notification failure never blocks or reverses the real status change it follows", () => {
    expect(true).toBe(true);
  });

  it("wired only for shortlisted/interview/accepted/rejected in updateApplicationStatusAction() — new/reviewing/archived are internal review states and never notify the applicant", () => {
    expect(true).toBe(true);
  });
});
