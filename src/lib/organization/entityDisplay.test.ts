import { describe, expect, it } from "vitest";
import { buildEntityDisplay } from "./entityDisplay";

const reg = (kind: string, over: Partial<{ status: string; identifier: string | null; expiresOn: string | null; verifiedAt: string | null }> = {}) => ({ kind, status: "active", identifier: "ID-" + kind, expiresOn: null, verifiedAt: "2026-10-01T00:00:00Z", ...over });
const qatar = { name: "Ordift Studios (Qatar)", legal_name: "ORDIFT STUDIOS", registration_type: "Single-Member Limited Liability Company (W.L.L.)" };

describe("what a client-facing quotation may say about the contracting entity", () => {
  it("shows the legal name (not the internal short name) and the registration type", () => {
    const d = buildEntityDisplay(qatar, [], "2026-10-26");
    expect(d).toEqual({ legalName: "ORDIFT STUDIOS", registrationType: "Single-Member Limited Liability Company (W.L.L.)", identifiers: [] });
    expect(JSON.stringify(d)).not.toContain("(Qatar)");
  });
  it("falls back to the entity name when no legal name is recorded, and shows nothing it does not have (no invented details)", () => {
    expect(buildEntityDisplay({ name: "Ordift Studios", legal_name: null, registration_type: null }, [], "2026-10-26")).toEqual({ legalName: "Ordift Studios", registrationType: null, identifiers: [] });
  });
  it("shows only current, verified commercial-registration and tax identifiers", () => {
    const d = buildEntityDisplay(qatar, [reg("commercial_registration"), reg("tax_registration")], "2026-10-26");
    expect(d.identifiers.map((i) => i.label)).toEqual(["Commercial Registration (CR) No.", "Tax registration No."]);
    expect(d.identifiers[0].identifier).toBe("ID-commercial_registration");
  });
  it("leaves out an unverified, expired, superseded or empty registration", () => {
    const d = buildEntityDisplay(qatar, [reg("commercial_registration", { verifiedAt: null }), reg("tax_registration", { expiresOn: "2026-10-01" })], "2026-10-26");
    expect(d.identifiers).toEqual([]);
    expect(buildEntityDisplay(qatar, [reg("commercial_registration", { status: "superseded" }), reg("tax_registration", { identifier: "  " })], "2026-10-26").identifiers).toEqual([]);
  });
  it("never exposes any other governance record: establishment card, articles, chamber, permit, investment condition", () => {
    const all = ["establishment_card", "articles_of_association", "chamber_membership", "commercial_permit", "investment_approval_condition", "trade_name_reservation"].map((k) => reg(k));
    const d = buildEntityDisplay(qatar, all, "2026-10-26");
    expect(d.identifiers).toEqual([]);
    expect(JSON.stringify(d)).not.toMatch(/ID-/);
  });
  it("the result carries no internal field at all (ids, who chose it, why, when)", () => {
    expect(Object.keys(buildEntityDisplay(qatar, [reg("commercial_registration")], "2026-10-26")).sort()).toEqual(["identifiers", "legalName", "registrationType"]);
  });
});
