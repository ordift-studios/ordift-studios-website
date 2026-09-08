import { describe, expect, it } from "vitest";
import {
  RELEASE_MASTER_CODES,
  isReleaseMasterCode,
  USAGE_RIGHTS_CATEGORIES,
  AI_SYNTHETIC_RIGHTS_CATEGORIES,
  createDefaultReleaseRights,
  isAnyUsageRightGranted,
  isAnyAiSyntheticRightGranted,
  validateReleaseRights,
} from "./rightsCatalogue";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase G.

describe("RELEASE_MASTER_CODES / isReleaseMasterCode", () => {
  it("is exactly OS-LGL-004/005/006", () => {
    expect(RELEASE_MASTER_CODES).toEqual(["OS-LGL-004", "OS-LGL-005", "OS-LGL-006"]);
  });
  it("rejects any other code", () => {
    expect(isReleaseMasterCode("OS-LGL-004")).toBe(true);
    expect(isReleaseMasterCode("OS-LGL-021")).toBe(false);
  });
});

describe("createDefaultReleaseRights — the AI/synthetic NOT-GRANTED default rule", () => {
  it("every usage category defaults to false", () => {
    const rights = createDefaultReleaseRights();
    for (const category of USAGE_RIGHTS_CATEGORIES) {
      expect(rights.usage[category]).toBe(false);
    }
  });

  it("every AI/synthetic category defaults to NOT GRANTED (false) — the explicit rule from the continuation authorization message", () => {
    const rights = createDefaultReleaseRights();
    for (const category of AI_SYNTHETIC_RIGHTS_CATEGORIES) {
      expect(rights.aiSynthetic[category]).toBe(false);
    }
    expect(isAnyAiSyntheticRightGranted(rights.aiSynthetic)).toBe(false);
  });

  it("territory and duration are unset by default — never a silently-assumed scope", () => {
    const rights = createDefaultReleaseRights();
    expect(rights.territory).toBeNull();
    expect(rights.duration).toBeNull();
  });
});

describe("isAnyUsageRightGranted / isAnyAiSyntheticRightGranted", () => {
  it("false for an all-default grant, true once one category flips", () => {
    const rights = createDefaultReleaseRights();
    expect(isAnyUsageRightGranted(rights.usage)).toBe(false);
    rights.usage.portfolio = true;
    expect(isAnyUsageRightGranted(rights.usage)).toBe(true);
  });
});

describe("validateReleaseRights", () => {
  it("an all-default (nothing granted) release is always valid", () => {
    expect(validateReleaseRights(createDefaultReleaseRights())).toEqual({ ok: true });
  });

  it("refuses a granted usage right with no territory", () => {
    const rights = createDefaultReleaseRights();
    rights.usage.website = true;
    expect(validateReleaseRights(rights).ok).toBe(false);
  });

  it("refuses a granted usage right with no duration", () => {
    const rights = createDefaultReleaseRights();
    rights.usage.website = true;
    rights.territory = "worldwide";
    expect(validateReleaseRights(rights).ok).toBe(false);
  });

  it('requires territoryDetail when territory is "specified"', () => {
    const rights = createDefaultReleaseRights();
    rights.usage.print = true;
    rights.territory = "specified";
    rights.duration = "perpetual";
    expect(validateReleaseRights(rights).ok).toBe(false);
    rights.territoryDetail = "Ghana and the United Kingdom only";
    expect(validateReleaseRights(rights).ok).toBe(true);
  });

  it('requires durationEndDate when duration is "fixed_term"', () => {
    const rights = createDefaultReleaseRights();
    rights.usage.paid_advertising = true;
    rights.territory = "worldwide";
    rights.duration = "fixed_term";
    expect(validateReleaseRights(rights).ok).toBe(false);
    rights.durationEndDate = "2027-01-01";
    expect(validateReleaseRights(rights).ok).toBe(true);
  });

  it("a fully-populated valid grant passes", () => {
    const rights = createDefaultReleaseRights();
    rights.usage.organic_social = true;
    rights.usage.website = true;
    rights.territory = "project_country_only";
    rights.duration = "project_only";
    expect(validateReleaseRights(rights)).toEqual({ ok: true });
  });

  it("granting an AI/synthetic category alone (no usage right) requires no territory/duration — it is not a usage-scope grant", () => {
    const rights = createDefaultReleaseRights();
    rights.aiSynthetic.ai_training = true;
    expect(validateReleaseRights(rights)).toEqual({ ok: true });
  });
});
