import { describe, expect, it } from "vitest";
import { archiveFileName, batchHash, cleanText, DELIVERY_ACTIONS, deriveDeliveryState, formatBytes, parseDeliveryKind, parseRatings } from "./clientDelivery";

describe("batchHash", () => {
  it("is stable regardless of order and duplicates, and changes when the released set changes", () => {
    expect(batchHash(["b", "a", "a"])).toBe(batchHash(["a", "b"]));
    expect(batchHash(["a", "b"])).not.toBe(batchHash(["a", "b", "c"]));
  });
});

describe("parseDeliveryKind / cleanText", () => {
  it("accepts only the three distinct actions", () => {
    expect(parseDeliveryKind("receipt")).toBe("receipt");
    expect(parseDeliveryKind("accept")).toBe("accept");
    expect(parseDeliveryKind("corrections")).toBe("corrections");
    expect(parseDeliveryKind("complete")).toBeNull();
    expect(parseDeliveryKind(undefined)).toBeNull();
  });
  it("trims, strips control characters and bounds length", () => {
    expect(cleanText("  hi\u0000 there  ", 100)).toBe("hi there");
    expect(cleanText("x".repeat(5000), 1000)).toHaveLength(1000);
    expect(cleanText(null, 10)).toBe("");
  });
});

describe("parseRatings", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k];
  it("an overall rating alone is enough", () => {
    expect(parseRatings(get({ overall: "9" }))).toEqual({ ok: true, ratings: { overall: 9 } });
  });
  it("accepts all five categories on a 1-10 scale", () => {
    const r = parseRatings(get({ quality: "10", professionalism: "9", communication: "8", punctuality: "1", overall: "5" }));
    expect(r.ok && r.ratings).toEqual({ quality: 10, professionalism: 9, communication: 8, punctuality: 1, overall: 5 });
  });
  it("refuses nothing-selected, out of range and non-integers", () => {
    expect(parseRatings(get({})).ok).toBe(false);
    for (const bad of ["0", "11", "7.5", "abc", "-3"]) expect(parseRatings(get({ overall: bad })).ok).toBe(false);
  });
});

describe("deriveDeliveryState", () => {
  const ev = (action: string, at: string, batch: string, remarks: string | null = null) => ({ action, at, batch, remarks });
  it("receipt is not acceptance", () => {
    const s = deriveDeliveryState([ev(DELIVERY_ACTIONS.receipt, "2026-10-22T13:00:00Z", "B1")], "B1");
    expect(s.receipt).not.toBeNull();
    expect(s.accepted).toBeNull();
  });
  it("shows the latest confirmation for the current set and keeps corrections separate", () => {
    const s = deriveDeliveryState([
      ev(DELIVERY_ACTIONS.receipt, "2026-10-22T13:00:00Z", "B1"),
      ev(DELIVERY_ACTIONS.corrections, "2026-10-22T14:00:00Z", "B1", "Please brighten HD 7"),
      ev(DELIVERY_ACTIONS.accept, "2026-10-23T09:00:00Z", "B1"),
    ], "B1");
    expect(s.receipt?.at).toBe("2026-10-22T13:00:00Z");
    expect(s.accepted?.at).toBe("2026-10-23T09:00:00Z");
    expect(s.corrections?.remarks).toBe("Please brighten HD 7");
  });
  it("a confirmation of an earlier set is never presented as covering newly released files", () => {
    const s = deriveDeliveryState([ev(DELIVERY_ACTIONS.accept, "2026-10-22T13:00:00Z", "OLD")], "NEW");
    expect(s.accepted).toBeNull();
    expect(s.staleSince).toBe("2026-10-22T13:00:00Z");
  });
});

describe("archive name and size text", () => {
  it("includes the Ordift project reference and is filename-safe", () => {
    expect(archiveFileName("CSR-2026-000002")).toBe("Ordift-CSR-2026-000002-photographs.zip");
    expect(archiveFileName("../weird ref/ ")).toBe("Ordift-weird-ref-photographs.zip");
    expect(archiveFileName("")).toBe("Ordift-project-photographs.zip");
  });
  it("formats sizes", () => {
    expect(formatBytes(900)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
