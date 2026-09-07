import { describe, expect, it } from "vitest";
import { assessReferralEligibility } from "./referralEligibility";

describe("AV. exact anti-gaming test targets", () => {
  it("13. existing client is ineligible", () => {
    const r = assessReferralEligibility({ isAlreadyClient: true });
    expect(r.eligible).toBe(false);
    expect(r.blockingReasons).toContain("already_client");
  });

  it("14. existing active enquiry is ineligible", () => {
    const r = assessReferralEligibility({ hasActiveEnquiry: true });
    expect(r.eligible).toBe(false);
    expect(r.blockingReasons).toContain("active_enquiry");
  });

  it("15. duplicate referral is detected", () => {
    const r = assessReferralEligibility({ isDuplicateReferral: true });
    expect(r.eligible).toBe(false);
    expect(r.blockingReasons).toContain("duplicate_referral");
  });

  it("16. self-referral is rejected", () => {
    const r = assessReferralEligibility({ isSelfReferral: true });
    expect(r.eligible).toBe(false);
    expect(r.blockingReasons).toContain("self_referral");
  });

  it("17. related-party requires review — disclosed is not a hard block, undisclosed is", () => {
    const disclosed = assessReferralEligibility({ isRelatedParty: true, relatedPartyDisclosed: true });
    expect(disclosed.eligible).toBe(true);
    expect(disclosed.requiresDisclosureReview).toBe(true);

    const undisclosed = assessReferralEligibility({ isRelatedParty: true, relatedPartyDisclosed: false });
    expect(undisclosed.eligible).toBe(false);
    expect(undisclosed.blockingReasons).toContain("undisclosed_related_party");
  });

  it("already in pipeline is ineligible", () => {
    expect(assessReferralEligibility({ alreadyInPipeline: true }).eligible).toBe(false);
  });

  it("already attributed to another source/partner is ineligible", () => {
    expect(assessReferralEligibility({ alreadyAttributedToOther: true }).eligible).toBe(false);
  });

  it("circular/collusive referral is rejected", () => {
    expect(assessReferralEligibility({ isCircularReferral: true }).eligible).toBe(false);
  });

  it("an employee claiming commission for ordinary assigned client acquisition is rejected", () => {
    expect(assessReferralEligibility({ isEmployeeAssignedClient: true }).eligible).toBe(false);
  });

  it("a genuinely clean referral is eligible with no reasons and no review requirement", () => {
    const r = assessReferralEligibility({});
    expect(r.eligible).toBe(true);
    expect(r.blockingReasons).toEqual([]);
    expect(r.requiresDisclosureReview).toBe(false);
  });

  it("multiple simultaneous disqualifying conditions are all reported, not just the first", () => {
    const r = assessReferralEligibility({ isSelfReferral: true, isDuplicateReferral: true, isAlreadyClient: true });
    expect(r.blockingReasons).toEqual(expect.arrayContaining(["self_referral", "duplicate_referral", "already_client"]));
    expect(r.blockingReasons.length).toBe(3);
  });
});
