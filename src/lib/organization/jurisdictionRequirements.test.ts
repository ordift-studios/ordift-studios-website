import { describe, expect, it } from "vitest";
import { assessEntityForQuotation, requirementStateLabel, type ActivityFact, type EntityFacts, type RenewalFact, type RequirementRow } from "./jurisdictionRequirements";
import { checkIdentifierFormat } from "./entityRegistrations";
import type { RegistrationFact } from "./entityRegistry";

// The Ghana and Qatar rule sets exactly as seeded by migration 0173 (the real-schema parity test proves SQL and TypeScript agree on them).
const row = (key: string, category: RequirementRow["category"], label: string, necessity: RequirementRow["necessity"], sortOrder: number, over: Partial<RequirementRow> = {}): RequirementRow => ({
  key, category, label, identifierLabel: null, registrationKind: null, necessity, conditionActivity: null, requiresVerified: true, requiresInDate: true, shownOnDocument: false, sortOrder, approved: true, ...over,
});
const GHANA: RequirementRow[] = [
  row("legal_registration", "legal_registration", "Certificate of Registration of a Business Name (Registrar of Companies)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Business Registration No.", identifierPattern: "^BN[0-9]{9}$", shownOnDocument: true }),
  row("tax_registration", "tax_registration", "Tax Identification Number (TIN)", "optional", 20, { registrationKind: "tax_registration", identifierLabel: "TIN", identifierPattern: "^P[0-9]{10}$" }),
  row("operating_permission", "operating_permission", "Commercial permit", "not_applicable", 30, { registrationKind: "commercial_permit" }),
  row("signatory", "signatory", "Proprietor / authorised signatory with legal authority", "mandatory", 40, { signatoryCapacities: ["sole_proprietor", "authorised_signatory"] }),
  row("renewal_evidence", "renewal_evidence", "Annual business-name renewal", "optional", 50, { requiresVerified: false }),
  row("activity_coverage", "activity_coverage", "Registered nature of business", "optional", 60),
  row("activity_licence:drone_operations", "activity_licence", "Drone operating authorisation", "conditional", 70, { conditionActivity: "drone_operations" }),
];
const QATAR: RequirementRow[] = [
  row("legal_registration", "legal_registration", "Commercial Registration (CR)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Commercial Registration (CR) No.", shownOnDocument: true }),
  row("tax_registration", "tax_registration", "Tax card (General Tax Authority)", "optional", 20, { registrationKind: "tax_registration", identifierLabel: "Tax registration No.", shownOnDocument: true }),
  row("operating_permission", "operating_permission", "Commercial Permit / Licence", "mandatory", 30, { registrationKind: "commercial_permit" }),
  row("signatory", "signatory", "Owner / manager with legal authority", "mandatory", 40, { signatoryCapacities: ["owner", "director", "manager", "authorised_signatory"] }),
  row("establishment_card", "operating_permission", "Establishment Card", "optional", 50, { registrationKind: "establishment_card" }),
  row("renewal_evidence", "renewal_evidence", "Registration renewal", "not_applicable", 60, { requiresVerified: false }),
  row("activity_coverage", "activity_coverage", "Registered and licensed activities", "mandatory", 70),
];
const TODAY = "2026-10-26";
const reg = (id: string, kind: RegistrationFact["kind"], over: Partial<RegistrationFact> = {}): RegistrationFact => ({ id, kind, status: "active", identifier: `${kind}-NO`, issuedOn: null, expiresOn: null, facts: {}, note: null, verifiedAt: "2026-10-01T00:00:00Z", ...over });
const LABELS = { photography: "Photography", videography: "Videography", graphic_design: "Graphic design", talent_management: "Talent management", production_services: "Production services", drone_operations: "Drone operations" };
const entity = (over: Partial<EntityFacts> = {}): EntityFacts => ({
  name: "Ordift Studios", legalName: "Ordift Studios", registrationType: "Registered Business Name", active: true, verified: true, jurisdictionName: "Ghana",
  registrations: [reg("r1", "commercial_registration", { identifier: "BN-TEST-1" })],
  signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null, legalCapacity: "sole_proprietor" }], activities: [], activityLabels: LABELS, renewals: [], activityCodes: [], ...over,
});
const act = (key: string, status: ActivityFact["status"], evidenceRegistrationId: string | null = null): ActivityFact => ({ key, status, evidenceRegistrationId });
const renewal = (status: RenewalFact["status"], over: Partial<RenewalFact> = {}): RenewalFact => ({ status, coversTo: "2026-10-26", createdAt: "2026-10-26T10:00:00Z", nextDueOn: null, ...over });

describe("Ghana: a Registered Business Name is judged by Ghana's own requirements", () => {
  it("a record with the certificate and a legal-capacity signatory is eligible with NO Qatar-style CR or commercial permit; only the business registration number is printed", () => {
    const a = assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { identifier: "BN-TEST-1" }), reg("r2", "tax_registration", { identifier: "TIN-TEST-1" })] }), GHANA, ["photography"], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.blockers).toEqual([]);
    // the proprietor's personal TIN is tracked but never printed on a client document
    expect(a.legal).toEqual({ legalName: "Ordift Studios", registrationType: "Registered Business Name", identifiers: [{ label: "Business Registration No.", identifier: "BN-TEST-1" }] });
    expect(a.requirements.find((r) => r.key === "operating_permission")).toMatchObject({ applies: false, met: true, blocking: false });
    expect(requirementStateLabel(a.requirements.find((r) => r.key === "operating_permission")!)).toBe("Not applicable here");
  });
  it("a missing TIN is an advisory, not a block (it matters at invoicing, not to offer a quotation)", () => {
    const a = assessEntityForQuotation(entity(), GHANA, ["photography", "videography"], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.advisories).toContain("Tax Identification Number (TIN) is not on record.");
  });
  it("genuinely mandatory evidence blocks: no registration record, unverified, no identifier, an expired certificate date", () => {
    expect(assessEntityForQuotation(entity({ registrations: [] }), GHANA, [], TODAY).blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) is not on record."]);
    expect(assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { verifiedAt: null })] }), GHANA, [], TODAY).blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) has not been verified."]);
    expect(assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { identifier: null })] }), GHANA, [], TODAY).blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) has no identifier recorded."]);
    expect(assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { status: "pending", identifier: null })] }), GHANA, [], TODAY).blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) has not been issued."]);
    const expired = assessEntityForQuotation(entity({ registrations: [reg("r1", "commercial_registration", { identifier: "BN-TEST-1", expiresOn: "2026-09-30" })] }), GHANA, [], TODAY);
    expect(expired.blockers).toEqual(["Certificate of Registration of a Business Name (Registrar of Companies) expired on 2026-09-30."]);
    expect(expired.legal.identifiers).toEqual([]);                                             // an expired number is never shown as current
  });
  it("the certificate having NO expiry date is not treated as 'never renewed' or as expired", () => {
    const a = assessEntityForQuotation(entity(), GHANA, [], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.blockers).toEqual([]);
  });
});

describe("Ghana: the proprietor's LEGAL capacity is distinct from the management title", () => {
  it("a Chief Executive Officer with no recorded legal capacity does NOT hold contracting authority", () => {
    const a = assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null, legalCapacity: null }] }), GHANA, [], TODAY);
    expect(a.eligible).toBe(false);
    expect(a.blockers).toEqual(["No signatory with legal authority to contract is recorded for the entity."]);
  });
  it("the same person recorded as sole proprietor (title: CEO elsewhere) satisfies it; a capacity Ghana does not accept (e.g. manager) does not", () => {
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null, legalCapacity: "sole_proprietor" }] }), GHANA, [], TODAY).eligible).toBe(true);
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null, legalCapacity: "authorised_signatory" }] }), GHANA, [], TODAY).eligible).toBe(true);
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-05-07", effectiveTo: null, legalCapacity: "manager" }] }), GHANA, [], TODAY).eligible).toBe(false);
  });
  it("authority must be in force: not yet started, or ended, does not count", () => {
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2030-01-01", effectiveTo: null, legalCapacity: "sole_proprietor" }] }), GHANA, [], TODAY).eligible).toBe(false);
    expect(assessEntityForQuotation(entity({ signatories: [{ effectiveFrom: "2018-01-01", effectiveTo: "2026-01-01", legalCapacity: "sole_proprietor" }] }), GHANA, [], TODAY).eligible).toBe(false);
    expect(assessEntityForQuotation(entity({ signatories: [] }), GHANA, [], TODAY).eligible).toBe(false);
  });
});

describe("Ghana: annual renewal is tracked separately and never invented", () => {
  const renewalAdvisories = (renewals: RenewalFact[]) => { const a = assessEntityForQuotation(entity({ renewals }), GHANA, [], TODAY); return { ...a, advisories: a.advisories.filter((x) => x.startsWith("Annual business-name renewal")) }; };
  it("no renewal record: advisory only, the business is NOT marked overdue, lapsed or non-compliant", () => {
    const a = renewalAdvisories([]);
    expect(a.eligible).toBe(true);
    expect(a.advisories).toContain("Annual business-name renewal: no renewal confirmation is recorded.");
    expect(a.requirements.find((r) => r.key === "renewal_evidence")).toMatchObject({ met: false, blocking: false });
  });
  it("Founder-confirmed renewal without any paper receipt: eligible, honestly labelled 'Founder-confirmed; official verification pending', never 'verified'", () => {
    const a = renewalAdvisories([renewal("founder_confirmed")]);
    expect(a.eligible).toBe(true);
    expect(a.blockers).toEqual([]);
    expect(a.advisories).toEqual(["Annual business-name renewal: Founder-confirmed; official verification pending."]);
    expect(a.advisories.join(" ")).not.toMatch(/overdue|expired|lapsed|non-compliant/i);
  });
  it("an officially verified renewal needs no advisory", () => {
    expect(renewalAdvisories([renewal("official_verified")]).advisories).toEqual([]);
  });
  it("only a renewal recorded as LAPSED blocks (a known adverse fact); the latest period covered is the current one", () => {
    const lapsed = renewalAdvisories([renewal("lapsed")]);
    expect(lapsed.eligible).toBe(false);
    expect(lapsed.blockers).toEqual(["Annual business-name renewal: the registration is recorded as lapsed."]);
    expect(lapsed.requirements.find((r) => r.key === "renewal_evidence")).toMatchObject({ met: false, blocking: true });
    // an older lapse followed by a later confirmed renewal is superseded by the later period
    const later = renewalAdvisories([renewal("lapsed", { coversTo: "2024-05-07" }), renewal("official_verified", { coversTo: "2026-05-07" })]);
    expect(later.eligible).toBe(true);
    expect(later.advisories).toEqual([]);
  });
  it("a recorded next-due date that has passed is an advisory to confirm the latest renewal, never a block", () => {
    const a = renewalAdvisories([renewal("founder_confirmed", { nextDueOn: "2026-05-07" })]);
    expect(a.eligible).toBe(true);
    expect(a.advisories).toContain("Annual business-name renewal: the renewal due 2026-05-07 has passed; confirm the latest renewal.");
  });
});

describe("Ghana: drone licensing is conditional", () => {
  it("required ONLY when a quotation declares drone operations (Ghana does not operate a drone today); photography and videography need no licence", () => {
    expect(assessEntityForQuotation(entity(), GHANA, ["photography", "videography"], TODAY).eligible).toBe(true);
    const blocked = assessEntityForQuotation(entity(), GHANA, ["photography", "drone_operations"], TODAY);
    expect(blocked.blockers).toEqual(["Drone operations is not licensed for this entity."]);
    const ok = assessEntityForQuotation(entity({ registrations: [...entity().registrations, reg("lic", "activity_licence", { identifier: "AUTH-1", expiresOn: "2027-06-01" })], activities: [act("drone_operations", "licensed", "lic")] }), GHANA, ["drone_operations"], TODAY);
    expect(ok.eligible).toBe(true);
  });
  it("the registered-business-name / company distinction is kept on the document, exactly as recorded and never invented", () => {
    expect(assessEntityForQuotation(entity({ registrationType: "Registered Business Name" }), GHANA, [], TODAY).legal.registrationType).toBe("Registered Business Name");
    expect(assessEntityForQuotation(entity({ registrationType: null }), GHANA, [], TODAY).legal.registrationType).toBeNull();
  });
});

describe("number formats observed on Ghana's documents are CHECKED when recorded, never generated", () => {
  it("accepts the observed shapes and rejects others; a missing pattern accepts anything", () => {
    expect(checkIdentifierFormat("^BN[0-9]{9}$", "BN123456789").ok).toBe(true);
    expect(checkIdentifierFormat("^BN[0-9]{9}$", " BN123456789 ").ok).toBe(true);
    expect(checkIdentifierFormat("^BN[0-9]{9}$", "BN12345678").ok).toBe(false);
    expect(checkIdentifierFormat("^BN[0-9]{9}$", "CR123456789").ok).toBe(false);
    expect(checkIdentifierFormat("^P[0-9]{10}$", "P0123456789").ok).toBe(true);
    expect(checkIdentifierFormat("^P[0-9]{10}$", "0123456789").ok).toBe(false);
    expect(checkIdentifierFormat(null, "anything").ok).toBe(true);
  });
});

describe("Qatar: the commercial-permit block, the CR-listed activity and planned activities", () => {
  const crFacts = { activities: [{ code: "742010", name: "Photographic activities" }] };
  const qatar = (over: Partial<EntityFacts> = {}) => entity({
    name: "Ordift Studios (Qatar)", legalName: "ORDIFT STUDIOS", registrationType: "Single-Member Limited Liability Company (W.L.L.)", jurisdictionName: "Qatar",
    registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", expiresOn: "2027-10-15", facts: crFacts }), reg("tx", "tax_registration"), reg("pm", "commercial_permit", { status: "not_issued", identifier: null, verifiedAt: null })],
    signatories: [{ effectiveFrom: "2026-10-15", effectiveTo: null, legalCapacity: "owner" }], activityCodes: [{ code: "742010", activityKey: "photography" }], ...over,
  });
  const withPermit = (over: Partial<EntityFacts> = {}) => qatar({ registrations: [...qatar().registrations.filter((r) => r.kind !== "commercial_permit"), reg("pm", "commercial_permit", { identifier: "PERMIT-1", expiresOn: "2027-10-15" })], ...over });

  it("photography listed on the verified CR but NO commercial permit: the entity is still blocked, and the activity is shown as 'listed on registration', not as approved to operate", () => {
    const a = assessEntityForQuotation(qatar(), QATAR, ["photography"], TODAY);
    expect(a.eligible).toBe(false);
    expect(a.blockers).toEqual(["Commercial Permit / Licence has not been issued."]);
    expect(a.activities).toEqual([{ key: "photography", label: "Photography", state: "listed_on_registration" }]);
  });
  it("a missing permit record is ALSO a block (the permit is mandatory, not merely 'once tracked')", () => {
    const a = assessEntityForQuotation(qatar({ registrations: qatar().registrations.filter((r) => r.kind !== "commercial_permit") }), QATAR, ["photography"], TODAY);
    expect(a.blockers).toEqual(["Commercial Permit / Licence is not on record."]);
  });
  it("with the permit issued and verified, photography needs NO additional activity licence: the CR-listed activity plus the permit is enough", () => {
    const a = assessEntityForQuotation(withPermit(), QATAR, ["photography"], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.blockers).toEqual([]);
    expect(a.activities).toEqual([{ key: "photography", label: "Photography", state: "listed_on_registration" }]);
  });
  it("activities that are only PLANNED are refused, even with the permit; nothing is derived for an activity the CR does not list", () => {
    const planned = [act("videography", "planned"), act("graphic_design", "planned"), act("talent_management", "planned"), act("production_services", "planned")];
    for (const a of ["videography", "graphic_design", "talent_management", "production_services"]) {
      const r = assessEntityForQuotation(withPermit({ activities: planned }), QATAR, [a], TODAY);
      expect(r.eligible, a).toBe(false);
      expect(r.blockers[0], a).toMatch(/is planned for this entity but not yet licensed\./);
    }
    // not even recorded as planned: simply not licensed
    expect(assessEntityForQuotation(withPermit(), QATAR, ["videography"], TODAY).blockers).toEqual(["Videography is not licensed for this entity."]);
    expect(assessEntityForQuotation(withPermit({ activities: planned }), QATAR, ["photography", "videography"], TODAY).blockers).toEqual(["Videography is planned for this entity but not yet licensed."]);
  });
  it("an explicit decision beats the CR listing: planned / suspended / withdrawn photography is NOT usable even though the CR lists it", () => {
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "planned")] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is planned for this entity but not yet licensed."]);
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "suspended", "cr")] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is suspended for this entity."]);
    expect(assessEntityForQuotation(withPermit({ activities: [act("photography", "withdrawn", "cr")] }), QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is not licensed for this entity."]);
  });
  it("the CR listing counts only while the CR is verified and in date; an unlisted code is not mapped", () => {
    const unverified = withPermit({ registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", verifiedAt: null, facts: crFacts }), reg("pm", "commercial_permit", { identifier: "P" })] });
    expect(assessEntityForQuotation(unverified, QATAR, ["photography"], TODAY).blockers).toEqual(["Commercial Registration (CR) has not been verified.", "Photography is not licensed for this entity."]);
    const expired = withPermit({ registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", expiresOn: "2026-10-01", facts: crFacts }), reg("pm", "commercial_permit", { identifier: "P" })] });
    expect(assessEntityForQuotation(expired, QATAR, ["photography"], TODAY).blockers).toEqual(["Commercial Registration (CR) expired on 2026-10-01.", "Photography is not licensed for this entity."]);
    const other = withPermit({ registrations: [reg("cr", "commercial_registration", { identifier: "CR-TEST", facts: { activities: [{ code: "999999" }] } }), reg("pm", "commercial_permit", { identifier: "P" })] });
    expect(assessEntityForQuotation(other, QATAR, ["photography"], TODAY).blockers).toEqual(["Photography is not licensed for this entity."]);
  });
  it("an explicitly licensed activity needs verified, in-date evidence; a quotation declaring no activity cannot be issued; at selection time (null) coverage is not judged", () => {
    const lic = (over: Partial<RegistrationFact>) => withPermit({ registrations: [...withPermit().registrations, reg("lic", "activity_licence", { identifier: "L-1", ...over })], activities: [act("videography", "licensed", "lic")] });
    expect(assessEntityForQuotation(lic({}), QATAR, ["videography"], TODAY).eligible).toBe(true);
    expect(assessEntityForQuotation(lic({ expiresOn: "2026-10-01" }), QATAR, ["videography"], TODAY).blockers).toEqual(["Videography: its licensing evidence expired on 2026-10-01."]);
    expect(assessEntityForQuotation(lic({ verifiedAt: null }), QATAR, ["videography"], TODAY).blockers).toEqual(["Videography: its licensing evidence is not verified."]);
    expect(assessEntityForQuotation(withPermit(), QATAR, [], TODAY).blockers).toEqual(["State the activities this quotation covers."]);
    expect(assessEntityForQuotation(withPermit(), QATAR, null, TODAY).eligible).toBe(true);
  });
  it("Qatar's own document names are used; the tax card and establishment card are tracked, not blocking; legal capacity (owner) is required", () => {
    const a = assessEntityForQuotation(withPermit(), QATAR, ["photography"], TODAY);
    expect(a.legal.identifiers.map((i) => i.label)).toEqual(["Commercial Registration (CR) No.", "Tax registration No."]);
    expect(a.advisories).toEqual(["Establishment Card is not on record."]);
    expect(assessEntityForQuotation(withPermit({ signatories: [{ effectiveFrom: "2026-10-15", effectiveTo: null, legalCapacity: null }] }), QATAR, ["photography"], TODAY).blockers).toEqual(["No signatory with legal authority to contract is recorded for the entity."]);
    expect(assessEntityForQuotation(withPermit({ signatories: [{ effectiveFrom: "2026-10-15", effectiveTo: null, legalCapacity: "sole_proprietor" }] }), QATAR, ["photography"], TODAY).eligible).toBe(false);   // not a Qatar capacity
  });
  it("Qatar's renewal is its CR expiry: no separate renewal requirement is demanded", () => {
    expect(assessEntityForQuotation(withPermit(), QATAR, ["photography"], TODAY).requirements.find((r) => r.key === "renewal_evidence")).toMatchObject({ applies: false });
  });
});

describe("new countries and unverified entities are never eligible by themselves", () => {
  it("an entity with no jurisdiction, or in a jurisdiction with no APPROVED legal-registration rule, is blocked (fail-closed)", () => {
    expect(assessEntityForQuotation(entity({ jurisdictionName: null }), GHANA, [], TODAY).blockers).toEqual(["The entity has no jurisdiction recorded."]);
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom" }), [], [], TODAY).blockers)
      .toEqual(["No approved registration requirements are defined for United Kingdom yet; a Super Admin must define and approve them before an entity there can contract."]);
    const drafted = GHANA.map((r) => ({ ...r, approved: false }));
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom" }), drafted, [], TODAY).eligible).toBe(false);
  });
  it("an approved UK-style rule set uses its OWN terminology, and a newly proposed (unverified) branch is still not eligible", () => {
    const uk: RequirementRow[] = [row("legal_registration", "legal_registration", "Certificate of Incorporation (Companies House)", "mandatory", 10, { registrationKind: "commercial_registration", identifierLabel: "Company number", shownOnDocument: true })];
    const a = assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", registrationType: "Private company limited by shares", registrations: [reg("c", "commercial_registration", { identifier: "UK-TEST-1" })] }), uk, [], TODAY);
    expect(a.eligible).toBe(true);
    expect(a.legal.identifiers).toEqual([{ label: "Company number", identifier: "UK-TEST-1" }]);
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", registrations: [] }), uk, [], TODAY).blockers).toEqual(["Certificate of Incorporation (Companies House) is not on record."]);
    expect(assessEntityForQuotation(entity({ jurisdictionName: "United Kingdom", verified: false, registrations: [reg("c", "commercial_registration")] }), uk, [], TODAY).blockers).toEqual(["The entity's registration has not been verified by a Super Admin."]);
  });
  it("an inactive or unverified entity is blocked in every jurisdiction; conditional requirements apply only to the declared activity", () => {
    expect(assessEntityForQuotation(entity({ active: false, verified: false }), GHANA, [], TODAY).blockers).toEqual(["The entity is not active.", "The entity's registration has not been verified by a Super Admin."]);
    const a = assessEntityForQuotation(entity(), GHANA, ["photography"], TODAY);
    expect(requirementStateLabel(a.requirements.find((r) => r.key === "activity_licence:drone_operations")!)).toBe("Not needed for this quotation");
  });
});
