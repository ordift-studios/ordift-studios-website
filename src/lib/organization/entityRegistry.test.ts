import { describe, expect, it } from "vitest";
import { activityCoverage, assessContractingEligibility, buildParticulars, suggestContractingEntity, checkDuplicate, daysBetween, entityStanding, reconcileReceipt, sha256OfBytes, trackCompliance, type RegistrationFact } from "./entityRegistry";

const reg = (o: Partial<RegistrationFact> & Pick<RegistrationFact, "kind" | "status">): RegistrationFact => ({ id: `${o.kind}-1`, identifier: null, issuedOn: null, expiresOn: null, facts: {}, note: null, verifiedAt: null, ...o });
const CR = reg({ kind: "commercial_registration", status: "active", identifier: "900001", issuedOn: "2026-10-15", expiresOn: "2027-10-15", facts: { activities: [{ code: "742010", name: "Photographic activities" }], entityNumber: "00-0000-00", headOfficeCity: "Doha" } });
const PERMIT_PENDING = reg({ kind: "commercial_permit", status: "not_issued" });
const TAX = reg({ kind: "tax_registration", status: "active", identifier: "TIN-1" });
const COND = reg({ kind: "investment_approval_condition", status: "pending", facts: { workingDays: 60, approvalNoticeDate: null } });

describe("dates", () => {
  it("counts whole days between calendar dates, across month and year ends", () => {
    expect(daysBetween("2026-10-15", "2027-10-15")).toBe(365);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2027-10-16", "2027-10-15")).toBe(-1);
  });
});

describe("expiry and obligation tracking", () => {
  it("an active registration with an expiry is ok, due soon inside 90 days, overdue after expiry", () => {
    expect(trackCompliance([CR], "2026-10-16")[0]).toMatchObject({ state: "ok", daysRemaining: 364 });
    expect(trackCompliance([CR], "2027-07-20")[0]).toMatchObject({ state: "due_soon", daysRemaining: 87 });
    expect(trackCompliance([CR], "2027-10-16")[0]).toMatchObject({ state: "overdue", daysRemaining: -1 });
  });
  it("a permit that has not been issued is shown as not issued with no number, date or premises", () => {
    const t = trackCompliance([PERMIT_PENDING], "2026-10-16")[0];
    expect(t).toMatchObject({ state: "not_issued", expiresOn: null, daysRemaining: null });
    expect(t.detail).toMatch(/Nothing has been recorded/);
  });
  it("the 60-working-day condition has no deadline until the approval-notice date is recorded, and says so", () => {
    const t = trackCompliance([COND], "2026-10-16")[0];
    expect(t.state).toBe("date_unconfirmed");
    expect(t.detail).toMatch(/notice date has not been recorded/);
    expect(trackCompliance([{ ...COND, facts: { workingDays: 60, approvalNoticeDate: "2026-10-15" } }], "2026-10-16")[0].detail).toMatch(/2026-10-15/);
  });
  it("superseded and revoked records are not tracked; the most urgent item sorts first", () => {
    const list = trackCompliance([reg({ kind: "trade_name_reservation", status: "superseded" }), CR, COND, PERMIT_PENDING], "2027-10-01");
    expect(list.map((x) => x.state)).toEqual(["date_unconfirmed", "due_soon", "not_issued"]);
    expect(list[0].state).toBe("date_unconfirmed");
    expect(list.some((x) => x.kind === "trade_name_reservation")).toBe(false);
  });
  it("a document with no stated expiry is reported as such rather than given an invented date", () => {
    expect(trackCompliance([TAX], "2026-10-16")[0].state).toBe("no_expiry");
  });
});

describe("what the entity may be called", () => {
  it("registered with no permit: registered yes, permit NOT issued, a blocker is listed", () => {
    const s = entityStanding([CR, TAX, PERMIT_PENDING], "2026-10-16");
    expect(s).toMatchObject({ registered: true, permitIssued: false, taxRegistered: true, registeredActivityCodes: ["742010"] });
    expect(s.blockers.join(" ")).toMatch(/permit has not been issued/);
  });
  it("an expired registration is no longer 'registered'", () => {
    expect(entityStanding([CR], "2027-10-16").registered).toBe(false);
  });
  it("a permit counts only when recorded with a number", () => {
    expect(entityStanding([CR, reg({ kind: "commercial_permit", status: "active", identifier: "P-1" })], "2026-10-16").permitIssued).toBe(true);
    expect(entityStanding([CR, reg({ kind: "commercial_permit", status: "pending" })], "2026-10-16").permitIssued).toBe(false);
  });
});

describe("registered activities and services", () => {
  const st = entityStanding([CR], "2026-10-16");
  it("photography is covered by the photographic activity; no other service family is", () => {
    expect(activityCoverage("photography", st).covered).toBe(true);
    for (const f of ["videography", "graphic_design", "branding", "workshops", "consultancy"]) {
      const r = activityCoverage(f, st);
      expect(r.covered, f).toBe(false);
      expect(r.reason).toMatch(/not covered/);
    }
  });
  it("photography is not covered if the entity's recorded activities do not include it", () => {
    expect(activityCoverage("photography", { registeredActivityCodes: [] }).covered).toBe(false);
  });
});

describe("particulars for official documents", () => {
  const base = { legalName: "ORDIFT STUDIOS", jurisdiction: "Qatar", currency: "QAR", registrationType: "Single-Member Limited Liability Company (W.L.L.)", sensitive: { registrationNumber: "900001", taxIdentifier: "TIN-1", registeredAddress: null }, today: "2026-10-16" };
  it("prints the CR and tax number, never a permit line while no permit is recorded, and never an invented address", () => {
    const p = buildParticulars({ ...base, registrations: [CR, TAX, PERMIT_PENDING] });
    expect(p).toMatchObject({ crNumber: "900001", taxId: "TIN-1", registeredAddress: null, permitLine: null, headOfficeCity: "Doha", statements: { mayStateRegistered: true, mayStatePermitIssued: false } });
    expect(p.registeredActivities).toEqual(["742010 — Photographic activities"]);
  });
  it("prints a permit line only once a permit is recorded", () => {
    const p = buildParticulars({ ...base, registrations: [CR, TAX, reg({ kind: "commercial_permit", status: "active", identifier: "P-1", expiresOn: "2027-12-31" })] });
    expect(p.permitLine).toBe("Commercial permit P-1 (valid to 2027-12-31)");
    expect(p.statements.mayStatePermitIssued).toBe(true);
  });
  it("prints no CR number once the registration has expired", () => {
    expect(buildParticulars({ ...base, today: "2027-10-16", registrations: [CR] }).crNumber).toBeNull();
  });
});

describe("duplicate detection keeps the original", () => {
  it("the same bytes are an exact duplicate of the first copy; different bytes are new", () => {
    const a = sha256OfBytes(new TextEncoder().encode("document A"));
    const known = [{ id: "d1", sha256: a, documentType: "articles_of_association", filename: "first.pdf" }];
    expect(checkDuplicate(known, a)).toEqual({ kind: "exact_duplicate_of", of: known[0] });
    expect(checkDuplicate(known, sha256OfBytes(new TextEncoder().encode("document B")))).toEqual({ kind: "new" });
    expect(checkDuplicate([{ id: "d2", sha256: null, documentType: "x", filename: null }], a)).toEqual({ kind: "new" });
  });
});

describe("receipt reconciliation", () => {
  const lines = [
    { code: "ESTABLISHMENT_RECORD", description: "Establishment record issuance fee", amount: 200 },
    { code: "ANNUAL_CHAMBER_MEMBERSHIP", description: "Annual chamber membership fee", amount: 500 },
    { code: "SIGNATURE_ATTESTATION", description: "Attestation of each party's signature", amount: 0 },
    { code: "CR_ISSUANCE", description: "Commercial registration issuance fee", amount: 500 },
  ];
  it("zero-fee lines are not expenses; the payable lines add up to the printed total", () => {
    const r = reconcileReceipt(lines, 1200);
    expect(r).toMatchObject({ ok: true, sum: 1200, difference: 0 });
    expect(r.payable.map((l) => l.code)).toEqual(["ESTABLISHMENT_RECORD", "ANNUAL_CHAMBER_MEMBERSHIP", "CR_ISSUANCE"]);
  });
  it("a mismatch is reported with the difference, not silently accepted", () => {
    expect(reconcileReceipt(lines, 1300)).toMatchObject({ ok: false, difference: 100 });
  });
  it("avoids floating-point drift", () => {
    expect(reconcileReceipt([{ code: "a", description: "a", amount: 0.1 }, { code: "b", description: "b", amount: 0.2 }], 0.3).ok).toBe(true);
  });
});

describe("which legal entity may contract", () => {
  const base = { entityId: "q", name: "Q", verified: true, active: true };
  it("an entity with no registry records needs only to be verified and active", () => {
    expect(assessContractingEligibility({ ...base, registrations: [] }, "photography", "2026-10-16").eligible).toBe(true);
    expect(assessContractingEligibility({ ...base, verified: false, registrations: [] }, null, "2026-10-16").eligible).toBe(false);
  });
  it("an entity tracking a permit cannot contract until the permit is issued; only photography is covered", () => {
    expect(assessContractingEligibility({ ...base, registrations: [CR, PERMIT_PENDING] }, "photography", "2026-10-16").blockers.join(" ")).toMatch(/permit has not been issued/);
    const ok = { ...base, registrations: [CR, reg({ kind: "commercial_permit", status: "active", identifier: "P-1" })] };
    expect(assessContractingEligibility(ok, "photography", "2026-10-16").eligible).toBe(true);
    expect(assessContractingEligibility(ok, "videography", "2026-10-16").eligible).toBe(false);
  });
  it("a default is offered only when exactly one entity is eligible", () => {
    const yes = { eligible: true, blockers: [] }; const no = { eligible: false, blockers: ["x"] };
    expect(suggestContractingEntity([{ entityId: "a", eligibility: yes }, { entityId: "b", eligibility: no }])?.entityId).toBe("a");
    expect(suggestContractingEntity([{ entityId: "a", eligibility: yes }, { entityId: "b", eligibility: yes }])).toBeNull();
  });
});
