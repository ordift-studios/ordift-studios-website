// Ordift Partnerships & Collaborations V1 (2026-09-07) — referral
// anti-gaming safeguards. Pure, zero-import. A referral lead is
// assessed against every disqualifying condition independently — every
// applicable reason is collected, not just the first one found, so an
// Admin reviewing a disputed/borderline case sees the full picture.

export type ReferralIneligibilityReason =
  | "already_client"
  | "active_enquiry"
  | "in_pipeline"
  | "already_attributed"
  | "self_referral"
  | "duplicate_referral"
  | "circular_referral"
  | "undisclosed_related_party"
  | "employee_assigned_client";

export type ReferralEligibilityFlags = {
  isAlreadyClient?: boolean;
  hasActiveEnquiry?: boolean;
  alreadyInPipeline?: boolean;
  alreadyAttributedToOther?: boolean;
  isSelfReferral?: boolean;
  isDuplicateReferral?: boolean;
  isCircularReferral?: boolean;
  isRelatedParty?: boolean;
  relatedPartyDisclosed?: boolean;
  isEmployeeAssignedClient?: boolean;
};

export type ReferralEligibilityResult = {
  eligible: boolean;
  blockingReasons: ReferralIneligibilityReason[];
  requiresDisclosureReview: boolean;
};

export function assessReferralEligibility(flags: ReferralEligibilityFlags): ReferralEligibilityResult {
  const blockingReasons: ReferralIneligibilityReason[] = [];

  if (flags.isAlreadyClient) blockingReasons.push("already_client");
  if (flags.hasActiveEnquiry) blockingReasons.push("active_enquiry");
  if (flags.alreadyInPipeline) blockingReasons.push("in_pipeline");
  if (flags.alreadyAttributedToOther) blockingReasons.push("already_attributed");
  if (flags.isSelfReferral) blockingReasons.push("self_referral");
  if (flags.isDuplicateReferral) blockingReasons.push("duplicate_referral");
  if (flags.isCircularReferral) blockingReasons.push("circular_referral");
  if (flags.isEmployeeAssignedClient) blockingReasons.push("employee_assigned_client");
  // A related-party referral is blocked ONLY when undisclosed — a
  // disclosed one is not a hard block, just a mandatory review (see
  // requiresDisclosureReview below), per "Related-party referrals
  // require disclosure and authorized review."
  if (flags.isRelatedParty && !flags.relatedPartyDisclosed) blockingReasons.push("undisclosed_related_party");

  return {
    eligible: blockingReasons.length === 0,
    blockingReasons,
    requiresDisclosureReview: Boolean(flags.isRelatedParty && flags.relatedPartyDisclosed),
  };
}
