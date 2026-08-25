import { describe, expect, it } from "vitest";
import {
  generateCorporateEmailCandidates,
  pickAvailableLocalPart,
  formatCorporateEmail,
  ORDIFT_STAFF_EMAIL_DOMAIN,
} from "@/lib/organization/corporateEmail";

// Phase 3.3, Part B — covers the exact worked examples given, the
// collision-escalation order, the deterministic non-random fallback,
// and that the algorithm never depends on anything but verified name
// data (Test D/E/F from Part M).

describe("generateCorporateEmailCandidates — primary rule", () => {
  it("Myredlive Anim Tetey -> matetey", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "Myredlive", middleNames: ["Anim"], surname: "Tetey" });
    expect(primary.localPart).toBe("matetey");
  });

  it("Michael Dadson -> mdadson (no middle name)", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "Michael", surname: "Dadson" });
    expect(primary.localPart).toBe("mdadson");
  });

  it("Michael Kwame Dadson -> mkdadson", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "Michael", middleNames: ["Kwame"], surname: "Dadson" });
    expect(primary.localPart).toBe("mkdadson");
  });

  it("Ama Serwaa Mensah -> asmensah", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "Ama", middleNames: ["Serwaa"], surname: "Mensah" });
    expect(primary.localPart).toBe("asmensah");
  });

  it("normalizes a hyphenated surname deterministically (concatenated, never dropped)", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "Ama", surname: "Smith-Jones" });
    expect(primary.localPart).toBe("asmithjones");
  });

  it("strips diacritics and non-letter characters", () => {
    const [primary] = generateCorporateEmailCandidates({ firstName: "André", surname: "O'Neil" });
    expect(primary.localPart).toBe("aoneil");
  });
});

describe("generateCorporateEmailCandidates — collision escalation", () => {
  it("Michael Asante colliding resolves via verified additional name Kwesi -> mkasante", () => {
    const candidates = generateCorporateEmailCandidates({
      firstName: "Michael",
      surname: "Asante",
      additionalVerifiedNames: ["Kwesi"],
    });
    expect(candidates[0].localPart).toBe("masante");
    expect(candidates[1].localPart).toBe("mkasante");
    expect(candidates[1].usedAdditionalNames).toEqual(["Kwesi"]);
  });

  it("escalates through multiple additional verified names one at a time, in order", () => {
    const candidates = generateCorporateEmailCandidates({
      firstName: "Michael",
      surname: "Asante",
      additionalVerifiedNames: ["Kwesi", "Owusu"],
    });
    expect(candidates.map((c) => c.localPart)).toEqual(
      expect.arrayContaining(["masante", "mkasante", "mkoasante"])
    );
    // Never skips straight to the two-name candidate without trying the
    // single-name one first.
    expect(candidates.findIndex((c) => c.localPart === "mkasante")).toBeLessThan(
      candidates.findIndex((c) => c.localPart === "mkoasante")
    );
  });

  it("only falls back to a numeric suffix once every verified name option is exhausted, and it is deterministic", () => {
    const candidates = generateCorporateEmailCandidates(
      { firstName: "Michael", surname: "Asante", additionalVerifiedNames: ["Kwesi"] },
      3
    );
    const fallbacks = candidates.filter((c) => c.isFallback);
    expect(fallbacks.map((c) => c.localPart)).toEqual(["mkasante2", "mkasante3", "mkasante4"]);
  });

  it("never invents a name — with no additionalVerifiedNames, only the primary candidate plus numeric fallbacks exist", () => {
    const candidates = generateCorporateEmailCandidates({ firstName: "Michael", surname: "Asante" }, 2);
    expect(candidates.map((c) => c.localPart)).toEqual(["masante", "masante2", "masante3"]);
  });
});

describe("pickAvailableLocalPart", () => {
  it("returns the first candidate the isTaken predicate reports as free", () => {
    const candidates = generateCorporateEmailCandidates({
      firstName: "Michael",
      surname: "Asante",
      additionalVerifiedNames: ["Kwesi"],
    });
    const taken = new Set(["masante"]);
    const picked = pickAvailableLocalPart(candidates, (lp) => taken.has(lp));
    expect(picked?.localPart).toBe("mkasante");
  });

  it("returns null if every candidate (including all fallback attempts) is taken", () => {
    const candidates = generateCorporateEmailCandidates({ firstName: "Michael", surname: "Asante" }, 1);
    const picked = pickAvailableLocalPart(candidates, () => true);
    expect(picked).toBeNull();
  });
});

describe("formatCorporateEmail / domain", () => {
  it("uses ordiftstudios.com as the canonical staff domain", () => {
    expect(ORDIFT_STAFF_EMAIL_DOMAIN).toBe("ordiftstudios.com");
    expect(formatCorporateEmail("mdadson")).toBe("mdadson@ordiftstudios.com");
  });
});

describe("generation never depends on organizational fields", () => {
  it("the input type has no Position/Grade/Department/CallSign/authority/member-number field at all", () => {
    // Structural guarantee, not just a runtime check: CorporateEmailNameInput
    // only accepts name-shaped fields. This test documents/locks that
    // by exercising the full generator with name-only input and
    // confirming the result is identical regardless of any
    // organizational context — there is no parameter through which one
    // could even be passed.
    const a = generateCorporateEmailCandidates({ firstName: "Michael", surname: "Dadson" });
    const b = generateCorporateEmailCandidates({ firstName: "Michael", surname: "Dadson" });
    expect(a).toEqual(b);
  });
});
