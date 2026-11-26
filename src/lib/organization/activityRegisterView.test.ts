import { describe, expect, it } from "vitest";
import { buildActivityRegister, checkActivityEvidence, evidenceStateOf, type EvidenceOption } from "./activityRegisterView";
import { assessEntityForQuotation, type EntityFacts } from "./jurisdictionRequirements";
import type { RegistrationFact } from "./entityRegistry";

const TODAY = "2026-11-26";
const reg = (o: Partial<RegistrationFact> & { id: string; kind: RegistrationFact["kind"] }): RegistrationFact => ({ status: "active", identifier: null, issuedOn: null, expiresOn: "2027-10-15", facts: {}, note: null, verifiedAt: "2026-10-26T00:00:00Z", ...o });
const facts = (registrations: RegistrationFact[]): EntityFacts => ({
  name: "E", legalName: "E W.L.L.", registrationType: "WLL", active: true, verified: true, jurisdictionName: "Qatar", registrations, signatories: [], activities: [],
  activityLabels: { photography: "Photography", videography: "Videography" }, activityCodes: [{ code: "742010", activityKey: "photography" }],
});
const CR = reg({ id: "cr", kind: "commercial_registration", identifier: "254551", facts: { activities: [{ code: "742010" }] } });
const PERMIT = reg({ id: "pm", kind: "commercial_permit", identifier: "345520", facts: { activities: [{ code: "742010" }] } });

describe("evidenceStateOf", () => {
  it("separates usable, unverified, expired and not-active evidence", () => {
    expect(evidenceStateOf({ status: "active", verifiedAt: "x", expiresOn: "2027-01-01" }, TODAY)).toBe("usable");
    expect(evidenceStateOf({ status: "active", verifiedAt: null, expiresOn: null }, TODAY)).toBe("unverified");
    expect(evidenceStateOf({ status: "active", verifiedAt: "x", expiresOn: "2026-11-25" }, TODAY)).toBe("expired");
    expect(evidenceStateOf({ status: "active", verifiedAt: "x", expiresOn: TODAY }, TODAY)).toBe("usable");
    expect(evidenceStateOf({ status: "pending", verifiedAt: "x", expiresOn: null }, TODAY)).toBe("not_active");
  });
});

describe("checkActivityEvidence", () => {
  const ev = (o: Partial<EvidenceOption>): EvidenceOption => ({ id: "e", kind: "commercial_permit", label: "Commercial Permit", identifier: "1", expiresOn: null, state: "usable", listsActivities: ["photography"], ...o });
  it("accepts verified, in-date evidence that lists the activity", () => expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({}) })).toEqual({ ok: true }));
  it("refuses missing, unverified, expired, inactive and non-listing evidence, each with its own reason", () => {
    expect(checkActivityEvidence({ activityKey: "photography", evidence: undefined })).toMatchObject({ ok: false });
    expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({ state: "unverified" }) })).toMatchObject({ ok: false, error: expect.stringContaining("not been verified") });
    expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({ state: "expired", expiresOn: "2026-01-01" }) })).toMatchObject({ ok: false, error: expect.stringContaining("expired on 2026-01-01") });
    expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({ state: "not_active" }) })).toMatchObject({ ok: false });
    expect(checkActivityEvidence({ activityKey: "videography", evidence: ev({}) })).toMatchObject({ ok: false, error: expect.stringContaining("does not list") });
  });
  it("refuses a verified, in-date document that is not a licensing document (an Establishment Card, a tax card)", () => {
    expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({ kind: "establishment_card", label: "Establishment Card", listsActivities: null }) })).toMatchObject({ ok: false, error: expect.stringContaining("not a licensing document") });
    expect(checkActivityEvidence({ activityKey: "photography", evidence: ev({ kind: "tax_registration", label: "Tax registration", listsActivities: null }) })).toMatchObject({ ok: false });
  });
  it("does not require a listing from evidence that does not list activities (for example an activity licence)", () => {
    expect(checkActivityEvidence({ activityKey: "drone_operations", evidence: ev({ kind: "activity_licence", listsActivities: null }) })).toEqual({ ok: true });
  });
});

describe("buildActivityRegister", () => {
  const types = [{ key: "photography", label: "Photography" }, { key: "videography", label: "Videography" }];
  const f = facts([CR, PERMIT]);
  const build = (records: Parameters<typeof buildActivityRegister>[0]["records"], today = TODAY) => buildActivityRegister({ facts: f, assessment: assessEntityForQuotation(f, [], types.map((t) => t.key), today), records, types, today, registrationLabel: (k) => k });
  it("lists every activity and attaches the printed code that stands for it", () => {
    const { rows } = build([]);
    expect(rows.map((r) => [r.key, r.printedCode, r.record])).toEqual([["photography", "742010", null], ["videography", null, null]]);
  });
  it("offers each registration as evidence and says which activities a CR or permit lists", () => {
    const { evidence } = build([]);
    expect(evidence.find((e) => e.id === "pm")).toMatchObject({ state: "usable", listsActivities: ["photography"] });
  });
  it("warns when a licensed record relies on evidence that is gone, expired or does not list the activity", () => {
    const gone = build([{ activityKey: "photography", status: "licensed", evidenceRegistrationId: "missing", note: null, recordedByLabel: "0001", updatedAt: null }]).rows[0];
    expect(gone.warnings.join(" ")).toMatch(/no longer on file/);
    const expired = build([{ activityKey: "photography", status: "licensed", evidenceRegistrationId: "pm", note: null, recordedByLabel: null, updatedAt: null }], "2028-01-01").rows[0];
    expect(expired.warnings.join(" ")).toMatch(/expired/);
    const wrong = build([{ activityKey: "videography", status: "licensed", evidenceRegistrationId: "pm", note: null, recordedByLabel: null, updatedAt: null }]).rows[1];
    expect(wrong.warnings.join(" ")).toMatch(/does not list this activity/);
  });
  it("never shows a recorder's name: only the member number the caller supplied", () => {
    const row = build([{ activityKey: "photography", status: "planned", evidenceRegistrationId: null, note: null, recordedByLabel: "0001", updatedAt: "2026-11-26T10:00:00Z" }]).rows[0];
    expect(row.record?.recordedByLabel).toBe("0001");
  });
});
