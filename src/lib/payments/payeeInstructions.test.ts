import { describe, expect, it } from "vitest";
import { maskIdentifier } from "@/lib/payments/payeeInstructions";

// Phase 3.3, Part M, Test K — payee details cannot be viewed by
// unauthorized general users. RLS (payment_instructions: read own or
// super admin) is the real access boundary and isn't locally testable
// without a live Supabase session, but the masking behavior itself —
// the thing that keeps a full account number off any admin list
// screen even for someone with legitimate read access — is pure and
// verified here directly.

describe("maskIdentifier", () => {
  it("shows only the last 4 characters", () => {
    expect(maskIdentifier("0123456789")).toBe("******6789");
  });

  it("pads short identifiers with at least 4 mask characters", () => {
    expect(maskIdentifier("12345")).toBe("****2345");
  });

  it("returns null for null input rather than masking an empty string", () => {
    expect(maskIdentifier(null)).toBeNull();
  });

  it("never returns the original value unmasked for a realistic-length account number", () => {
    const original = "GH00ORDF0123456789";
    const masked = maskIdentifier(original);
    expect(masked).not.toBe(original);
    expect(masked?.slice(-4)).toBe(original.slice(-4));
    expect(masked?.slice(0, -4)).toMatch(/^\*+$/);
  });
});
