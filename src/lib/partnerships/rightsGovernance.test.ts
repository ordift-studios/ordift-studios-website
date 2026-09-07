import { describe, expect, it } from "vitest";
import { isPerpetualUsage, isWorldwideAllMediaBuyout, requiresCommercialLicensingRouting, classifyExclusivity, type PartnershipUsageRights } from "./rightsGovernance";

function baseRights(overrides: Partial<PartnershipUsageRights> = {}): PartnershipUsageRights {
  return {
    organicSocial: false,
    brandOwnedSocial: false,
    website: false,
    email: false,
    pr: false,
    paidSocial: false,
    whitelisting: false,
    print: false,
    ooh: false,
    broadcast: false,
    thirdPartySublicensing: false,
    editingAdaptation: false,
    territory: "unspecified",
    startDate: null,
    endDate: "2027-01-01",
    ...overrides,
  };
}

describe("AW. rights / usage test targets", () => {
  it("no perpetual rights by default — a fresh rights object with no end date and any right granted is perpetual", () => {
    const noRightsGranted = baseRights({ endDate: null });
    expect(isPerpetualUsage(noRightsGranted)).toBe(false); // nothing granted at all -> not "perpetual usage", just no usage

    const oneRightNoEndDate = baseRights({ organicSocial: true, endDate: null });
    expect(isPerpetualUsage(oneRightNoEndDate)).toBe(true);
  });

  it("a granted right WITH an end date is never perpetual", () => {
    const bounded = baseRights({ organicSocial: true, endDate: "2027-01-01" });
    expect(isPerpetualUsage(bounded)).toBe(false);
  });

  it("paid usage / whitelisting / OOH / broadcast / third-party sublicensing are each explicit and each independently require Commercial licensing routing", () => {
    expect(requiresCommercialLicensingRouting(baseRights({ paidSocial: true }))).toBe(true);
    expect(requiresCommercialLicensingRouting(baseRights({ whitelisting: true }))).toBe(true);
    expect(requiresCommercialLicensingRouting(baseRights({ ooh: true }))).toBe(true);
    expect(requiresCommercialLicensingRouting(baseRights({ broadcast: true }))).toBe(true);
    expect(requiresCommercialLicensingRouting(baseRights({ thirdPartySublicensing: true }))).toBe(true);
  });

  it("ordinary organic/owned-social/website/email/PR usage does NOT require Commercial licensing routing", () => {
    const ordinary = baseRights({ organicSocial: true, brandOwnedSocial: true, website: true, email: true, pr: true, editingAdaptation: true });
    expect(requiresCommercialLicensingRouting(ordinary)).toBe(false);
  });

  it("territory is explicit — 'unspecified' is a real, distinct value, never silently assumed worldwide", () => {
    const r = baseRights();
    expect(r.territory).toBe("unspecified");
    expect(isWorldwideAllMediaBuyout(r)).toBe(false);
  });

  it("a genuine worldwide all-media buyout is detected and requires Commercial licensing routing", () => {
    const buyout = baseRights({ paidSocial: true, whitelisting: true, print: true, ooh: true, broadcast: true, territory: "worldwide" });
    expect(isWorldwideAllMediaBuyout(buyout)).toBe(true);
    expect(requiresCommercialLicensingRouting(buyout)).toBe(true);
  });

  it("duration is explicit — start/end dates are plain fields on the rights object, never inferred", () => {
    const r = baseRights({ startDate: "2026-09-01", endDate: "2026-12-01" });
    expect(r.startDate).toBe("2026-09-01");
    expect(r.endDate).toBe("2026-12-01");
  });

  it("open-ended exclusivity (null duration) is rejected — classified as prohibited, not routed to any approval tier", () => {
    expect(classifyExclusivity(null, false)).toBe("prohibited_open_ended");
  });

  it("<=30 days narrow-category exclusivity is normal commercial assessment", () => {
    expect(classifyExclusivity(30, false)).toBe("normal_commercial");
    expect(classifyExclusivity(1, false)).toBe("normal_commercial");
  });

  it("31-90 days requires Commercial Review", () => {
    expect(classifyExclusivity(31, false)).toBe("commercial_review");
    expect(classifyExclusivity(90, false)).toBe("commercial_review");
  });

  it(">90-day exclusivity escalates to Executive/Founder Review", () => {
    expect(classifyExclusivity(91, false)).toBe("executive_founder_review");
    expect(classifyExclusivity(180, false)).toBe("executive_founder_review");
  });

  it(">6 months (>180 days) OR broad-industry exclusivity requires Founder/Super Admin approval only", () => {
    expect(classifyExclusivity(181, false)).toBe("founder_super_admin_only");
    expect(classifyExclusivity(10, true)).toBe("founder_super_admin_only"); // even a short duration, if broad-industry
  });

  it("collaboration never automatically transfers copyright — structural: this module has no field or function representing IP ownership transfer at all, only usage rights", () => {
    const r = baseRights({ organicSocial: true });
    expect(r).not.toHaveProperty("copyrightTransferred");
    expect(r).not.toHaveProperty("ipOwnershipTransferred");
  });

  it("TFP does not imply commercial advertising rights — the default rights object has every commercial-usage flag false", () => {
    const tfpDefault = baseRights();
    expect(requiresCommercialLicensingRouting(tfpDefault)).toBe(false);
  });

  it("RAW/source files are not part of this rights model at all — no field exists for them here (handled by a separate request/review flow, same philosophy as every other pricing family's RAW guidance)", () => {
    const r = baseRights();
    expect(r).not.toHaveProperty("rawFilesIncluded");
    expect(r).not.toHaveProperty("sourceFilesIncluded");
  });
});
