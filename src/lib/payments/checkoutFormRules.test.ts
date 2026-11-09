import { describe, expect, it } from "vitest";
import { checkReferenceNote, createInFlightLock, looksLikeCardNumber, MAX_REFERENCE_NOTE } from "./checkoutFormRules";

describe("looksLikeCardNumber", () => {
  it("catches real-looking card numbers however they are spaced, and nothing it echoes", () => {
    for (const n of ["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111", "my card is 5555555555554444 thanks", "378282246310005", "6011111111111117"]) expect(looksLikeCardNumber(n), n).toBe(true);
  });
  it("allows ordinary bank references, phone numbers and short numbers", () => {
    for (const n of ["", "TRX-20261109-0042", "Ref 123456789", "0244001234", "233244001234", "4111111111111112", "1234567890123", "paid on 2026-11-09 ref 88231"]) expect(looksLikeCardNumber(n), n).toBe(false);
  });
});
describe("checkReferenceNote", () => {
  it("refuses a card number (and says to clear it) and an over-long note; accepts a normal reference", () => {
    const c = checkReferenceNote("card 4111 1111 1111 1111"); expect(c.ok).toBe(false); expect(!c.ok && c.clear).toBe(true); expect(JSON.stringify(c)).not.toMatch(/4111/);
    const l = checkReferenceNote("x".repeat(MAX_REFERENCE_NOTE + 1)); expect(l.ok).toBe(false); expect(!l.ok && l.code).toBe("note-too-long");
    expect(checkReferenceNote("Transaction ref TRX-0042").ok).toBe(true); expect(checkReferenceNote(null).ok).toBe(true);
  });
});
describe("createInFlightLock", () => {
  it("lets only the first of two quick attempts through, until released", () => {
    const l = createInFlightLock(); expect(l.tryAcquire()).toBe(true); expect(l.tryAcquire()).toBe(false); expect(l.busy).toBe(true); l.release(); expect(l.tryAcquire()).toBe(true);
  });
});
