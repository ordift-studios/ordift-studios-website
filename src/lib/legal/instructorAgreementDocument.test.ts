import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeInstructorAgreementText, instructorAgreementStage, longDate, OPTIONAL_TERMS_NOT_PRINTED, splitStoredAddress, type InstructorSnapshot } from "./instructorAgreementDocument";
import { missingScheduleATerms, validateScheduleATerms, type ScheduleATerms } from "./instructorAgreementTerms";
import { MASTER, CLAUSES } from "./instructorMaster.fixture";

const terms: ScheduleATerms = {
  professionalRole: "INSTRUCTOR", businessName: "SAMPLE STUDIOS", nationalityWorkAuthorization: "Ghana", addressCountry: "1 Example Lane, Accra, Ghana", contactPhone: "+000 000 0000", primaryExpertise: "Photography and post-production",
  qualifications: "", independentStatusRoute: "CONTRACTOR", masterTerm: "DATE RANGE: 2027-01-01 to 2027-12-31", masterTerminationNotice: "30 calendar days in writing", regulatoryApprovalStatus: "PENDING", specialTerms: "NONE", agreementEffectiveDate: "2027-01-01",
};
const snap: InstructorSnapshot = {
  agreementReference: "ORD-AGR-2026-000099", jurisdiction: "Ghana",
  instructor: { profileId: "k", legalName: "Sam Instructor", memberNumber: "INT0001", email: "instructor@example.test" },
  contractingEntity: { id: "gh", name: "Ordift Studios", legalName: "Ordift Studios", registrationType: "Registered Business Name", registrationDate: "2019-03-04", registrationNumber: "BN000000000", businessAddress: "PO Box 1 || 1 Example Street, Accra" },
  signatory: { id: "s", name: "A Signatory", position: "Proprietor", authority: "As stated on the certificate", sourceDocumentId: "d" },
  template: { versionId: "v", contentReference: "legal-masters:x", documentHash: "abc123", templateEffectiveDate: "2026-09-05" },
  scheduleA: terms,
};
const compose = (over: Partial<InstructorSnapshot> = {}, masterText = MASTER) => composeInstructorAgreementText({ masterText, masterVersion: "1.0", snapshot: { ...snap, ...over } });

describe("OS-LGL-010 document composition (Option A)", () => {
  const r = compose();
  const text = r.ok ? r.text : "";
  it("carries operative clauses 1-29 exactly as approved, line for line and in place", () => {
    expect(r.ok).toBe(true);
    expect(text).toContain(CLAUSES);
    expect(text.indexOf("1. DEFINITIONS, STRUCTURE AND STATUS")).toBeLessThan(text.indexOf("29.6 Entire agreement."));
  });
  it("leaves out the blank template forms (cover record, Schedules A-F) and the internal counsel routing notes", () => {
    expect(text).not.toMatch(/\[[A-Z][A-Z /]+\]/); // no template placeholder anywhere
    for (const h of ["SCHEDULE B - ", "SCHEDULE C - ", "SCHEDULE D - ", "SCHEDULE E - ", "SCHEDULE F", "Counsel should", "OFFICIAL MASTER", "APPROVED - OFFICIAL MASTER"]) expect(text).not.toContain(h);
    expect(text.match(/PARTIES & ENGAGEMENT RECORD/g)).toHaveLength(1); // exactly one party record
    expect(text.match(/SCHEDULE A - INSTRUCTOR PROFILE & MASTER TERMS/g)).toHaveLength(1); // exactly one Schedule A
  });
  it("cites the controlled master's version, content reference and integrity hash", () => {
    expect(text).toContain("OS-LGL-010 MASTER VERSION: 1.0");
    expect(text).toContain("MASTER CONTENT REFERENCE: legal-masters:x");
    expect(text).toContain("MASTER DOCUMENT SHA-256: abc123");
  });
  it("states only verified or administrator-stated particulars, with the entity's registration number and address", () => {
    expect(text).toContain("Ordift Contracting Entity: Ordift Studios, Registered Business Name, registration number BN000000000, registered 4 March 2019; business address: PO Box 1, 1 Example Street, Accra");
    expect(text).toContain("Primary Jurisdiction: Ghana");
    expect(text).toContain("For Ordift (Ordift Studios): A Signatory, Proprietor. Authority as recorded from the entity's supporting document: As stated on the certificate");
    expect(text).not.toContain("2026-09-05"); // the template's effective date is never used as the agreement's
  });
  it("renders the fixed term in clear wording without changing the stored dates, and keeps notice, regulatory status and special terms", () => {
    expect(text).toContain("Effective Date: 1 January 2027");
    expect(text).toContain("Master term: From 1 January 2027 to 31 December 2027");
    expect(text).toContain("Master termination notice: 30 calendar days in writing");
    expect(text).toContain("Regulatory approval status: PENDING");
    expect(text).toContain("Special terms: NONE");
    expect(terms.masterTerm).toBe("DATE RANGE: 2027-01-01 to 2027-12-31"); // the stored value is untouched
  });
  it("introduces no automatic renewal and no commitment beyond the stated term", () => {
    expect(text).not.toMatch(/2028|renew/i);
  });
  it("prints the business name only as a stated professional affiliation, and never prints the unverified nationality or a personal phone number", () => {
    expect(text).toContain("Professional affiliation (as stated by the Instructor; not a contracting party): SAMPLE STUDIOS");
    expect(text).toContain("Instructor / Facilitator: Sam Instructor, contracting personally (member INT0001)"); // the individual contracts; the affiliation is not a party
    expect(text).toContain("Nationality / work authorization: Not stated");
    expect(text).not.toContain("+000 000 0000");
    expect(text).toContain("Contact: instructor@example.test");
    expect(OPTIONAL_TERMS_NOT_PRINTED).toEqual(["nationalityWorkAuthorization", "contactPhone"]);
  });
  describe("sole-proprietorship business name (counsel-approved signature block)", () => {
    const sole = (over: Partial<InstructorSnapshot["signatory"]> = {}, entity: Partial<InstructorSnapshot["contractingEntity"]> = {}) =>
      compose({ signatory: { ...snap.signatory, name: "Pat Proprietor", position: "Chief Executive Officer", legalCapacity: "sole_proprietor", ...over }, contractingEntity: { ...snap.contractingEntity, businessAddress: "1 Current Road, Accra", postalAddress: "P.O. Box 7", ...entity } });
    const textOf = (x: ReturnType<typeof compose>) => (x.ok ? x.text : "");
    const t = textOf(sole());
    it("describes the contracting party as the proprietor trading under the business name, with a business (never 'registered') address and an optional postal address", () => {
      expect(t).toContain("Ordift Contracting Party: Pat Proprietor, trading as Ordift Studios, a Registered Business Name (registration number BN000000000, registered 4 March 2019); business address: 1 Current Road, Accra; postal address: P.O. Box 7");
      expect(t).not.toMatch(/registered address/i);
    });
    it("prints the signature block as name, title AND legal capacity, then the trading name - three separate lines in this exact order", () => {
      expect(t).toContain("SIGNATORIES\n\nFor Ordift:\nPat Proprietor\nChief Executive Officer and Sole Proprietor\nTrading as Ordift Studios\n\nAuthority: As stated on the certificate\n\nFor the Instructor: Sam Instructor");
    });
    it("shows the Founder's Form A-supported authority basis as its own line, separate from counsel's three approved lines, which stay contiguous and exact", () => {
      const AUTHORITY = "Owner and Sole Proprietor of Ordift Studios, as recorded in the business registration Form A.";
      const x = textOf(sole({ name: "Alex Sample Name", authority: AUTHORITY }));
      const lines = x.split("\n");
      const i = lines.indexOf("For Ordift:");
      expect(lines.slice(i, i + 4)).toEqual(["For Ordift:", "Alex Sample Name", "Chief Executive Officer and Sole Proprietor", "Trading as Ordift Studios"]); // counsel's block, nothing added inside it
      expect(lines[i + 4]).toBe("");                                      // a blank line separates it
      expect(lines[i + 5]).toBe(`Authority: ${AUTHORITY}`);                // the authority basis, exactly as stated
      expect(x).toContain(CLAUSES); // the operative clauses (including the authority warranty, clause 23.1 of the real master) are carried unchanged
    });
    it("keeps the legal capacity apart from the trading name: the trading name is never part of the capacity line, and the capacity is stated exactly once", () => {
      const lines = t.split("\n");
      const i = lines.indexOf("Pat Proprietor");
      expect(lines[i + 1]).toBe("Chief Executive Officer and Sole Proprietor");
      expect(lines[i + 1]).not.toContain("Ordift");
      expect(lines[i + 2]).toBe("Trading as Ordift Studios");
      expect(textOf(sole({ position: "Chief Executive Officer and Sole Proprietor" })).match(/Sole Proprietor/g)).toHaveLength(1);
    });
    it("uses the name exactly as recorded, with no hyphen added or removed", () => {
      expect(textOf(sole({ name: "Alex Sample Name" }))).toContain("For Ordift:\nAlex Sample Name\nChief Executive Officer and Sole Proprietor\nTrading as Ordift Studios");
      expect(textOf(sole({ name: "Alex Sample Name" }))).not.toContain("Sample-Name");
      expect(textOf(sole({ name: "Alex Sample-Name" }))).toContain("Alex Sample-Name, trading as Ordift Studios"); // stored spelling is printed as stored - corrected only by correcting the record
    });
    it("leaves a signatory without the sole_proprietor capacity in the original one-line form, unchanged", () => {
      for (const legalCapacity of [null, undefined, "director", "authorised_signatory"]) {
        const x = textOf(compose({ signatory: { ...snap.signatory, legalCapacity } }));
        expect(x).toContain("Ordift Contracting Entity: Ordift Studios,");
        expect(x).toContain("For Ordift (Ordift Studios): A Signatory, Proprietor. Authority as recorded from the entity's supporting document: As stated on the certificate");
        expect(x).not.toContain("Trading as");
      }
    });
    it("refuses a name or title that is still a template placeholder", () => {
      expect(sole({ position: "[SIGNATORY TITLE]" })).toEqual({ ok: false, missing: ["A stated particular still contains an unresolved template placeholder"] });
    });
    it("does not print the signatory's tax or other sensitive details (only name, title, capacity and authority are used)", () => {
      expect(Object.keys(snap.signatory).sort()).toEqual(["authority", "id", "name", "position", "sourceDocumentId"]);
      expect(t).not.toMatch(/\bTIN\b|\btax\b/i);
    });
  });
  describe("Contact line: preferred correspondence email, with the account email as the fallback", () => {
    const contactOf = (instructor: Partial<InstructorSnapshot["instructor"]>) => { const x = compose({ instructor: { ...snap.instructor, ...instructor } }); return x.ok ? x.text.split("\n").find((l) => l.startsWith("Contact:")) : "REFUSED"; };
    it("prints the preferred correspondence email when one is recorded, and not the account email", () => {
      expect(contactOf({ email: "account@example.test", correspondenceEmail: "preferred@example.test" })).toBe("Contact: preferred@example.test");
      const x = compose({ instructor: { ...snap.instructor, email: "account@example.test", correspondenceEmail: "preferred@example.test" } });
      expect(x.ok && x.text).not.toContain("account@example.test");
    });
    it("falls back to the account email when there is no preference, or it was cleared or is blank", () => {
      for (const correspondenceEmail of [undefined, null, "", "   "]) expect(contactOf({ email: "account@example.test", correspondenceEmail })).toBe("Contact: account@example.test");
    });
    it("says 'Not stated' only when neither exists, and refuses a preference that is still a template placeholder", () => {
      expect(contactOf({ email: null, correspondenceEmail: null })).toBe("Contact: Not stated");
      const bad = compose({ instructor: { ...snap.instructor, correspondenceEmail: "[CONTACT EMAIL]" } });
      expect(bad).toEqual({ ok: false, missing: ["A stated particular still contains an unresolved template placeholder"] });
    });
    it("changes only the Contact line: clauses, party record, Schedule A and signature block are identical with or without a preference", () => {
      const a = compose({ instructor: { ...snap.instructor, email: "account@example.test" } });
      const b = compose({ instructor: { ...snap.instructor, email: "account@example.test", correspondenceEmail: "preferred@example.test" } });
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        const la = a.text.split("\n"), lb = b.text.split("\n");
        expect(la.length).toBe(lb.length);
        expect(la.map((l, i) => (l === lb[i] ? null : [l, lb[i]])).filter(Boolean)).toEqual([["Contact: account@example.test", "Contact: preferred@example.test"]]);
        expect(b.text).toContain(CLAUSES);
      }
    });
  });
  describe("business address and P.O. Box fields", () => {
    it("separates a postal box from the street address, passing each part on exactly as recorded", () => {
      expect(splitStoredAddress("P.O. Box GP 1234 || No. 12 Sample Road, Sample Town, Accra, Ghana")).toEqual({ businessAddress: "No. 12 Sample Road, Sample Town, Accra, Ghana", postalAddress: "P.O. Box GP 1234" });
      expect(splitStoredAddress("No. 12 Sample Road, Sample Town, Accra, Ghana || PO Box 7")).toEqual({ businessAddress: "No. 12 Sample Road, Sample Town, Accra, Ghana", postalAddress: "PO Box 7" });
      expect(splitStoredAddress("Box GP 1234 || No.12 Sampel Road, Sample Town, Accra-Ghana")).toEqual({ businessAddress: "No.12 Sampel Road, Sample Town, Accra-Ghana", postalAddress: "Box GP 1234" }); // today's Production value: parts separated, spelling untouched
      expect(splitStoredAddress("1 Example Street, Accra")).toEqual({ businessAddress: "1 Example Street, Accra", postalAddress: null });
    });
    it("prints the Founder's verified three-line address (P.O. Box GP 1234 / No. 12 Sample Road / Sample Town, Accra, Ghana) identically whether it is stored as two or three parts", () => {
      const twoParts = splitStoredAddress("P.O. Box GP 1234 || No. 12 Sample Road, Sample Town, Accra, Ghana");
      const threeParts = splitStoredAddress("P.O. Box GP 1234 || No. 12 Sample Road || Sample Town, Accra, Ghana");
      const printed = (a: ReturnType<typeof splitStoredAddress>) => { const x = compose({ contractingEntity: { ...snap.contractingEntity, ...a } }); return x.ok ? x.text.split("\n").find((l) => l.startsWith("Ordift Contracting")) : null; };
      expect(printed(threeParts)).toBe(printed(twoParts));
      expect(printed(twoParts)).toContain("business address: No. 12 Sample Road, Sample Town, Accra, Ghana; postal address: P.O. Box GP 1234");
    });
    it("never invents a street address: a postal box alone, or nothing, leaves the business address empty so the composition refuses", () => {
      expect(splitStoredAddress("P.O. Box GP 1234")).toEqual({ businessAddress: null, postalAddress: "P.O. Box GP 1234" });
      expect(splitStoredAddress("  ")).toEqual({ businessAddress: null, postalAddress: null });
      expect(splitStoredAddress(null)).toEqual({ businessAddress: null, postalAddress: null });
      const x = compose({ contractingEntity: { ...snap.contractingEntity, ...splitStoredAddress("P.O. Box GP 1234") } });
      expect(x.ok).toBe(false);
      expect(!x.ok && x.missing).toEqual(["Contracting entity business address"]);
    });
    it("prints the corrected address with the street as the business address and the box as the separate postal address - the business address is never called 'registered'", () => {
      const e = { ...snap.contractingEntity, ...splitStoredAddress("P.O. Box GP 1234 || No. 12 Sample Road, Sample Town, Accra, Ghana") };
      const x = compose({ signatory: { ...snap.signatory, name: "Alex Sample Name", position: "Chief Executive Officer", legalCapacity: "sole_proprietor" }, contractingEntity: e });
      const t = x.ok ? x.text : "";
      expect(t).toContain("business address: No. 12 Sample Road, Sample Town, Accra, Ghana; postal address: P.O. Box GP 1234");
      expect(t).not.toContain("Sampel");
      expect(t).not.toMatch(/registered address/i);
    });
  });
  it("shows an unstated optional term as 'Not stated' and invents no session, fee or date", () => {
    expect(text).toContain("Qualifications / credentials: Not stated");
    expect(text).toContain("No Session Schedule is issued with this Agreement");
    expect(text).not.toMatch(/Instructor fee|Agreed fee|USD|GHS/);
  });
  it("is deterministic (same inputs, same document and hash)", () => { expect(compose()).toEqual(r); });
  it("prints a non-range master term exactly as stated and refuses a malformed or reversed date range", () => {
    const ongoing = compose({ scheduleA: { ...terms, masterTerm: "ONGOING" } });
    expect(ongoing.ok && ongoing.text).toContain("Master term: ONGOING");
    for (const bad of ["DATE RANGE: 2027-12-31 to 2027-01-01", "DATE RANGE: 2027-02-30 to 2027-12-31"]) expect(compose({ scheduleA: { ...terms, masterTerm: bad } })).toEqual({ ok: false, missing: ["Master term (the date range is not a valid range)"] });
  });
  it("refuses to compose with any required particular missing, listing exactly which - never filling a guess or N/A", () => {
    const bad = compose({ signatory: { ...snap.signatory, authority: null }, contractingEntity: { ...snap.contractingEntity, registrationNumber: null, businessAddress: " " }, scheduleA: { ...terms, masterTerm: "", specialTerms: "" } });
    expect(bad).toEqual({ ok: false, missing: ["Contracting entity registration number", "Contracting entity business address", "Authorised signatory (name, position and authority)", "Master term", "Special terms"] });
  });
  it("refuses a stated particular that is still a template placeholder", () => {
    expect(compose({ scheduleA: { ...terms, specialTerms: "[DETAILS / NONE]" } })).toEqual({ ok: false, missing: ["A stated particular still contains an unresolved template placeholder"] });
  });
  it("refuses, with the reasons, when the master's structure cannot be identified exactly", () => {
    const refused = (m: string) => { const x = compose({}, m); return x.ok ? null : { structural: x.structural, missing: x.missing }; };
    expect(refused(MASTER.replace("SCHEDULE F - JURISDICTION ROUTING NOTES", "SCHEDULE F - NOTES"))?.structural).toBe(true); // a heading changed
    expect(refused(MASTER.replace("SCHEDULE C - ", "SCHEDULE X - "))?.structural).toBe(true); // a heading missing
    expect(refused(MASTER + "\nSCHEDULE B - WORKSHOP / SESSION SCHEDULE\n")?.missing.join(" ")).toContain("appears 2 times"); // duplicated
    expect(refused(MASTER.replace("14. PARTICIPANT CONDUCT, SAFEGUARDING AND MINORS", "14. PARTICIPANT CONDUCT").replace("15. PARTICIPANT DATA, PRIVACY AND COMMUNICATIONS", "15. PARTICIPANT DATA, PRIVACY AND COMMUNICATIONS\n15. EXTRA CLAUSE"))?.structural).toBe(true); // clause numbering broken
    expect(refused(MASTER.replace("1.2 Parties.", "1.2 Parties [DATE]."))?.missing.join(" ")).toContain("placeholder appears inside the operative clauses");
    expect(refused(MASTER.replace("PARTIES & ENGAGEMENT RECORD", "RECORD OF PARTIES"))?.structural).toBe(true);
  });
  it("refuses when Schedules A-F are out of order", () => {
    const swapped = MASTER.replace("SCHEDULE D - IP, RECORDING & CONTENT RIGHTS MATRIX", "SCHEDULE TMP").replace("SCHEDULE E - PARTICIPANT, SAFEGUARDING & DATA CONTROLS", "SCHEDULE D - IP, RECORDING & CONTENT RIGHTS MATRIX").replace("SCHEDULE TMP", "SCHEDULE E - PARTICIPANT, SAFEGUARDING & DATA CONTROLS");
    const x = compose({}, swapped);
    expect(x.ok).toBe(false);
  });
  it("formats dates without locale dependence and rejects impossible dates", () => {
    expect(longDate("2027-12-31")).toBe("31 December 2027");
    expect(longDate("2027-02-29")).toBeNull();
    expect(longDate("27-01-01")).toBeNull();
  });
});

describe("Schedule A terms", () => {
  it("requires the terms that have no verified source and validates the master's own option lists", () => {
    expect(missingScheduleATerms({})).toContain("Primary expertise");
    const v = validateScheduleATerms({ ...terms, independentStatusRoute: "EMPLOYEE", regulatoryApprovalStatus: "MAYBE", professionalRole: "KING" }, "2026-10-30");
    expect(!v.ok && v.errors.length).toBe(3);
  });
  it("the agreement's effective date is explicit and never in the past", () => {
    expect(validateScheduleATerms({ ...terms, agreementEffectiveDate: "2026-09-05" }, "2026-10-30").ok).toBe(false);
    expect(validateScheduleATerms({ ...terms, agreementEffectiveDate: "" }, "2026-10-30").ok).toBe(false);
    expect(validateScheduleATerms(terms, "2026-10-30").ok).toBe(true);
  });
});

describe("agreement stage labels - only genuine execution is Executed", () => {
  it.each([
    ["draft", null, "Draft", false], ["internal_review", null, "Draft — in internal review", false], ["approved_for_issue", null, "Approved for issue — not yet issued", false],
    ["sent", null, "Issued — awaiting signature", false], ["viewed", null, "Issued — awaiting signature (opened by a signatory)", false], ["partially_signed", null, "Partly signed — awaiting the remaining signature", false],
    ["fully_executed", null, "Executed", true], ["fully_executed", "genuine", "Executed", true], ["active", null, "Executed", true],
    ["fully_executed", "controlled_test", "Test signature — not a genuine execution", false], ["declined", null, "Declined", false], ["expired", null, "Expired", false],
  ])("%s / %s -> %s", (status, cls, label, executed) => {
    expect(instructorAgreementStage(status, cls)).toMatchObject({ label, executed });
  });
});

describe("declined and expired are read from the signatories", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  it("a refusal by either signatory reads as Declined, not as awaiting signature", () => {
    expect(instructorAgreementStage("sent", null, [{ status: "declined", linkExpiresAt: "2026-12-01T00:00:00Z" }, { status: "pending", linkExpiresAt: "2026-12-01T00:00:00Z" }], now).label).toBe("Declined by a signatory");
  });
  it("an unsigned signatory whose link has lapsed reads as expired; a fully signed one never does", () => {
    expect(instructorAgreementStage("sent", null, [{ status: "signed", linkExpiresAt: "2026-11-01T00:00:00Z" }, { status: "viewed", linkExpiresAt: "2026-11-10T00:00:00Z" }], now).label).toBe("Signing link expired — not executed");
    expect(instructorAgreementStage("fully_executed", null, [{ status: "signed", linkExpiresAt: "2026-11-01T00:00:00Z" }], now).executed).toBe(true);
  });
});

// MIGRATION-ORDER PROTECTION for the signatory guard (proposed migration 0177). The guard `private.entity_signatories_guard()` is ONE function: whichever migration
// defines it LAST wins. Migration 0177 adds the controlled end-date (the only way a signatory entry can be superseded); a later migration that re-defines the guard
// without it (the pending 0176 proposal does, as originally written) would silently remove the correction path. These checks make that impossible to do unnoticed:
// once 0177 is a migration, every migration that re-defines the guard from then on must keep the clause, and an unamended pending proposal is refused.
describe("signatory guard: a later migration cannot silently remove the controlled end-date (0177)", () => {
  const root = process.cwd();
  const clause = /ordift\.signatory_supersede/;                        // the transaction-local flag the controlled end-date depends on
  const definesGuard = /create or replace function private\.entity_signatories_guard/i;
  const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
  const migrations = readdirSync(join(root, "supabase", "migrations")).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const proposals = readdirSync(join(root, "supabase", "proposals")).filter((f) => /^PROPOSED_.+\.sql$/.test(f)).sort();
  const supersessionMigration = migrations.find((f) => /function public\.supersede_entity_signatory/i.test(read("supabase", "migrations", f)));

  it("once the supersession migration is applied, every migration from it onward that defines the guard keeps the controlled end-date", () => {
    if (!supersessionMigration) return; // 0177 is still a proposal: the proposal-level checks below apply
    const later = migrations.filter((f) => f >= supersessionMigration && definesGuard.test(read("supabase", "migrations", f)));
    expect(later.length).toBeGreaterThan(0);
    for (const f of later) expect(read("supabase", "migrations", f), `${f} re-defines the signatory guard without the controlled end-date`).toMatch(clause);
  });

  it("the proposal for 0177 defines the guard with the controlled end-date and the function that uses it", () => {
    const f = "PROPOSED_0177_entity_signatory_supersession.sql";
    if (!existsSync(join(root, "supabase", "proposals", f))) { expect(supersessionMigration).toBeDefined(); return; } // already moved into migrations
    const text = read("supabase", "proposals", f);
    expect(text).toMatch(definesGuard);
    expect(text).toMatch(clause);
    expect(text).toMatch(/ordift:signatory_end_date_controlled/);
    expect(text).toMatch(/create or replace function public\.supersede_entity_signatory/i);
  });

  it("every OTHER pending proposal that re-defines the guard is covered by an amendment that keeps the end-date (0176 must not be released unamended)", () => {
    for (const f of proposals) {
      if (f.startsWith("PROPOSED_0177")) continue;
      const text = read("supabase", "proposals", f);
      if (!definesGuard.test(text) || clause.test(text)) continue; // does not touch the guard, or already keeps the clause
      const amendment = f.replace(/^(PROPOSED_\d{4})_.*$/, "$1_amendment_for_0177.diff");
      expect(existsSync(join(root, "supabase", "proposals", amendment)), `${f} re-defines the signatory guard without the controlled end-date and has no ${amendment}`).toBe(true);
      expect(read("supabase", "proposals", amendment)).toMatch(clause);
    }
  });

  it("the rollbacks restore the guard that matches what is left in place (never one that drops the other migration's behaviour)", () => {
    const r77 = read("supabase", "proposals", "ROLLBACK_0177_entity_signatory_supersession.sql");
    const r76 = read("supabase", "proposals", "ROLLBACK_0176_ghana_admin_enhancements.sql");
    expect(r77).toMatch(/signing_designation/);          // chooses the 0176 guard when 0176 is present
    expect(r76).toMatch(clause);                           // keeps the controlled end-date when 0177 is present
    expect(r76).toMatch(/supersede_entity_signatory/);
  });
});
