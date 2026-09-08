import { describe, expect, it } from "vitest";
import { REPRESENTATION_STATUSES, isValidRepresentationTransition, isRepresented, type RepresentationStatus } from "./talentRepresentation";

describe("REPRESENTATION_STATUSES", () => {
  it("is exactly the four documented statuses", () => {
    expect(REPRESENTATION_STATUSES).toEqual(["unrepresented", "exclusive", "non_exclusive", "lapsed"]);
  });
});

describe("isValidRepresentationTransition", () => {
  it("allows unrepresented -> exclusive or non_exclusive", () => {
    expect(isValidRepresentationTransition("unrepresented", "exclusive")).toBe(true);
    expect(isValidRepresentationTransition("unrepresented", "non_exclusive")).toBe(true);
  });
  it("allows exclusive <-> non_exclusive", () => {
    expect(isValidRepresentationTransition("exclusive", "non_exclusive")).toBe(true);
    expect(isValidRepresentationTransition("non_exclusive", "exclusive")).toBe(true);
  });
  it("allows either representation status to lapse", () => {
    expect(isValidRepresentationTransition("exclusive", "lapsed")).toBe(true);
    expect(isValidRepresentationTransition("non_exclusive", "lapsed")).toBe(true);
  });
  it("lapsed can only return to unrepresented", () => {
    expect(isValidRepresentationTransition("lapsed", "unrepresented")).toBe(true);
    expect(isValidRepresentationTransition("lapsed", "exclusive")).toBe(false);
  });
  it("refuses a no-op self-transition", () => {
    for (const status of REPRESENTATION_STATUSES) {
      expect(isValidRepresentationTransition(status, status)).toBe(false);
    }
  });
});

describe("isRepresented", () => {
  it("true only for exclusive/non_exclusive", () => {
    const cases: [RepresentationStatus, boolean][] = [
      ["unrepresented", false],
      ["exclusive", true],
      ["non_exclusive", true],
      ["lapsed", false],
    ];
    for (const [status, expected] of cases) expect(isRepresented(status)).toBe(expected);
  });
});
