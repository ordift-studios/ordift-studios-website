import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inheritedTestFlag } from "./testFlag";

describe("a quotation made for a test enquiry is a test record", () => {
  it("truth table: the flag only ever moves toward 'test'", () => {
    expect(inheritedTestFlag(undefined, true)).toBe(true);     // test enquiry, nothing said -> test
    expect(inheritedTestFlag(false, true)).toBe(true);         // test enquiry can never produce a real-looking quotation
    expect(inheritedTestFlag(true, false)).toBe(true);         // an explicit request is honoured
    expect(inheritedTestFlag(undefined, false)).toBe(false);   // a real enquiry stays real
    expect(inheritedTestFlag(undefined, null)).toBe(false);    // no enquiry / unknown -> real, exactly as before
    expect(inheritedTestFlag(undefined, undefined)).toBe(false);
  });
  const src = readFileSync(new URL("./clientQuotations.ts", import.meta.url), "utf8");
  it("creation reads the enquiry's flag and writes it with the quotation, in the single creation entry point", () => {
    expect(src).toMatch(/from\("enquiries"\)\.select\("is_test"\)\.eq\("id", params\.enquiryId\)/);
    expect(src).toContain("inheritedTestFlag(params.isTest, enquiryIsTest)");
    expect(src).toMatch(/is_test: isTest,/);
  });
  it("it never rewrites an existing record's flag: no update of is_test anywhere in the creation path or the conversion", () => {
    const conv = readFileSync(new URL("../enquiry/pricingPersistence.ts", import.meta.url), "utf8");
    for (const s of [src, conv]) expect(s).not.toMatch(/update\(\{[^}]*is_test/);
  });
});
