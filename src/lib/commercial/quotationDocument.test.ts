import { describe, expect, it } from "vitest";
import {
  buildDocumentContent, canonicalContent, compareToBaseline, contentFingerprint, documentBanner, documentFileName, formatAmount, isFingerprint, shortFingerprint,
  type DocumentSource,
} from "./quotationDocument";

// Synthetic data only.
const source = (over: Partial<DocumentSource> = {}): DocumentSource => ({
  reference: "ORD-QUO-2026-009999", version: 1, currency: "QAR", issuedAt: "2026-11-04T09:30:00.000Z", validUntil: "2026-12-04",
  subtotal: 1500, discountTotal: 0, taxTotal: 0, total: 1500, paymentBookingTerms: "50% deposit to confirm.",
  items: [{ serviceItem: "Corporate headshots, half day", description: "Up to 10 people", quantity: 1, unitBasis: "package", sellingRate: 1500, discountPercent: null, taxPercent: null, lineTotal: 1500 }],
  entity: { legalName: "SYNTHETIC ENTITY W.L.L.", registrationType: "W.L.L.", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "000000" }] },
  declaredActivities: ["photography"], activityLabels: { photography: "Photography" }, ...over,
});
const fp = (over: Partial<DocumentSource> = {}) => contentFingerprint(buildDocumentContent(source(over)));

describe("the content fingerprint", () => {
  it("is a stable 64-character hex SHA-256 of the content", () => {
    const a = fp();
    expect(isFingerprint(a)).toBe(true);
    expect(fp()).toBe(a);
    expect(canonicalContent(buildDocumentContent(source()))).toContain('"reference":"ORD-QUO-2026-009999"');
  });
  it("is the same for the same money written differently (1500 and 1500.00)", () => {
    expect(fp({ total: 1500.0, subtotal: 1500.0 })).toBe(fp());
    expect(fp({ items: [{ ...source().items[0], sellingRate: 1500.004, lineTotal: 1500.001 }] })).toBe(fp());
  });
  it.each([
    ["a line amount", { items: [{ ...source().items[0], lineTotal: 1400 }] }],
    ["a line description", { items: [{ ...source().items[0], description: "Up to 20 people" }] }],
    ["the quantity", { items: [{ ...source().items[0], quantity: 2 }] }],
    ["the total", { total: 1400 }],
    ["the currency", { currency: "USD" }],
    ["the validity date", { validUntil: "2026-12-31" }],
    ["the issue date", { issuedAt: "2026-11-05T09:30:00.000Z" }],
    ["the payment terms", { paymentBookingTerms: "No deposit." }],
    ["the entity's legal name", { entity: { ...source().entity, legalName: "OTHER" } }],
    ["an entity identifier", { entity: { ...source().entity, identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "111111" }] } }],
    ["the declared activities", { declaredActivities: ["photography", "videography"] }],
    ["an added line", { items: [...source().items, { ...source().items[0], serviceItem: "Extra" }] }],
  ] as [string, Partial<DocumentSource>][])("changes when %s changes (a later edit cannot go unnoticed)", (_n, over) => {
    expect(fp(over)).not.toBe(fp());
  });
  it("does not change for things that legitimately move after issue: the status and the client's contact block are not part of it", () => {
    const c = buildDocumentContent(source());
    expect(JSON.stringify(c)).not.toMatch(/status|email|phone|prospect/i);
  });
  it("never contains internal notes, cost or margin: the content type has no such fields", () => {
    const keys = JSON.stringify(Object.keys(buildDocumentContent(source())).concat(Object.keys(buildDocumentContent(source()).items[0])));
    expect(keys).not.toMatch(/internal|commercialNotes|cost|margin|governed|adjustment|sourceReference/i);
  });
  it("is independent of the order the declared activities were supplied in", () => {
    expect(fp({ declaredActivities: ["videography", "photography"], activityLabels: { photography: "Photography", videography: "Videography" } })).toBe(fp({ declaredActivities: ["photography", "videography"], activityLabels: { photography: "Photography", videography: "Videography" } }));
  });
});

describe("comparing with the fingerprint recorded at issue", () => {
  const a = fp(); const b = fp({ total: 1 });
  it("unchanged, changed, or no baseline", () => {
    expect(compareToBaseline(a, a)).toEqual({ state: "unchanged" });
    expect(compareToBaseline(a, b)).toEqual({ state: "changed", recorded: a, current: b });
    expect(compareToBaseline(null, a)).toEqual({ state: "no_baseline" });
  });
});

describe("small presentation rules", () => {
  it("formats amounts with the currency and two decimals", () => { expect(formatAmount("QAR", 12345.5)).toBe("QAR 12,345.50"); });
  it("shortens a fingerprint to four groups of four", () => { expect(shortFingerprint("a".repeat(64))).toBe("aaaa aaaa aaaa aaaa"); });
  it("banners only the states a client should be warned about", () => {
    expect(documentBanner("sent", "2026-12-04", "2026-11-04")).toBeNull();
    expect(documentBanner("accepted", "2026-12-04", "2026-11-04")).toBeNull();
    expect(documentBanner("sent", "2026-11-03", "2026-11-04")).toMatch(/EXPIRED/);
    expect(documentBanner("expired", null, "2026-11-04")).toMatch(/EXPIRED/);
    expect(documentBanner("superseded", null, "2026-11-04")).toMatch(/SUPERSEDED/);
  });
  it("names the file after the reference and the first 8 characters of the fingerprint, safely", () => {
    expect(documentFileName("ORD-QUO-2026-000123", "abcdef0123456789".repeat(4))).toBe("ORD-QUO-2026-000123-abcdef01.pdf");
    expect(documentFileName('X "/\\ y', "00000000" + "0".repeat(56))).toBe("X-y-00000000.pdf");
  });
});
