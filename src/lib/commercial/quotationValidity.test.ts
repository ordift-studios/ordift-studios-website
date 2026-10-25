import { describe, expect, it } from "vitest";
import { acceptanceExpiryRefusal, addDays, defaultValidUntil, isExpired, issuanceBlockers, planIssuance, quotationDates } from "./quotationValidity";

const NOW = new Date("2026-10-26T09:30:00Z");

describe("30 calendar days from the ACTUAL issue date", () => {
  it("adds 30 days across month, year and leap boundaries", () => {
    expect(defaultValidUntil(NOW)).toBe("2026-11-25");
    expect(defaultValidUntil(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-14");
    expect(defaultValidUntil(new Date("2027-02-10T12:00:00Z"))).toBe("2027-03-12");
    expect(defaultValidUntil(new Date("2028-02-10T12:00:00Z"))).toBe("2028-03-11");     // leap year
    expect(addDays("2026-01-31", 30)).toBe("2026-03-02");
  });
});

describe("issuance plan: default, exceptions, extensions", () => {
  const base = { now: NOW, existingValidUntil: null as string | null, isSuperAdmin: false };
  it("no date -> the policy default, no exception", () => {
    expect(planIssuance(base)).toMatchObject({ ok: true, validUntil: "2026-11-25", isException: false, replacedExpired: false });
  });
  it("explicitly choosing the default needs no reason", () => {
    expect(planIssuance({ ...base, requestedValidUntil: "2026-11-25" })).toMatchObject({ ok: true, isException: false });
  });
  it("a shorter period is an exception: it needs a recorded reason, but an admin may authorise it", () => {
    expect(planIssuance({ ...base, requestedValidUntil: "2026-11-10" }).ok).toBe(false);
    expect(planIssuance({ ...base, requestedValidUntil: "2026-11-10", exceptionReason: "client needs a decision before travel" })).toMatchObject({ ok: true, isException: true, isExtension: false, validUntil: "2026-11-10" });
  });
  it("beyond 30 days needs a Super Admin AND a reason", () => {
    const r = { ...base, requestedValidUntil: "2026-12-31", exceptionReason: "large corporate procurement cycle" };
    expect(planIssuance(r)).toMatchObject({ ok: false });
    expect((planIssuance(r) as { error: string }).error).toMatch(/Super Admin/);
    expect(planIssuance({ ...r, isSuperAdmin: true })).toMatchObject({ ok: true, isException: true, isExtension: true, validUntil: "2026-12-31" });
    expect(planIssuance({ ...base, isSuperAdmin: true, requestedValidUntil: "2026-12-31" }).ok).toBe(false);       // no reason
  });
  it("a date in the past is never accepted", () => {
    expect(planIssuance({ ...base, requestedValidUntil: "2026-10-25", exceptionReason: "backdating attempt here" }).ok).toBe(false);
  });
  it("an expired date left on the draft (for example carried into a revision) is never carried silently: it is replaced by the default and flagged", () => {
    expect(planIssuance({ ...base, existingValidUntil: "2026-10-12" })).toMatchObject({ ok: true, validUntil: "2026-11-25", replacedExpired: true });
  });
  it("a deliberate future date already on the draft is still checked as an exception", () => {
    expect(planIssuance({ ...base, existingValidUntil: "2026-12-31" }).ok).toBe(false);
    expect(planIssuance({ ...base, existingValidUntil: "2026-12-31", isSuperAdmin: true, exceptionReason: "agreed with the client in writing" })).toMatchObject({ ok: true, isExtension: true });
  });
  it("garbage input is refused", () => expect(planIssuance({ ...base, requestedValidUntil: "tomorrow" }).ok).toBe(false));
});

describe("prerequisites and expiry", () => {
  it("only a draft with lines and a positive total, not Crew-managed, can be issued", () => {
    expect(issuanceBlockers({ status: "draft", lineCount: 1, total: 351, crewManaged: false })).toEqual([]);
    expect(issuanceBlockers({ status: "draft", lineCount: 0, total: 0, crewManaged: false })).toHaveLength(2);
    expect(issuanceBlockers({ status: "sent", lineCount: 1, total: 10, crewManaged: false })[0]).toMatch(/already been issued/);
    expect(issuanceBlockers({ status: "draft", lineCount: 1, total: 10, crewManaged: true })[0]).toMatch(/Crew Support/);
  });
  it("expired = sent and past its valid-until date; valid THROUGH that date; a draft or accepted quotation is never 'expired'", () => {
    expect(isExpired("sent", "2026-10-25", "2026-10-26")).toBe(true);
    expect(isExpired("sent", "2026-10-26", "2026-10-26")).toBe(false);
    expect(isExpired("draft", "2026-10-01", "2026-10-26")).toBe(false);
    expect(isExpired("accepted", "2026-10-01", "2026-10-26")).toBe(false);
    expect(isExpired("sent", null, "2026-10-26")).toBe(false);
  });
  it("staff acceptance is judged on when the client accepted: in time can be recorded late, after expiry cannot", () => {
    expect(acceptanceExpiryRefusal("2026-11-25", "2026-11-25T23:00:00Z")).toBeNull();
    expect(acceptanceExpiryRefusal("2026-11-25", "2026-11-20T10:00:00Z")).toBeNull();
    expect(acceptanceExpiryRefusal("2026-11-25", "2026-11-26T00:10:00Z")).toMatch(/expired quotation cannot be accepted/);
    expect(acceptanceExpiryRefusal(null, "2030-01-01T00:00:00Z")).toBeNull();
  });
});

describe("dates shown to people: created, issued, valid until", () => {
  it("a draft never shows an issue date, even if one were somehow present", () => {
    const d = quotationDates({ createdAt: "2026-10-25T09:57:14Z", issuedAt: "2026-10-26T00:00:00Z", validUntil: null, status: "draft" }, "2026-10-26");
    expect(d.issuedText).toBe("Not yet issued");
    expect(d.issued).toBeNull();
    expect(d.createdText).toBe("25 Oct 2026");
    expect(d.validText).toMatch(/Set when issued \(30 calendar days from the issue date\)/);
  });
  it("an issued quotation shows its real issue date and validity, and flags expiry", () => {
    const ok = quotationDates({ createdAt: "2026-10-25T00:00:00Z", issuedAt: "2026-10-26T09:30:00Z", validUntil: "2026-11-25", status: "sent" }, "2026-10-27");
    expect(ok).toMatchObject({ issuedText: "26 Oct 2026", validText: "25 Nov 2026", expired: false });
    expect(quotationDates({ createdAt: "2026-10-25T00:00:00Z", issuedAt: "2026-10-26T09:30:00Z", validUntil: "2026-11-25", status: "sent" }, "2026-11-26")).toMatchObject({ expired: true, validText: "25 Nov 2026 (expired)" });
  });
  it("a quotation issued before issue dates were recorded says so; no date is invented", () => {
    const d = quotationDates({ createdAt: "2026-10-08T00:00:00Z", issuedAt: null, validUntil: null, status: "sent" }, "2026-10-26");
    expect(d.issuedText).toBe("Issue date not recorded");
    expect(d.validText).toBe("No validity date recorded");
  });
});

describe("Crew Support quotations keep their own validity wording (no ordinary 30-day claim)", () => {
  it("a Crew draft says validity is set before issue by its own rules; a set date is shown as is", () => {
    const d = quotationDates({ createdAt: "2026-10-25T00:00:00Z", issuedAt: null, validUntil: null, status: "draft" }, "2026-10-26", { crew: true });
    expect(d.validText).toBe("Set before the quotation is issued (Crew Support)");
    expect(d.validText).not.toMatch(/30/);
    expect(quotationDates({ createdAt: "2026-10-25T00:00:00Z", issuedAt: "2026-10-26T00:00:00Z", validUntil: "2026-11-09", status: "sent" }, "2026-10-27", { crew: true }).validText).toBe("9 Nov 2026");
  });
});
