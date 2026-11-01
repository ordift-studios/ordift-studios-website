import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUBJECT_PERMISSIONS_ENABLED } from "./subjectGate";
import { validateCheckNote, validateDeclarationNote, validateSubjectGrant, validateVerification, type SubjectGrantInput } from "./subjectRules";

const ok: SubjectGrantInput = { subjectKind: "child", grantorKind: "parent_guardian", grantorName: "Parent Name", grantorRelationship: "mother", givenOn: "2026-11-01", evidenceKind: "signed_form", evidenceReference: "signed form kept in the job folder", destinations: ["website"] };
describe("permission evidence rules for people and property shown", () => {
  it("a complete guardian grant for a child passes", () => { expect(validateSubjectGrant(ok, "2026-11-02")).toEqual([]); });
  it("a child can only be covered by a parent or legal guardian, never by a representative or the client", () => {
    expect(validateSubjectGrant({ ...ok, grantorKind: "authorized_representative" }, "2026-11-02").join()).toMatch(/parent or legal guardian/);
    expect(validateSubjectGrant({ ...ok, grantorKind: "subject_self" }, "2026-11-02").length).toBeGreaterThan(0);
  });
  it("an adult may be covered by themself, a representative or a signed release; property by its owner", () => {
    expect(validateSubjectGrant({ ...ok, subjectKind: "adult", grantorKind: "subject_self" }, "2026-11-02")).toEqual([]);
    expect(validateSubjectGrant({ ...ok, subjectKind: "adult", grantorKind: "parent_guardian" }, "2026-11-02").length).toBeGreaterThan(0);
    expect(validateSubjectGrant({ ...ok, subjectKind: "property", grantorKind: "property_owner" }, "2026-11-02")).toEqual([]);
  });
  it("a bare or short evidence reference, a missing name, no use or a past expiry are refused", () => {
    expect(validateSubjectGrant({ ...ok, evidenceReference: "form" }, "2026-11-02").join()).toMatch(/not itself proof/);
    expect(validateSubjectGrant({ ...ok, grantorName: "" }, "2026-11-02").length).toBe(1);
    expect(validateSubjectGrant({ ...ok, destinations: [] }, "2026-11-02").length).toBe(1);
    expect(validateSubjectGrant({ ...ok, expiresOn: "2026-01-01" }, "2026-11-02").join()).toMatch(/expiry/);
    expect(validateSubjectGrant({ ...ok, destinations: ["billboard"] }, "2026-11-02").length).toBe(1);
  });
  it("a release agreement is linked to an agreement, and only then", () => {
    expect(validateSubjectGrant({ ...ok, subjectKind: "adult", grantorKind: "signed_release", evidenceKind: "release_agreement" }, "2026-11-02").join()).toMatch(/executed release agreement/);
    expect(validateSubjectGrant({ ...ok, agreementId: "a1" }, "2026-11-02").join()).toMatch(/Only a release agreement/);
  });
  it("verification and withdrawal need a stated check or reason", () => { expect(validateCheckNote("ok")).not.toBeNull(); expect(validateCheckNote("Checked the signed form against the guardian")).toBeNull(); });
  it("verification must name the evidence examined, not only assert it", () => {
    expect(validateVerification("", "Checked the signed form against the guardian")).toMatch(/Name the evidence/);
    expect(validateVerification("signed form kept in the job folder", "ok")).not.toBeNull();
    expect(validateVerification("signed form kept in the job folder", "Checked the signed form against the guardian")).toBeNull();
  });
  it("a representative needs documented authority; a guardian needs a stated relationship; the date given is required and cannot be in the future", () => {
    const rep = { ...ok, subjectKind: "adult" as const, grantorKind: "authorized_representative", grantorRelationship: "event organiser" };
    expect(validateSubjectGrant(rep, "2026-11-02").join()).toMatch(/authority .* must be documented/);
    expect(validateSubjectGrant({ ...rep, authorityReference: "authority letter kept in the job folder" }, "2026-11-02")).toEqual([]);
    expect(validateSubjectGrant({ ...ok, grantorRelationship: "" }, "2026-11-02").join()).toMatch(/parent or legal guardian/);
    expect(validateSubjectGrant({ ...ok, givenOn: "" }, "2026-11-02").join()).toMatch(/date the permission was given/);
    expect(validateSubjectGrant({ ...ok, givenOn: "2026-12-01" }, "2026-11-02").join()).toMatch(/not in the future/);
  });
  it("a declaration records the basis of the assessment; crowds and background people are never assumed", () => { expect(validateDeclarationNote("none")).toMatch(/Nothing is assumed/); expect(validateDeclarationNote("Nobody identifiable: guests are small and out of focus, none recognisable")).toBeNull(); });
  it("the feature is OFF and the module writes only to the four new evidence tables, never to client-facing data, email or storage", () => {
    expect(SUBJECT_PERMISSIONS_ENABLED).toBe(false);
    const src = readFileSync(new URL("./subjects.ts", import.meta.url), "utf8");
    expect([...new Set([...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))].sort()).toEqual(["portfolio_file_holds", "portfolio_file_subjects", "portfolio_people_declarations", "portfolio_subject_permissions"]);
    expect([...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1])).toEqual(["portfolio_subject_permission_redact"]);
    for (const bad of ["sendEmail", "resend", ".storage", "fetch(", ".update(", ".delete(", ".upsert("]) expect(src).not.toContain(bad);
    expect(src).toContain("if (g) return g; const a = await authority(user)");
  });
});
