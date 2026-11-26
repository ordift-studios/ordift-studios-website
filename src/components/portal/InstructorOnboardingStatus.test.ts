import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InstructorOnboardingStatus } from "./InstructorOnboardingStatus";
import { buildInstructorOnboardingView, type InstructorOnboardingFacts } from "@/lib/organization/instructorOnboardingView";

const facts = (o: Partial<InstructorOnboardingFacts> = {}): InstructorOnboardingFacts => ({
  onboarding: { stage: "profile", status: "in_progress" }, representativeName: null,
  agreement: { reference: "SYN-1", status: "fully_executed", executed: true, effectiveDate: "2027-01-01", expiryDate: "2027-12-31", ongoing: false, copyAvailable: false },
  standards: { state: "pending", versionLabel: "1.0" }, payment: { profileExists: false, instructionCount: 0, verifiedCount: 0 }, identity: { applicable: false, done: false }, schedules: { total: 0, approved: 0 }, ...o,
});
const html = (f: InstructorOnboardingFacts, name: string | null = "Kwaku") => renderToStaticMarkup(createElement(InstructorOnboardingStatus, { view: buildInstructorOnboardingView(f), firstName: name }));

describe("instructor dashboard status", () => {
  it("welcomes the person, shows ONE prominent action to the acknowledgment page, and the other items without invented progress", () => {
    const h = html(facts());
    expect(h).toContain("Welcome, Kwaku.");
    expect(h).toContain("Please complete the outstanding requirement below");
    expect(h).toContain('data-testid="instructor-primary-action"');
    expect(h).toContain('href="/portal/instructor/standards"');
    expect(h).toContain("Review &amp; acknowledge standards");
    expect(h).toContain("Executed");
    expect(h).toContain("Effective 1 January 2027");
    expect(h).toContain("Not yet requested");
    expect(h).toContain("Upcoming");
    expect(h).not.toMatch(/\d+\s*%/); // no invented completion percentage
    expect(h.match(/instructor\/standards/g)).toHaveLength(1); // one path, not several
  });
  it("shows no action prompt once the standards are acknowledged", () => {
    const h = html(facts({ standards: { state: "acknowledged", versionLabel: "1.0" } }));
    expect(h).not.toContain("instructor-primary-action");
    expect(h).toContain("Nothing is waiting for you right now");
    expect(h).toContain("Acknowledged");
  });
  it("never invents a representative or a name", () => {
    expect(html(facts(), null)).toContain("Welcome.");
    expect(html(facts())).not.toContain("onboarding representative");
  });
});
