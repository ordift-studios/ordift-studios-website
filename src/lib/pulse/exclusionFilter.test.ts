import { describe, expect, it } from "vitest";
import { classifyForExclusion } from "./exclusionFilter";

describe("classifyForExclusion", () => {
  it("includes a clearly creative-industry story with no exclusion signal", () => {
    expect(
      classifyForExclusion({ title: "Photographer Wins Major Award for Fashion Editorial", excerpt: "A profile of the winning body of work." })
    ).toBe("include");
  });

  it("excludes generic political news", () => {
    expect(
      classifyForExclusion({ title: "President Announces Cabinet Reshuffle", excerpt: "The election result triggered a government dispute." })
    ).toBe("exclude");
  });

  it("excludes generic crime news", () => {
    expect(classifyForExclusion({ title: "Robbery Reported Downtown", excerpt: "Police are investigating a shooting." })).toBe("exclude");
  });

  it("excludes generic sports news", () => {
    expect(classifyForExclusion({ title: "Local Football Match Recap", excerpt: "The basketball season continues." })).toBe("exclude");
  });

  it("excludes generic celebrity gossip", () => {
    expect(classifyForExclusion({ title: "Celebrity Divorce Shocks Fans", excerpt: "Reality TV drama continues." })).toBe("exclude");
  });

  it("routes an ambiguous government/creative-sector story to review, not auto-discard", () => {
    expect(
      classifyForExclusion({
        title: "Government Announces New Copyright Rules for Photographers",
        excerpt: "The president signed new intellectual property protections for creative professionals.",
      })
    ).toBe("review");
  });

  it("trusts an already-assigned creative category over keyword text", () => {
    expect(
      classifyForExclusion({
        title: "Election Season Fashion: How Designers Are Responding",
        excerpt: "A look at runway politics.",
        categorySlugs: ["fashion-news"],
      })
    ).toBe("include");
  });

  it("includes text with no exclusion signal at all", () => {
    expect(classifyForExclusion({ title: "New Camera Lens Announced", excerpt: "A lightweight prime lens for portrait photographers." })).toBe(
      "include"
    );
  });
});
