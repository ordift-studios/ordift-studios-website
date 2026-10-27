import { describe, expect, it } from "vitest";
import { REGISTRATION_LABELS, registrationLabel, trackCompliance } from "./entityRegistry";

const reg = (kind: string) => ({ id: `r-${kind}`, kind: kind as never, status: "active" as never, identifier: "X", issuedOn: "2018-05-07", expiresOn: null, note: null, verifiedAt: "2026-10-22T00:00:00Z", facts: {} });

describe("jurisdiction-specific registration names (display only)", () => {
  it("Ghana calls its commercial_registration record the Business Registration Certificate", () => expect(registrationLabel("commercial_registration", "Ghana")).toBe("Business Registration Certificate"));
  it("Qatar, an unset jurisdiction and any other jurisdiction keep Commercial Registration (CR)", () => {
    for (const j of ["Qatar", null, undefined, "Kenya"]) expect(registrationLabel("commercial_registration", j)).toBe("Commercial Registration (CR)");
  });
  it("only the Ghana certificate is renamed: every other kind keeps the shared label in Ghana too", () => {
    for (const k of Object.keys(REGISTRATION_LABELS) as (keyof typeof REGISTRATION_LABELS)[]) {
      if (k === "commercial_registration") continue;
      expect(registrationLabel(k, "Ghana")).toBe(REGISTRATION_LABELS[k]);
    }
  });
  it("the shared label table itself is unchanged", () => expect(REGISTRATION_LABELS.commercial_registration).toBe("Commercial Registration (CR)"));
  it("expiry tracking carries the jurisdiction's name and nothing else changes (same state and detail)", () => {
    const g = trackCompliance([reg("commercial_registration"), reg("tax_registration")], "2026-10-27", "Ghana");
    const q = trackCompliance([reg("commercial_registration"), reg("tax_registration")], "2026-10-27", "Qatar");
    expect(g.map((t) => t.label)).toEqual(["Business Registration Certificate", "Tax registration"]);
    expect(q.map((t) => t.label)).toEqual(["Commercial Registration (CR)", "Tax registration"]);
    expect(g.map(({ label, ...rest }) => { void label; return rest; })).toEqual(q.map(({ label, ...rest }) => { void label; return rest; }));
    expect(trackCompliance([reg("commercial_registration")], "2026-10-27").map((t) => t.label)).toEqual(["Commercial Registration (CR)"]);
  });
});
