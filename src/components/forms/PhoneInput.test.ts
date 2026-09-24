import { describe, expect, it } from "vitest";
import { phoneInputChange } from "./PhoneInput";

// International phone input fix (2026-09-24) — Founder QA: the
// Workshop Registration phone field hard-coded a "+974" (Qatar)
// placeholder in a freeform text box, assuming/implying every visitor
// has a Qatar number. phoneInputChange() is the pure function every
// consumer (Workshop Registration, Booking, Careers application) calls
// on every keystroke/selection — real assertions, not code-reading.

describe("phoneInputChange", () => {
  it("does not hard-code Ghana or Qatar as the only option — resolves the correct calling code for any ISO country", () => {
    expect(phoneInputChange("GH", "241234567").callingCode).toBe("+233");
    expect(phoneInputChange("QA", "33123456").callingCode).toBe("+974");
    expect(phoneInputChange("GB", "7911123456").callingCode).toBe("+44");
    expect(phoneInputChange("US", "2015550123").callingCode).toBe("+1");
  });

  it("produces a valid E.164 number for a genuinely valid national number", () => {
    const result = phoneInputChange("GH", "241234567");
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe("+233241234567");
  });

  it("does not fabricate an E.164 value for an incomplete/invalid national number — e164 is null, isValid is false", () => {
    const result = phoneInputChange("GH", "12");
    expect(result.isValid).toBe(false);
    expect(result.e164).toBeNull();
  });

  it("does not assume every country has the same national-number length — a US-length number is invalid for Ghana and vice versa", () => {
    expect(phoneInputChange("GH", "2015550123").isValid).toBe(false); // 10 digits, valid shape for US, not GH
    expect(phoneInputChange("US", "2015550123").isValid).toBe(true);
  });

  it("returns the raw nationalNumber unchanged (never rewrites what the visitor typed, even mid-entry)", () => {
    expect(phoneInputChange("GH", "024 123 4567").nationalNumber).toBe("024 123 4567");
  });

  it("an empty national number is reported as invalid with no e164, not an error/throw", () => {
    const result = phoneInputChange("GH", "");
    expect(result.isValid).toBe(false);
    expect(result.e164).toBeNull();
  });
});
