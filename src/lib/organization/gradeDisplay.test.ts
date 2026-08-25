import { describe, expect, it } from "vitest";
import { formatGradeDisplay } from "@/lib/organization/gradeDisplay";

// Phase 3.2 — GR.x is display-only; grade_code stays 'G1'..'G10'
// internally (see gradeDisplay.ts header). This covers the actual
// mapping the report claims: G10 -> GR.10, G9 -> GR.9, and so on.

describe("formatGradeDisplay", () => {
  it("formats every G1..G10 code", () => {
    for (let n = 1; n <= 10; n++) {
      expect(formatGradeDisplay(`G${n}`)).toBe(`GR.${n}`);
    }
  });

  it("returns an unrecognized code unchanged rather than mangling it", () => {
    expect(formatGradeDisplay("unknown")).toBe("unknown");
    expect(formatGradeDisplay("")).toBe("");
  });
});
