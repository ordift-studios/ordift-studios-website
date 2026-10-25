import { describe, expect, it } from "vitest";
import { assessEntityForQuotation, requirementStateLabel, type ActivityFact, type EntityFacts, type RequirementRow } from "./jurisdictionRequirements";
import type { RegistrationFact } from "./entityRegistry";

// The Ghana and Qatar rule sets exactly as seeded by migration 0173 (the real-schema parity test proves SQL and TypeScript agree on them).
const row = (key: string, category: RequirementRow["category"], label: string, necessity: RequirementRow["necessity"], sortOrder: number, over: Partial<RequirementRow> = {}): RequirementRow => ({
  key, category, label, identifierLabel: null, registrationKind: null, necessity, conditionActivity: null, requiresVerified: true, requiresInDate: true, shownOnDocument: false, sortOrder, approved: true, ...over,
});
const GHANA: RequirementRow[] = [
  row("legal_registration", "legal_registration", "Certificate of Registration of a Business Name (Registrar of Companies)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Business Registration No.", shownOnDocument: true }),
  row("tax_registration", "tax_registration", "Tax Identification Number (TIN)", "mandatory", 20, { registrationKind: "tax_registration", identifierLabel: "TIN", shownOnDocument: true }),
  row("operating_permission", "operating_permission", "Commercial permit", "not_applicable", 30, { registrationKind: "commercial_permit" }),
  row("signatory", "signatory", "Authorised signatory / proprietor", "mandatory", 40),
  row("renewal_evidence", "renewal_evidence", "Business-name renewal and registration status", "optional", 50, { requiresVerified: false }),
  row("activity_coverage", "activity_coverage", "Registered nature of business", "optional", 60),
  row("activity_licence:drone_operations", "activity_licence", "Drone operating authorisation", "conditional", 70, { conditionActivity: "drone_operations" }),
];
const QATAR: RequirementRow[] = [
  row("legal_registration", "legal_registration", "Commercial Registration (CR)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Commercial Registration (CR) No.", shownOnDocument: true }),
  row("tax_registration", "tax_registration", "Tax card (General Tax Authority)", "mandatory", 20, { registrationKind: "tax_registration", identifierLabel: "Tax registration No.", shownOnDocument: true }),
  row("operating_permission", "operating_permission", "Commercial Permit / Licence", "mandatory", 30, { registrationKind: "commercial_permit" }),
  row("signatory", "signatory", "Authorised signatory / manager", "mandatory", 40),
  row("establishment_card", "operating_permission", "Establishment Card", "optional", 50, { registrationKind: "establishment_card" }),
  row("renewal_evidence", "renewal_evidence", "Registration renewal", "optional", 60, { requiresVerified: false }),
  row("activity_coverage", "activity_coverage", "Licensed activities", "mandatory", 70),
];
const TODAY = "2026-10-26";
const reg = (id: string, kind: RegistrationFact["kind"], over: Partial<RegistrationFact> = {}): RegistrationFact => ({ id, kind, status: "active", identifier: `${kind}-NO`, issuedOn: null, expiresOn: null, facts: {}, note: null, verifiedAt: "2026-10-01T00:00:00Z", ...over });
const LABELS = { photography: "Photography", videography: "Videography", graphic_design: "Graphic design", talent_management: "Talent management", production_services: "Production services", drone_operations: "Drone operations" };
const entity = (over: Partial<EntityFacts> = {}): EntityFacts => ({
  name: "Ordift Studios", legalName: "Ordift Studios", registrationType: "Registered Business Name", active: true, verified: true, jurisdictionName: "Ghana",
  registrations: [reg("r1", "commercial_registration", { identifier: "BN-TEST-1" }), reg("r2", "tax_registration", { identifier: "TIN-TEST-1" })],
  signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null }], activities: [], activityLabels: LABELS, ...over,
});
const act = (key: string, status: ActivityFact["status"], evidenceRegistrationId: string | null = null): ActivityFact => ({ key, status, evidenceRegistrationId });

describe("Ghana: a Registered Business Name is judged by Ghana's own requirements", () => {
  it("a complete record is eligible with NO Qatar-style CR document or commercial permit, and shows Ghana's own identifier names", () => {
    const a = assessEntityForQuotation(entity(), GHANA, ["photography"], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.blockers).toEqual([]);
    expect(a.legal).toEqual({ legalName: "Ordift Studios", registrationType: "Registered Business Name", identifiers: [{ label: "Business Registration No.", identifier: "BN-TEST-1" }, { label: "TIN", identifier: "TIN-TEST-1" }] });
    expect(a.requirements.find((r) => r.key === "operating_permission")).toMatchObject({ applies: false, met: true, blocking: false });     // never demanded
    expect(requirementStateLabel(a.requirements.find((r) => r.key === "operating_permission")!)).toBe("Not applicable here");
  });
  it("videography and photography need no activity licence; the unrecorded renewal date is only an advisory", () => {
    const a = assessEntityForQuotation(entity(), GHANA, ["photography", "videography"], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.advisories).toEqual(["Business-name renewal and registration status: no renewal or expiry date is recorded; confirm whether one applies."]);
  });
  it("a recorded renewal/expiry date is enforced: an expired registration blocks", () => {
    const a = assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { identifier: "BN-TEST-1", expiresOn: "2026-09-30" }), reg("r2", "tax_registration")] }), GHANA, [], TODAY);
    expect(a.eligible).toBe(false);
    expect(a.blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) expired on 2026-09-30."]);
    expect(a.legal.identifiers.map((i) => i.label)).toEqual(["TIN"]);                          // an expired number is never shown as current
  });
  it("genuinely mandatory evidence blocks: no registration record, no TIN, unverified records, no signatory", () => {
    expect(assessEntityForQuotation(entity({ registrations: [] }), GHANA, [], TODAY).blockers).toEqual([
      "Certificate of Registration of a Business Name (Registrar of Companies) is not on record.", "Tax Identification Number (TIN) is not on record."]);
    expect(assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { verifiedAt: null }), reg("r2", "tax_registration")] }), GHANA, [], TODAY).blockers)
      .toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) has not been verified."]);
    expect(assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { identifier: null }), reg("r2", "tax_registration")] }), GHANA, [], TODAY).blockers)
      .toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) has no identifier recorded."]);
    expect(assessEntityForQuotation(entity({ signatories: [] }), GHANA, [], TODAY).blockers).toEqual(["No authorised signatory is recorded for the entity."]);
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2030-01-01", effectiveTo: null }] }), GHANA, [], TODAY).eligible).toBe(false);          // not yet in force
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-01-01", effectiveTo: "2026-01-01" }] }), GHANA, [], TODAY).eligible).toBe(false);   // ended
  });
  it("drone licensing is conditional: required ONLY when a quotation declares drone operations (Ghana does not operate one today)", () => {
    expect(assessEntityForQuotation(entity(), GHANA, ["photography"], TODAY).eligible).toBe(true);
    const blocked = assessEntityForQuotation(entity(), GHANA, ["photography", "drone_operations"], TODAY);
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockers).toEqual(["Drone operations is not licensed for this entity."]);
    expect(blocked.requirements.find((r) => r.key === "activity_licence:drone_operations")).toMatchObject({ applies: true, met: false, blocking: true });
    const ok = assessEntityForQuotation(entity({ registrations: [...entity().registrations, reg("lic", "commercial_permit", { identifier: "AUTH-1", expiresOn: "2027-06-01" })], activities: [act("drone_operations", "licensed", "lic")] }), GHANA, ["drone_operations"], TODAY);
    expect(ok.eligible).toBe(true);
  });
  it("the registered-business-name / company distinction is preserved on the document: the registration type is shown exactly as recorded", () => {
    expect(assessEntityForQuotation(entity({ registrationType: "Registered Business Name" }), GHANA, [], TODAY).legal.registrationType).toBe("Registered Business Name");
    expect(assessEntityForQuotation(entity({ registrationType: null }), GHANA, [], TODAY).legal.registrationType).toBeNull();          // never invented
  });
});

describe("Qatar: the commercial permit block and licensed-activities-only", () => {
  const qatar = (over: Partial<EntityFacts> = {}) => entity({
    name: "Ordift Studios (Qatar)", legalName: "ORDIFT STUDIOS", registrationType: "Single-Member Limited Liability Company (W.L.L.)", jurisdictionName: "Qatar",
    registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", expiresOn: "2027-10-15" }), reg("tx", "tax_registration"), reg("pm", "commercial_permit", { status: "not_issued", identifier: null, verifiedAt: null })], ...over,
  });
  it("while the permit is NOT ISSUED the entity is blocked, however complete the rest is", () => {
    const a = assessEntityForQuotation(qatar({ activities: [act("photography", "licensed", "cr")] }), QATAR, ["photography"], TODAY);
    expect(a.eligible).toBe(false);
    expect(a.blockers).toEqual(["Commercial Permit / Licence has not been issued."]);
  });
  it("a missing permit record is ALSO a block (the permit is mandatory, not merely 'once tracked')", () => {
    const a = assessEntityForQuotation(qatar({ registrations: qatar().registrations.filter((r) => r.kind !== "commercial_permit"), activities: [act("photography", "licensed", "cr")] }), QATAR, ["photography"], TODAY);
    expect(a.blockers).toEqual(["Commercial Permit / Licence is not on record."]);
  });
  const withPermit = (over: Partial<EntityFacts> = {}) => qatar({ registrations: [...qatar().registrations.filter((r) => r.kind !== "commercial_permit"), reg("pm", "commercial_permit", { identifier: "PERMIT-1", expiresOn: "2027-10-15" })], ...over });
  it("with the permit issued and verified, ONLY activities recorded as licensed can be quoted; planned activities are not licensed", () => {
    const activities = [act("photography", "licensed", "cr"), act("videography", "planned"), act("graphic_design", "planned"), act("talent_management", "planned"), act("production_services", "planned")];
    expect(assessEntityForQuotation(withPermit({ activities }), QATAR, ["photography"], TODAY).eligible).toBe(true);
    const v = assessEntityForQuotation(withPermit({ activities }), QATAR, ["photography", "videography"], TODAY);
    expect(v.eligible).toBe(false);
    expect(v.blockers).toEqual(["Videography is planned for this entity but not yet licensed."]);
    for (const planned of ["graphic_design", "talent_management", "production_services"]) expect(assessEntityForQuotation(withPermit({ activities }), QATAR, [planned], TODAY).eligible).toBe(false);
  });
  it("an unrecorded activity, a suspended one, a withdrawn one, or one with expired / unverified evidence is never treated as licensed", () => {
    expect(assessEntityForQuotation(withPermit(), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is not licensed for this entity."]);
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "suspended", "cr")] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is suspended for this entity."]);
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "withdrawn", "cr")] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is not licensed for this entity."]);
    const expired = withPermit({ registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", expiresOn: "2026-10-01" }), reg("tx", "tax_registration"), reg("pm", "commercial_permit", { identifier: "P", expiresOn: "2027-10-15" })], activities: [act("photography", "licensed", "cr")] });
    expect(assessEntityForQuotation(expired, QATAR, ["photography"], TODAY).blockers).toEqual(["Commercial Registration (CR) expired on 2026-10-01.", "Photography: its licensing evidence expired on 2026-10-01."]);
    const unverified = withPermit({ registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", verifiedAt: null }), reg("tx", "tax_registration"), reg("pm", "commercial_permit", { identifier: "P" })], activities: [act("photography", "licensed", "cr")] });
    expect(assessEntityForQuotation(unverified, QATAR, ["photography"], TODAY).blockers).toContain("Photography: its licensing evidence is not verified.");
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "licensed", null)] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography: its licensing evidence is not verified."]);
  });
  it("at SELECTION time (activities not declared yet: null) coverage is not judged; declaring none ([]) is what blocks", () => {
    const e = withPermit({ activities: [act("photography", "licensed", "cr")] });
    expect(assessEntityForQuotation(e, QATAR, null, TODAY).eligible).toBe(true);
    expect(assessEntityForQuotation(e, QATAR, [], TODAY).eligible).toBe(false);
  });
  it("a quotation that declares no activity cannot be issued for an entity that must show licensed activities", () => {
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "licensed", "cr")] }), QATAR, [], TODAY).blockers).toEqual(["State the activities this quotation covers."]);
  });
  it("Qatar's own document names are used, and the establishment card is tracked but not blocking", () => {
    const a = assessEntityForQuotation(withPermit({ activities: [act("photography", "licensed", "cr")] }), QATAR, ["photography"], TODAY);
    expect(a.legal.identifiers.map((i) => i.label)).toEqual(["Commercial Registration (CR) No.", "Tax registration No."]);
    expect(a.advisories).toContain("Establishment Card is not on record.");
    expect(a.eligible).toBe(true);
  });
});

describe("new countries and unverified entities are never eligible by themselves", () => {
  it("an entity with no jurisdiction, or in a jurisdiction with no APPROVED legal-registration rule, is blocked (fail-closed)", () => {
    expect(assessEntityForQuotation(entity({ jurisdictionName: null }), GHANA, [], TODAY).blockers).toEqual(["The entity has no jurisdiction recorded."]);
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom" }), [], [], TODAY).blockers)
      .toEqual(["No approved registration requirements are defined for United Kingdom yet; a Super Admin must define and approve them before an entity there can contract."]);
    const drafted = GHANA.map((r) => ({ ...r, approved: false }));                                                              // a drafted rule set does nothing until approved
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom" }), drafted, [], TODAY).eligible).toBe(false);
  });
  it("an approved UK-style rule set uses its OWN terminology (e.g. Companies House number) and then applies like any other", () => {
    const uk: RequirementRow[] = [row("legal_registration", "legal_registration", "Certificate of Incorporation (Companies House)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Company number", shownOnDocument: true })];
    const a = assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", registrationType: "Private company limited by shares", registrations: [reg("c", "commercial_registration", { identifier: "UK-TEST-1" })] }), uk, [], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.legal.identifiers).toEqual([{ label: "Company number", identifier: "UK-TEST-1" }]);
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", registrations: [] }), uk, [], TODAY).blockers).toEqual(["Certificate of Incorporation (Companies House) is not on record."]);
    // and a newly proposed branch is not eligible until a Super Admin has verified it
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", verified: false, registrations: [reg("c", "commercial_registration")] }), uk, [], TODAY).blockers).toEqual(["The entity's registration has not been verified by a Super Admin."]);
  });
  it("an inactive or unverified entity is blocked in every jurisdiction", () => {
    expect(assessEntityForQuotation(entity({ active: false, verified: false }), GHANA, [], TODAY).blockers).toEqual(["The entity is not active.", "The entity's registration has not been verified by a Super Admin."]);
  });
  it("conditional requirements apply only to the declared activity, and not_applicable is never demanded", () => {
    const a = assessEntityForQuotation(entity(), GHANA, ["photography"], TODAY);
    expect(a.requirements.find((r) => r.key === "activity_licence:drone_operations")).toMatchObject({ applies: false, met: true });
    expect(requirementStateLabel(a.requirements.find((r) => r.key === "activity_licence:drone_operations")!)).toBe("Not needed for this quotation");
  });
});
