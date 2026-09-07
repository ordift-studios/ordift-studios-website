// Ordift Partnerships & Collaborations V1 (2026-09-07) — value-class
// governance. Pure, zero-import. Three classes, per the approved spec:
//
// CLASS A — hard/replacement value (cash, accommodation Ordift
//   genuinely requires, venue/equipment Ordift would otherwise rent,
//   a production service Ordift would otherwise purchase). Recognised
//   up to verified reasonable/replacement value — never blind retail
//   price; that verification is a human judgement call recorded on the
//   RCV record (valuationMethod/reason), not something this module
//   computes.
// CLASS B — measurable commercial value (contracted media inventory,
//   guaranteed distribution, verified ad placement, qualified leads,
//   demonstrable event access, measurable promotion with evidence).
//   Automatically recognisable only up to 50% of NCV without higher
//   approval.
// CLASS C — speculative value (exposure, follower count alone, "could
//   go viral", celebrity attendance, networking, tags/mentions,
//   possible future work, vague referrals, goodwill). Default monetary
//   RCV is ALWAYS $0 — these factors may influence Strategic Score,
//   never the commercial value owed to Ordift.

export type PartnershipValueClass = "class_a_hard_replacement" | "class_b_measurable_commercial" | "class_c_speculative";

// The one, single, structural rule enforcing "Class C exposure defaults
// to monetary RCV $0" and "follower count alone cannot automatically
// create RCV": for Class C, whatever amount was claimed/proposed is
// simply never used as the monetary RCV — this function returns 0
// unconditionally for that class, regardless of what's passed in.
export function defaultMonetaryRcvForClass(valueClass: PartnershipValueClass, claimedOrProposedAmountUsd: number): number {
  if (valueClass === "class_c_speculative") return 0;
  return Math.max(0, Math.round(claimedOrProposedAmountUsd * 100) / 100);
}

// "Without higher approval, automatically recognised Class B value
// must not exceed 50% of NCV." A non-positive NCV can never safely
// auto-approve anything, so it also requires higher approval.
export function classBRequiresHigherApproval(rcvAmountUsd: number, ncvUsd: number): boolean {
  if (ncvUsd <= 0) return true;
  return rcvAmountUsd > ncvUsd * 0.5;
}

// Every RCV record must independently confirm whether it requires
// escalated approval, purely from its own value class and amount —
// Class A/C never trigger this specific 50%-of-NCV rule (Class A is
// governed by replacement-value verification instead; Class C is
// always $0), only Class B is.
export function rcvRequiresHigherApproval(valueClass: PartnershipValueClass, rcvAmountUsd: number, ncvUsd: number): boolean {
  if (valueClass !== "class_b_measurable_commercial") return false;
  return classBRequiresHigherApproval(rcvAmountUsd, ncvUsd);
}
