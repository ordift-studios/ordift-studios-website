import { describe, expect, it } from "vitest";
import { awaitingJurisdictionSpecificReview, LEGAL_REPRESENTATION_ENABLED, replaceAppointment, routeLegalReview, type Appointment, type ReviewRecord } from "./legalRepresentation";

const ghana: Appointment = { id: "a1", firmId: "f-gh", firmName: "Ghana Firm", jurisdiction: "Ghana", categories: ["*"], status: "active", effectiveFrom: "2026-01-01", effectiveTo: null, evidenceReference: "Engagement letter, Jan 2026", interimFor: null };
const interimQatar: Appointment = { ...ghana, id: "a2", interimFor: { jurisdiction: "Qatar", expressAuthorisationReference: "Founder written instruction of 2026-10-01" } };
const qatar: Appointment = { id: "a3", firmId: "f-qa", firmName: "Qatar Firm", jurisdiction: "Qatar", categories: ["transaction_agreement"], status: "active", effectiveFrom: "2027-01-01", effectiveTo: null, evidenceReference: "Appointment letter", interimFor: null };

describe("routing legal reviews by jurisdiction", () => {
  it("the feature is off until the database tables are separately authorised", () => expect(LEGAL_REPRESENTATION_ENABLED).toBe(false));
  it("Ghana documents go to the Ghana firm; the Ghana firm gets no automatic access to Qatar", () => {
    expect(routeLegalReview([ghana], "Ghana", "transaction_agreement", "2026-10-30")).toMatchObject({ kind: "appointed", firmName: "Ghana Firm" });
    expect(routeLegalReview([ghana], "Qatar", "transaction_agreement", "2026-10-30").kind).toBe("none");
  });
  it("an expressly authorised interim arrangement routes Qatar advice to the Ghana firm, always as PROVISIONAL", () => {
    const r = routeLegalReview([interimQatar], "Qatar", "transaction_agreement", "2026-10-30");
    expect(r).toMatchObject({ kind: "interim", provisional: true });
    expect(r.kind === "interim" && r.note).toContain("not verified Qatar-law compliance");
    const noAuth = { ...interimQatar, interimFor: { jurisdiction: "Qatar", expressAuthorisationReference: "" } };
    expect(routeLegalReview([noAuth], "Qatar", "transaction_agreement", "2026-10-30").kind).toBe("none");
  });
  it("once a Qatar firm is appointed, new Qatar reviews go to it (only for the categories assigned) and the interim stops applying first", () => {
    expect(routeLegalReview([interimQatar, qatar], "Qatar", "transaction_agreement", "2027-02-01")).toMatchObject({ kind: "appointed", firmName: "Qatar Firm" });
    expect(routeLegalReview([qatar], "Qatar", "internal_governance", "2027-02-01").kind).toBe("none");
    expect(routeLegalReview([qatar], "Qatar", "transaction_agreement", "2026-12-31").kind).toBe("none"); // not yet in force
  });
});

describe("history is preserved", () => {
  const reviews: ReviewRecord[] = [
    { documentCode: "OS-LGL-010", versionId: "v1", firmId: "f-gh", reviewerName: "Ghana Counsel", jurisdiction: "Ghana", adviceBasisJurisdiction: "Ghana", provisional: false, decision: "approved", reviewedOn: "2026-09-05", evidenceReference: "email" },
    { documentCode: "OS-LGL-014", versionId: "v9", firmId: "f-gh", reviewerName: "Ghana Counsel", jurisdiction: "Qatar", adviceBasisJurisdiction: "Ghana", provisional: true, decision: "approved", reviewedOn: "2026-10-01", evidenceReference: "email" },
  ];
  it("lists Qatar documents still needing Qatar-specific review where earlier Ghana advice was provisional", () => {
    expect(awaitingJurisdictionSpecificReview(reviews, "Qatar")).toEqual([{ documentCode: "OS-LGL-014", versionId: "v9", provisionalBy: "Ghana Counsel" }]);
    expect(awaitingJurisdictionSpecificReview(reviews, "Ghana")).toEqual([]);
  });
  it("a later Qatar-firm approval clears the provisional item without rewriting the Ghana review", () => {
    const withQatar = [...reviews, { ...reviews[1], firmId: "f-qa", reviewerName: "Qatar Counsel", adviceBasisJurisdiction: "Qatar", provisional: false, reviewedOn: "2027-02-01" }];
    expect(awaitingJurisdictionSpecificReview(withQatar, "Qatar")).toEqual([]);
    expect(withQatar[1]).toEqual(reviews[1]);
  });
  it("replacing a firm ends the old appointment (kept) and starts a new one; it needs a reason and the same jurisdiction", () => {
    const next = { ...ghana, id: "a9", firmId: "f-gh2", firmName: "New Ghana Firm", effectiveFrom: "2027-01-01" };
    const r = replaceAppointment([ghana], { id: "a1", endedOn: "2026-12-31", reason: "Firm replaced by Founder decision." }, next);
    expect(r.ok && r.appointments.map((a) => `${a.id}:${a.status}:${a.effectiveTo ?? "-"}`)).toEqual(["a1:ended:2026-12-31", "a9:active:-"]);
    expect(replaceAppointment([ghana], { id: "a1", endedOn: "2026-12-31", reason: "x" }, next).ok).toBe(false);
    expect(replaceAppointment([ghana], { id: "a1", endedOn: "2026-12-31", reason: "Firm replaced by Founder decision." }, { ...next, jurisdiction: "Qatar" }).ok).toBe(false);
  });
});
