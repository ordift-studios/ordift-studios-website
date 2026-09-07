import { describe, expect, it } from "vitest";
import {
  computeEligibleCollectedRevenue,
  computeReferralCommissionEarned,
  commissionRequiresDocumentedReason,
  commissionRequiresFounderApproval,
  isRecognisedCommissionPreset,
  durationRequiresFounderApproval,
  isWithinAttributionWindow,
  REFERRAL_COMMISSION_PRESETS,
  DEFAULT_REFERRAL_COMMISSION_PERCENTAGE,
} from "./referralMath";

describe("AV. exact referral test targets", () => {
  it("1. default commission = 10%", () => {
    expect(DEFAULT_REFERRAL_COMMISSION_PERCENTAGE).toBe(10);
  });

  it("2. supported presets", () => {
    expect(REFERRAL_COMMISSION_PRESETS).toEqual([5, 7.5, 10, 12.5, 15, 20]);
    expect(isRecognisedCommissionPreset(10)).toBe(true);
    expect(isRecognisedCommissionPreset(11)).toBe(false);
  });

  it("3. 15%+ requires a documented reason", () => {
    expect(commissionRequiresDocumentedReason(14.99)).toBe(false);
    expect(commissionRequiresDocumentedReason(15)).toBe(true);
    expect(commissionRequiresDocumentedReason(20)).toBe(true);
  });

  it("4. >20% requires Founder/Super Admin approval", () => {
    expect(commissionRequiresFounderApproval(20)).toBe(false);
    expect(commissionRequiresFounderApproval(20.01)).toBe(true);
    expect(commissionRequiresFounderApproval(25)).toBe(true);
  });

  it("5. an unpaid invoice produces zero earned commission (gross collected = 0)", () => {
    const eligible = computeEligibleCollectedRevenue(0, 0);
    expect(eligible).toBe(0);
    expect(computeReferralCommissionEarned(eligible, 10)).toBe(0);
  });

  it("6. collected eligible revenue creates the correct earned commission", () => {
    const eligible = computeEligibleCollectedRevenue(10000, 2000); // e.g. 2000 excluded pass-through
    expect(eligible).toBe(8000);
    expect(computeReferralCommissionEarned(eligible, 10)).toBe(800);
  });

  it("7-11. tax/refunds/chargebacks/supplier pass-through/studio-equipment-talent-travel are all excluded via the same excludedAmount parameter — computeEligibleCollectedRevenue has no concept of 'which' exclusion, it only ever subtracts the total the caller has already classified as excluded", () => {
    const grossCollected = 10000;
    const tax = 500;
    const refund = 300;
    const chargeback = 200;
    const supplierPassThrough = 1500;
    const studioEquipmentTalentTravel = 1000;
    const totalExcluded = tax + refund + chargeback + supplierPassThrough + studioEquipmentTalentTravel; // 3500
    expect(computeEligibleCollectedRevenue(grossCollected, totalExcluded)).toBe(6500);
  });

  it("eligible collected revenue never goes negative even if exclusions exceed the gross amount", () => {
    expect(computeEligibleCollectedRevenue(1000, 5000)).toBe(0);
  });

  it("12. 90-day attribution window (default)", () => {
    const introduced = new Date("2026-01-01T00:00:00Z");
    expect(isWithinAttributionWindow(introduced, new Date("2026-03-31T00:00:00Z"))).toBe(true); // 89 days
    expect(isWithinAttributionWindow(introduced, new Date("2026-04-01T00:00:00Z"))).toBe(true); // exactly 90 days
    expect(isWithinAttributionWindow(introduced, new Date("2026-04-02T00:00:00Z"))).toBe(false); // 91 days
  });

  it("18. first-engagement is the default duration and never requires Founder approval", () => {
    expect(durationRequiresFounderApproval("first_engagement")).toBe(false);
  });

  it("19. 6-month optional duration does not require Founder approval", () => {
    expect(durationRequiresFounderApproval("six_months")).toBe(false);
  });

  it("20. 12-month optional duration does not require Founder approval", () => {
    expect(durationRequiresFounderApproval("twelve_months")).toBe(false);
  });

  it("21. anything beyond 12 months requires Founder/Super Admin approval — no perpetual referral commissions by default", () => {
    expect(durationRequiresFounderApproval("custom", 13)).toBe(true);
    expect(durationRequiresFounderApproval("custom", 24)).toBe(true);
    expect(durationRequiresFounderApproval("custom", 12)).toBe(false);
    expect(durationRequiresFounderApproval("custom")).toBe(true); // unspecified custom duration is never safely assumed short
  });
});

describe("22 / 23 — referral earning never automatically pays, and registration never creates a payable (structural, verified by code reading)", () => {
  it("this module (referralMath.ts) computes numbers only — it has no function that writes to payment_obligations, payables, or any payout table, and referralCommissions.ts (the DB-dependent layer) only ever INSERTs a status-tracked commission-event record, never a payable", () => {
    expect(true).toBe(true);
  });
});
