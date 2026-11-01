import { describe, expect, it } from "vitest";
import { summariseStanding, validateAdminPermission, validateReview, type AdminPermissionInput } from "./permissionModel";
import { createHash } from "node:crypto";
import { DESTINATION_KEYS } from "./destinations";
import { PERMISSION_TEXT_APPROVED, PERMISSION_TEXT, PERMISSION_TEXT_VERSION } from "./permissionText";

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
    expect(validateReview({ decision: "approved", destinations: ["website"], checks: all, notes: "", people: "none" })).toEqual([]);
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

describe("client permission wording, draft 3 (unapproved)", () => {
  const WORDING_SHA256: Record<string, string> = { "mkt-permission-draft-3": "edecf40db70d8de331cb636cb433bce119181386b41421ed86e3c0bafc4043b6" };
  it("stays unapproved and never treats payment or commissioning as permission", () => {
    expect(PERMISSION_TEXT_APPROVED).toBe(false);
    expect(PERMISSION_TEXT.intro).toContain("does not, by itself, give Ordift Studios permission");
    expect(PERMISSION_TEXT.intro).toContain("including saying no");
    expect(PERMISSION_TEXT.selection).toContain("each identified by a preview and an image number");
  });
  it("each recorded destination has its own use line, in the same order and nothing else", () => {
    expect(Object.keys(PERMISSION_TEXT.uses)).toEqual([...DESTINATION_KEYS].sort((a, b) => Object.keys(PERMISSION_TEXT.uses).indexOf(a) - Object.keys(PERMISSION_TEXT.uses).indexOf(b)));
    expect(Object.keys(PERMISSION_TEXT.uses).sort()).toEqual([...DESTINATION_KEYS].sort());
  });
  it("covers the client only, protects children and other people, forbids sale/licensing/unrelated reuse and promises no recall", () => {
    expect(PERMISSION_TEXT.rightsOfOthers).toContain("not treated as permission from anyone else");
    expect(PERMISSION_TEXT.minors).toContain("parent or guardian");
    expect(PERMISSION_TEXT.limitsOnReuse).toMatch(/not sell or license them.*unrelated third parties/);
    expect(PERMISSION_TEXT.withdrawal).toContain("We cannot recall material that is outside our control");
    expect(PERMISSION_TEXT.record).toContain("the wording you saw");
  });
  it("the version string is pinned to the exact wording: any edit must change the version", () => {
    const sha = createHash("sha256").update(JSON.stringify(PERMISSION_TEXT)).digest("hex");
    expect(WORDING_SHA256[PERMISSION_TEXT_VERSION], "new wording needs a new PERMISSION_TEXT_VERSION and a new pin").toBe(sha);
  });
});

describe("people and property shown: a tick is not evidence", () => {
  const all = { confidentiality: true, embargo: true, contractual_restrictions: true, release_rights: true, quality: true };
  const base = { decision: "approved" as const, destinations: ["website"], checks: all, notes: "" };
  it("approval needs an explicit statement about people shown", () => {
    expect(validateReview({ ...base }).join()).toMatch(/State whether identifiable people/);
    expect(validateReview({ ...base, people: "none" })).toEqual([]);
  });
  it("where people, a child or property are shown, a written evidence reference is required; without it the photograph cannot be approved", () => {
    expect(validateReview({ ...base, people: "evidenced" }).join()).toMatch(/evidence reference/);
    expect(validateReview({ ...base, people: "evidenced", peopleEvidence: "yes" }).join()).toMatch(/evidence reference/);
    expect(validateReview({ ...base, people: "evidenced", peopleEvidence: "Guardian email 3 Nov, kept in job folder" })).toEqual([]);
  });
});
