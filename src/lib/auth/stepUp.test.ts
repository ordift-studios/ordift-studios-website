import { describe, expect, it } from "vitest";
import { DB_SECOND_FACTOR_WINDOW_SECONDS, PROMPT_MARGIN_SECONDS, normaliseCode, purposeNeedsSecondFactor, secondFactorAgeSeconds, stepUpState } from "./stepUp";

const NOW = 1_800_000_000;
const aal2 = (age: number, extra: { method: string; timestamp: number }[] = []) => ({ currentLevel: "aal2", nextLevel: "aal2", methods: [{ method: "password", timestamp: NOW - 5000 }, { method: "totp", timestamp: NOW - age }, ...extra] });

describe("second-factor step-up rules (must mirror the database rule in migration 0185)", () => {
  it("only the irreversible actions need a second factor", () => {
    for (const p of ["erase_grant", "erase_record", "purge_log", "retention_policy"]) expect(purposeNeedsSecondFactor(p)).toBe(true);
    for (const p of ["subject_permission:verified", "file_hold:placed", "job_hold:released", "declare_people", "internal_review:approved", "record_permission:granted"]) expect(purposeNeedsSecondFactor(p)).toBe(false);
  });
  it("the window and margin are the database's 15 minutes less one minute", () => {
    expect(DB_SECOND_FACTOR_WINDOW_SECONDS).toBe(900); expect(PROMPT_MARGIN_SECONDS).toBe(60);
  });
  it("nothing enrolled: the person must enrol first, whatever the session says", () => {
    expect(stepUpState(aal2(10), false, NOW)).toBe("needs_enrolment");
    expect(stepUpState(null, false, NOW)).toBe("needs_enrolment");
  });
  it("a password-only session, or no readable session, must enter a code", () => {
    expect(stepUpState({ currentLevel: "aal1", nextLevel: "aal2", methods: [{ method: "password", timestamp: NOW - 10 }] }, true, NOW)).toBe("needs_code");
    expect(stepUpState(null, true, NOW)).toBe("needs_code");
  });
  it("a fresh second factor is accepted; one older than 14 minutes is not (so a ticket requested after the prompt stays inside the database window)", () => {
    expect(stepUpState(aal2(0), true, NOW)).toBe("ok");
    expect(stepUpState(aal2(839), true, NOW)).toBe("ok");
    expect(stepUpState(aal2(840), true, NOW)).toBe("ok");
    expect(stepUpState(aal2(841), true, NOW)).toBe("needs_code");
    expect(stepUpState(aal2(3600), true, NOW)).toBe("needs_code");
  });
  it("aal2 without a dated second-factor entry never counts as fresh, and the newest of several entries wins", () => {
    expect(stepUpState({ currentLevel: "aal2", nextLevel: "aal2", methods: [{ method: "password", timestamp: NOW - 1 }] }, true, NOW)).toBe("needs_code");
    expect(stepUpState({ currentLevel: "aal2", nextLevel: "aal2", methods: [{ method: "totp", timestamp: Number.NaN }] }, true, NOW)).toBe("needs_code");
    expect(secondFactorAgeSeconds(aal2(5000, [{ method: "totp", timestamp: NOW - 20 }]), NOW)).toBe(20);
    expect(secondFactorAgeSeconds({ currentLevel: "aal1", nextLevel: null, methods: [{ method: "otp", timestamp: NOW }] }, NOW)).toBeNull();
  });
  it("a one-time-link method is never a second factor", () => {
    expect(secondFactorAgeSeconds({ currentLevel: "aal2", nextLevel: "aal2", methods: [{ method: "otp", timestamp: NOW }, { method: "magiclink", timestamp: NOW }] }, NOW)).toBeNull();
  });
  it("codes are exactly six digits; spaces from copying are removed; everything else is refused", () => {
    expect(normaliseCode("123456")).toBe("123456"); expect(normaliseCode(" 123 456 ")).toBe("123456");
    for (const bad of ["", "12345", "1234567", "12345a", "123-456", "١٢٣٤٥٦"]) expect(normaliseCode(bad)).toBeNull();
  });
});
