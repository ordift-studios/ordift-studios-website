import { describe, expect, it } from "vitest";
import { duplicateMessage, lookupAllowed, matchContact, maskEmail, maskPhone, parseQuery, phoneMatches, rankAndCap, toStaffMatch, type ContactRow } from "./staffClientLookupRules";

const jane: ContactRow = { id: "c1", fullName: "Jane Mensah-Doe", preferredName: null, organisationName: "Accra Events Ltd", status: "active", phones: ["+233 24 400 1234"],
  emails: [{ email: "jane.doe@gmail.com", isPrimary: true, isShared: false, removed: false }, { email: "bookings@accraevents.example", isPrimary: false, isShared: true, removed: false }, { email: "old@x.example", isPrimary: false, isShared: false, removed: true }] };
const ok = (raw: string) => { const p = parseQuery(raw); if (!p.ok) throw new Error(p.error); return p; };

describe("parseQuery: what may be searched", () => {
  it("accepts a complete email, a phone of at least 7 digits, or a name of at least 3 letters", () => {
    expect(ok(" Jane.Doe@Gmail.com ")).toMatchObject({ kind: "email", value: "jane.doe@gmail.com" });
    expect(ok("+233 (24) 400-1234")).toMatchObject({ kind: "phone", value: "233244001234" });
    expect(ok("Mensah")).toMatchObject({ kind: "name", tokens: ["mensah"] });
    expect(ok("Mënsah  DOE").tokens).toEqual(["mensah", "doe"]);
  });
  it("refuses partial emails, short numbers, short names, empty and over-long input (so the lookup cannot be used to browse the directory)", () => {
    for (const bad of ["", "   ", "jane@", "@gmail.com", "12345", "ab", "a b", "x".repeat(61)]) expect(parseQuery(bad).ok, bad).toBe(false);
  });
});

describe("matchContact", () => {
  it("matches an email only exactly, only a personal one, never a shared or removed address", () => {
    expect(matchContact(ok("jane.doe@gmail.com"), jane)).toBe("email");
    expect(matchContact(ok("jane.doe@gmail.co"), jane)).toBeNull();
    expect(matchContact(ok("bookings@accraevents.example"), jane)).toBeNull();
    expect(matchContact(ok("old@x.example"), jane)).toBeNull();
  });
  it("matches a phone by its last digits, in any common format", () => {
    expect(matchContact(ok("0244001234"), jane)).toBe("phone");
    expect(matchContact(ok("244 001 234"), jane)).toBe("phone");
    expect(matchContact(ok("4001234"), jane)).toBe("phone");
    expect(matchContact(ok("0244001235"), jane)).toBeNull();
    expect(phoneMatches("4001234", "n/a")).toBe(false);
  });
  it("matches names and organisations by every word, ignoring case and accents, and never an inactive contact", () => {
    expect(matchContact(ok("mensah doe"), jane)).toBe("name");
    expect(matchContact(ok("accra events"), jane)).toBe("name");
    expect(matchContact(ok("mensah kofi"), jane)).toBeNull();
    expect(matchContact(ok("jane mensah"), { ...jane, status: "inactive" })).toBeNull();
  });
});

describe("what leaves the server", () => {
  it("is a name, the organisation, ONE masked identifier each, and the number of earlier enquiries; nothing else", () => {
    const m = toStaffMatch(jane, "name", 2);
    expect(Object.keys(m).sort()).toEqual(["contactId", "displayName", "earlierEnquiries", "maskedEmail", "maskedPhone", "matchedBy", "organisationName"]);
    expect(m.maskedEmail).toBe("j•••@gmail.com"); expect(m.maskedPhone).toBe("•••• 234");
    expect(JSON.stringify(m)).not.toMatch(/jane\.doe|2334|244001|bookings@|old@/);
  });
  it("never uses a shared or removed address as the identifier shown, and copes with a contact with no email or phone", () => {
    expect(toStaffMatch({ ...jane, emails: [{ email: "bookings@a.example", isPrimary: true, isShared: true, removed: false }], phones: [] }, "name", 0)).toMatchObject({ maskedEmail: null, maskedPhone: null });
    expect(maskEmail("a@b.co")).toBe("a•••@b.co"); expect(maskPhone("12")).toBe("•••");
  });
  it("prefers the preferred name when one is set", () => expect(toStaffMatch({ ...jane, preferredName: "Jay" }, "name", 0).displayName).toBe("Jay"));
});

describe("ranking, cap and rate limit", () => {
  const mk = (n: string, by: "email" | "phone" | "name") => ({ displayName: n, matchedBy: by });
  it("puts identifier matches first, caps at five and says only that there are more", () => {
    const r = rankAndCap([mk("Zed", "name"), mk("Amy", "name"), mk("Bob", "phone"), mk("Cy", "email"), mk("Di", "name"), mk("Ed", "name"), mk("Fay", "name")]);
    expect(r.shown.map((x) => x.displayName)).toEqual(["Cy", "Bob", "Amy", "Di", "Ed"]); expect(r.moreMatches).toBe(true);
    expect(rankAndCap([mk("A", "name")]).moreMatches).toBe(false);
  });
  it("allows 20 lookups a minute", () => { expect(lookupAllowed(19)).toBe(true); expect(lookupAllowed(20)).toBe(false); });
  it("the duplicate message names at most three masked matches and shows no full identifier", () => {
    const msg = duplicateMessage([toStaffMatch(jane, "email", 1)]);
    expect(msg).toMatch(/Jane Mensah-Doe \(j•••@gmail.com\)/); expect(msg).not.toMatch(/jane\.doe@gmail/); expect(msg).toMatch(/different person/);
  });
});
