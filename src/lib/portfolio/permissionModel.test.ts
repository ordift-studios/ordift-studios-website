import { describe, expect, it } from "vitest";
import { summariseStanding, validateAdminPermission, validateReview, type AdminPermissionInput } from "./permissionModel";
import { PERMISSION_TEXT_APPROVED, PERMISSION_TEXT } from "./permissionText";

const base: AdminPermissionInput = { decision: "granted", grantorName: "Synthetic Grantor", grantorCapacity: "client", destinations: ["portfolio"], fileIds: null, restrictions: "", expiresOn: "", method: "message", grantedOn: "", evidenceSummary: "message thread confirming the use", note: "" };

describe("administrator-recorded permission", () => {
  it("accepts a complete record and never requires or invents a date", () => expect(validateAdminPermission(base, "2026-10-24")).toEqual([]));
  it("needs who, capacity, how, evidence and at least one use", () => {
    expect(validateAdminPermission({ ...base, grantorName: "", grantorCapacity: "", method: "", evidenceSummary: "x", destinations: [] }, "2026-10-24").length).toBe(5);
  });
  it("refuses a future authorisation date and a past expiry, accepts a blank date", () => {
    expect(validateAdminPermission({ ...base, grantedOn: "2026-12-01" }, "2026-10-24").join()).toMatch(/future/);
    expect(validateAdminPermission({ ...base, expiresOn: "2026-01-01" }, "2026-10-24").join()).toMatch(/today or later/);
    expect(validateAdminPermission({ ...base, grantedOn: "" }, "2026-10-24")).toEqual([]);
  });
  it("a decline or withdrawal needs a note rather than uses", () => {
    expect(validateAdminPermission({ ...base, decision: "declined", destinations: [], note: "" }, "2026-10-24").join()).toMatch(/why/);
    expect(validateAdminPermission({ ...base, decision: "withdrawn", destinations: [], note: "client asked to stop" }, "2026-10-24")).toEqual([]);
  });
  it("an unknown use is refused", () => expect(validateAdminPermission({ ...base, destinations: ["billboard"] }, "2026-10-24").join()).toMatch(/not recognised/));
});

describe("internal approval", () => {
  const all = { confidentiality: true, embargo: true, contractual_restrictions: true, release_rights: true, quality: true };
  it("approval needs every check and a destination", () => {
    expect(validateReview({ decision: "approved", destinations: ["website"], checks: all, notes: "" })).toEqual([]);
    expect(validateReview({ decision: "approved", destinations: ["website"], checks: { ...all, quality: false }, notes: "" }).join()).toMatch(/quality|standard/);
    expect(validateReview({ decision: "approved", destinations: [], checks: all, notes: "" }).join()).toMatch(/where/);
  });
  it("rejection, return and revocation need a reason", () => {
    for (const d of ["rejected", "returned", "revoked"] as const) expect(validateReview({ decision: d, destinations: [], checks: {}, notes: "" }).length).toBe(1);
    expect(validateReview({ decision: "revoked", destinations: [], checks: {}, notes: "quality concern" })).toEqual([]);
  });
});

describe("standing summary", () => {
  const row = (destination: string, rightsReason: string, internalReason: string) => ({ destination, eligible: rightsReason === "permission_in_force" && internalReason === "approved", rightsReason, internalReason });
  it("is not-cleared by default", () => {
    const s = summariseStanding([row("portfolio", "no_permission_on_record", "no_internal_review")]);
    expect(s.permission).toBe("No permission on record");
    expect(s.usable).toEqual([]);
  });
  it("lists a use only when BOTH stages hold", () => {
    expect(summariseStanding([row("portfolio", "permission_in_force", "no_internal_review")]).usable).toEqual([]);
    expect(summariseStanding([row("portfolio", "permission_in_force", "approved")]).usable).toEqual(["portfolio"]);
  });
  it("shows a withdrawal prominently", () => expect(summariseStanding([row("portfolio", "declined_or_withdrawn", "approved")]).permission).toMatch(/withdrawn/));
});

describe("client permission wording", () => {
  it("is a draft that stays unapproved until the Founder approves it, and preselects nothing", () => {
    expect(PERMISSION_TEXT_APPROVED).toBe(false);
    expect(PERMISSION_TEXT.scope).toContain("Nothing is ticked for you");
    expect(PERMISSION_TEXT.intro).toContain("optional");
  });
});
