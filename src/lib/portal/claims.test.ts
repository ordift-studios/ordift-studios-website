import { describe, expect, it } from "vitest";
import { assessClaimRisk, claimUrl, clampExpiryDays, clientMessage, codeMessage, deliveryAdvice, hashCode, hashToken, invitationMessage, isPlausibleToken, newCode, newToken, normaliseCode, type RiskFacts } from "./claims";

const base: RiskFacts = { email: "a@x.example", emailIsPlaceholder: false, emailIsSharedInDirectory: false, otherEnquiriesWithEmail: 0, emailAlreadyOwnedByAnAccount: false, hasDirectoryContact: true };

describe("tokens, codes and hashes", () => {
  it("makes long random tokens and six-digit codes, never the same twice, and the token passes its own shape check", () => {
    const tokens = new Set(Array.from({ length: 50 }, newToken)); expect(tokens.size).toBe(50); for (const t of tokens) expect(isPlausibleToken(t)).toBe(true);
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
    expect(new Set(Array.from({ length: 200 }, newCode)).size).toBeGreaterThan(150);
  });
  it("hashes to 64 hex characters, deterministically, and the code hash depends on the token (a code is useless with another link)", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/); expect(hashToken("abc")).toBe(hashToken("abc")); expect(hashCode("t1", "123456")).not.toBe(hashCode("t2", "123456")); expect(hashCode("t1", "123456")).not.toBe(hashToken("t1"));
  });
  it("accepts a code typed with spaces or dashes and refuses anything else", () => {
    expect(normaliseCode(" 123 456 ")).toBe("123456"); expect(normaliseCode("123-456")).toBe("123456");
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5a", null, undefined]) expect(normaliseCode(bad as string)).toBeNull();
  });
  it("refuses a malformed token before any lookup, and builds the link without a double slash", () => {
    for (const t of ["", "short", "a".repeat(44), "../etc/passwd", "a".repeat(42) + "!"]) expect(isPlausibleToken(t)).toBe(false);
    expect(claimUrl("https://example.test/", "TOK")).toBe("https://example.test/portal/claim/TOK");
  });
  it("keeps the expiry between 1 and 14 days", () => { expect(clampExpiryDays(0)).toBe(1); expect(clampExpiryDays(99)).toBe(14); expect(clampExpiryDays(NaN)).toBe(3); expect(clampExpiryDays(5)).toBe(5); });
});

describe("risk assessment: more care, never an automatic link", () => {
  it("is normal for a record with a real, unshared email, no look-alikes and a directory contact", () => { expect(assessClaimRisk(base)).toEqual({ level: "normal", reasons: [] }); });
  it("flags a shared mailbox, a missing email, look-alike records and an account with the same email", () => {
    expect(assessClaimRisk({ ...base, emailIsSharedInDirectory: true })).toMatchObject({ level: "elevated" });
    expect(assessClaimRisk({ ...base, email: null, emailIsPlaceholder: true })).toMatchObject({ level: "elevated" });
    const many = assessClaimRisk({ ...base, otherEnquiriesWithEmail: 2, emailAlreadyOwnedByAnAccount: true }); expect(many.level).toBe("elevated"); expect(many.reasons.join(" ")).toMatch(/2 other record/); expect(many.reasons.join(" ")).toMatch(/do not assume/);
    expect(assessClaimRisk({ ...base, hasDirectoryContact: false }).level).toBe("normal");
  });
  it("gives channel-specific delivery advice, stronger when the record is risky, and says the code goes separately", () => {
    expect(deliveryAdvice("whatsapp", "normal")).toMatch(/separate message/); expect(deliveryAdvice("email", "normal")).toMatch(/not in the email/); expect(deliveryAdvice("in_person", "normal")).toMatch(/while they are with you/);
    expect(deliveryAdvice("telephone", "elevated")).toMatch(/extra care/);
  });
  it("the invitation message holds the link but NEVER the code, and the code message holds only the code", () => {
    const m = invitationMessage({ name: "Ama Mensah", reference: "ENQ-1", link: "https://x.test/portal/claim/T" }); expect(m).toContain("https://x.test/portal/claim/T"); expect(m).toContain("Hello Ama"); expect(m).not.toMatch(/\d{6}/);
    expect(codeMessage("123456")).toContain("123456");
  });
});

describe("what a client is told", () => {
  it("tells a wrong code how many tries are left, and a lock plainly", () => { expect(clientMessage("bad_code", 3)).toMatch(/3 tries/); expect(clientMessage("bad_code", 1)).toMatch(/1 try /); expect(clientMessage("locked")).toMatch(/locked/); });
  it("looks the same to a stranger for an unknown, expired, revoked, used or already-owned link", () => {
    const m = clientMessage("not_found"); for (const o of ["expired", "revoked", "already_claimed", "already_owned"] as const) expect(clientMessage(o)).toBe(m);
  });
  it("explains a staff account, and never mentions another person's project", () => { expect(clientMessage("not_eligible", undefined, "staff_account")).toMatch(/staff account/); expect(clientMessage("already_claimed")).not.toMatch(/ENQ|account of|owned by/i); });
});
