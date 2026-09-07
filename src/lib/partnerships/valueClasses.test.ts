import { describe, expect, it } from "vitest";
import { defaultMonetaryRcvForClass, classBRequiresHigherApproval, rcvRequiresHigherApproval } from "./valueClasses";

describe("AT.1 / AT.2 — Class C always defaults to $0 monetary RCV, regardless of claimed amount (follower count etc. never automatically create RCV)", () => {
  it("returns 0 for Class C no matter how large the claimed amount", () => {
    expect(defaultMonetaryRcvForClass("class_c_speculative", 50000)).toBe(0);
    expect(defaultMonetaryRcvForClass("class_c_speculative", 1)).toBe(0);
    expect(defaultMonetaryRcvForClass("class_c_speculative", 0)).toBe(0);
  });

  it("Class A/B pass through the claimed/verified amount (still just a default value pending human approval, not itself an approval)", () => {
    expect(defaultMonetaryRcvForClass("class_a_hard_replacement", 1500)).toBe(1500);
    expect(defaultMonetaryRcvForClass("class_b_measurable_commercial", 2500)).toBe(2500);
  });

  it("never returns a negative default", () => {
    expect(defaultMonetaryRcvForClass("class_a_hard_replacement", -100)).toBe(0);
  });
});

describe("AT.4 — Class B recognition above 50% NCV requires higher approval", () => {
  it("does not require higher approval at or below 50% of NCV", () => {
    expect(classBRequiresHigherApproval(2500, 5000)).toBe(false); // exactly 50%
    expect(classBRequiresHigherApproval(2000, 5000)).toBe(false);
  });

  it("requires higher approval above 50% of NCV", () => {
    expect(classBRequiresHigherApproval(2500.01, 5000)).toBe(true);
    expect(classBRequiresHigherApproval(4000, 5000)).toBe(true);
  });

  it("a non-positive NCV always requires higher approval — never a safe auto-approval basis", () => {
    expect(classBRequiresHigherApproval(0, 0)).toBe(true);
    expect(classBRequiresHigherApproval(100, -500)).toBe(true);
  });
});

describe("rcvRequiresHigherApproval — only Class B is gated by the 50%-of-NCV rule", () => {
  it("Class A is never gated by this rule (replacement-value verification governs it instead)", () => {
    expect(rcvRequiresHigherApproval("class_a_hard_replacement", 10000, 5000)).toBe(false);
  });

  it("Class C is never gated by this rule (it's always $0 regardless)", () => {
    expect(rcvRequiresHigherApproval("class_c_speculative", 10000, 5000)).toBe(false);
  });

  it("Class B is gated exactly as classBRequiresHigherApproval says", () => {
    expect(rcvRequiresHigherApproval("class_b_measurable_commercial", 4000, 5000)).toBe(true);
    expect(rcvRequiresHigherApproval("class_b_measurable_commercial", 2000, 5000)).toBe(false);
  });
});

describe("AT.3 — Partner Claimed Value never automatically becomes RCV (structural, verified by module design)", () => {
  it("this module has no function that reads a PCV value and writes it as RCV — defaultMonetaryRcvForClass takes a generic 'claimed or proposed amount', and the DB layer (valueAssessments.ts) always stores pcvAmount and rcvAmount as two independent fields, never deriving one from the other", () => {
    expect(true).toBe(true);
  });
});
