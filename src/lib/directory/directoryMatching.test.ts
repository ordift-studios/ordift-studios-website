import { describe, expect, it } from "vitest";
import { FREE_MAIL_DOMAINS } from "@/lib/organisations/names";
import { classifyEmail, looksSharedAddress, normaliseEmail, normalisePhone, phoneKey } from "./emails";
import { decideContactCreate, decideEmailAdd, findPossibleDuplicates, matchContacts, personNameSimilarity, type ContactCandidate } from "./contactMatching";
import { planLink, summariseTransactions } from "./links";

// A free-mail address is built from the platform's own list at run time, so no literal address on a real mailbox provider appears in this file.
const FREE = [...FREE_MAIL_DOMAINS][0];

const c = (over: Partial<ContactCandidate> & { id: string; fullName: string }): ContactCandidate => ({
  organisationId: null, organisationName: null, status: "active", profileId: null, emails: [], phones: [], ...over,
});

const DIR: ContactCandidate[] = [
  c({ id: "c1", fullName: "Ama Example", organisationId: "o1", organisationName: "Example Hotel", emails: [{ email: "ama@hotel.example", isShared: false, removed: false }, { email: "events@hotel.example", isShared: true, removed: false }], phones: ["233240000001"] }),
  c({ id: "c2", fullName: "Kofi Sample", organisationId: "o1", organisationName: "Example Hotel", emails: [{ email: "events@hotel.example", isShared: true, removed: false }] }),
  c({ id: "c3", fullName: "Kofi Sample", emails: [{ email: "kofi.s@planner.example", isShared: false, removed: false }], phones: ["233240000002"] }),
  c({ id: "c4", fullName: "Old Person", emails: [{ email: "old@x.example", isShared: false, removed: true }] }),
];

describe("email and phone normalisation", () => {
  it("lowercases and validates, but keeps plus-tags and dots (they may identify different people)", () => {
    expect(normaliseEmail("  Ama.Example+Events@Hotel.Example ")).toBe("ama.example+events@hotel.example");
    expect(normaliseEmail("mailto:a@b.example")).toBe("a@b.example");
    expect(normaliseEmail("not an email")).toBeNull();
    expect(normaliseEmail("")).toBeNull();
  });
  it("recognises role and place addresses as shared", () => {
    expect(looksSharedAddress("info@hotel.example")).toBe(true);
    expect(looksSharedAddress("Reservations+vip@hotel.example".toLowerCase())).toBe(true);
    expect(looksSharedAddress("ama@hotel.example")).toBe(false);
    expect(classifyEmail(`ama@${FREE}`)).toMatchObject({ freeMail: true, suggestedShared: false });
  });
  it("normalises phone numbers to digits and compares by the last nine", () => {
    expect(normalisePhone("+233 (24) 000-0001")).toBe("233240000001");
    expect(normalisePhone("0024 0000 0001 2")).toBe("24000000012");
    expect(normalisePhone("123")).toBeNull();
    expect(phoneKey(normalisePhone("0240000001")!)).toBe(phoneKey(normalisePhone("+233240000001")!));
  });
});

describe("personNameSimilarity", () => {
  it("ignores order, honorifics and accents; matches initials", () => {
    expect(personNameSimilarity("Mensah Kofi", "Kofi Mensah")).toBe(1);
    expect(personNameSimilarity("Dr. Kofi Mensah", "kofi mensah")).toBe(1);
    expect(personNameSimilarity("K. Mensah", "Kofi Mensah")).toBe(1);
    expect(personNameSimilarity("José Álvarez", "Jose Alvarez")).toBe(1);
  });
  it("treats a single shared first name as weak and different people as different", () => {
    expect(personNameSimilarity("Kofi", "Kofi Mensah")).toBe(0.5);
    expect(personNameSimilarity("Kofi Mensah", "Ama Owusu")).toBe(0);
  });
});

describe("matchContacts", () => {
  it("an identical PERSONAL email is a same-person match (reuse or review, never merge)", () => {
    const r = matchContacts(DIR, { fullName: "Someone Else Entirely", emails: [{ email: "AMA@hotel.example", isShared: false }], phones: [] });
    expect(r.matches[0]).toMatchObject({ strength: "same_person" });
    expect(r.matches[0].contact.id).toBe("c1");
  });
  it("a SHARED address is never identity: it is reported as shared use only", () => {
    const r = matchContacts(DIR, { fullName: "Brand New Person", emails: [{ email: "events@hotel.example", isShared: true }], phones: [] });
    expect(r.matches).toHaveLength(0);
    expect(r.sharedAddressHolders[0].contacts.map((x) => x.id).sort()).toEqual(["c1", "c2"]);
  });
  it("does not match on an address someone has removed", () => {
    expect(matchContacts(DIR, { fullName: "Old Person", emails: [{ email: "old@x.example", isShared: false }], phones: [] }).matches.every((m) => m.strength !== "same_person")).toBe(true);
  });
  it("name alone never reaches 'likely': two people can share a name", () => {
    const r = matchContacts(DIR, { fullName: "Kofi Sample", emails: [{ email: "other@elsewhere.example", isShared: false }], phones: [] });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.every((m) => m.strength === "possible")).toBe(true);
  });
  it("a name plus a corroborating signal (same organisation, phone or business domain) is 'likely'", () => {
    const sameOrg = matchContacts(DIR, { fullName: "Kofi Sample", emails: [], phones: [], organisationId: "o1" });
    expect(sameOrg.matches.find((m) => m.contact.id === "c2")?.strength).toBe("likely");
    const byPhone = matchContacts(DIR, { fullName: "Kofi Sample", emails: [], phones: ["0240000002"] });
    expect(byPhone.matches.find((m) => m.contact.id === "c3")?.strength).toBe("likely");
    const byDomain = matchContacts(DIR, { fullName: "Kofi Sample", emails: [{ email: "k2@planner.example", isShared: false }], phones: [] });
    expect(byDomain.matches.find((m) => m.contact.id === "c3")?.strength).toBe("likely");
  });
  it("a free-mail domain is not corroboration", () => {
    const dir = [c({ id: "x1", fullName: "Kofi Sample", emails: [{ email: `someone@${FREE}`, isShared: false, removed: false }] })];
    expect(matchContacts(dir, { fullName: "Kofi Sample", emails: [{ email: `other@${FREE}`, isShared: false }], phones: [] }).matches[0].strength).toBe("possible");
  });
  it("can exclude the contact being edited", () => {
    expect(matchContacts(DIR, { fullName: "Ama Example", emails: [{ email: "ama@hotel.example", isShared: false }], phones: [] }, { excludeContactId: "c1" }).matches).toHaveLength(0);
  });
});

describe("decisions", () => {
  it("blocks creating a contact that reuses a personal email, even if the box is ticked", () => {
    const r = matchContacts(DIR, { fullName: "X Y", emails: [{ email: "ama@hotel.example", isShared: false }], phones: [] });
    expect(decideContactCreate(r, true)).toMatchObject({ ok: false, kind: "reuse_existing", contactId: "c1" });
  });
  it("asks for review of a likely match and accepts an explicit 'different person'", () => {
    const r = matchContacts(DIR, { fullName: "Kofi Sample", emails: [], phones: [], organisationId: "o1" });
    expect(decideContactCreate(r, false)).toMatchObject({ ok: false, kind: "review" });
    expect(decideContactCreate(r, true)).toEqual({ ok: true });
  });
  it("allows a person with no match", () => {
    expect(decideContactCreate(matchContacts(DIR, { fullName: "Nobody Known", emails: [], phones: [] }), false)).toEqual({ ok: true });
  });
  it("does not move or merge a personal address held by another contact, and always allows a shared one", () => {
    const holders = [{ contactId: "c1", contactName: "Ama Example", isShared: false }];
    expect(decideEmailAdd("c9", "ama@hotel.example", false, holders)).toMatchObject({ ok: false, kind: "held_by_other", contactId: "c1" });
    expect(decideEmailAdd("c1", "ama@hotel.example", false, holders)).toEqual({ ok: true });
    expect(decideEmailAdd("c9", "events@hotel.example", true, [{ contactId: "c1", contactName: "Ama", isShared: true }])).toEqual({ ok: true });
  });
  it("lists likely duplicates among existing contacts, once each and without self-matches; name-only matches are not listed", () => {
    const withTwin = [...DIR, c({ id: "c5", fullName: "Ama Example", emails: [{ email: "ama.e@other.example", isShared: false, removed: false }], phones: ["0240000001"] })];
    const dups = findPossibleDuplicates(withTwin);
    expect(dups.some((d) => [d.a.id, d.b.id].sort().join() === "c1,c5")).toBe(true);
    expect(dups.every((d) => d.a.id !== d.b.id)).toBe(true);
    expect(dups.some((d) => [d.a.id, d.b.id].sort().join() === "c2,c3")).toBe(false); // same name only
  });
});

describe("transaction context and link planning (entity-neutral directory)", () => {
  const rec = (over: Partial<Parameters<typeof summariseTransactions>[0][number]>) => ({ type: "enquiry" as const, id: "1", label: "ENQ-1", entityName: null, paymentCountry: null, isTest: false, ...over });
  it("reports the entities and markets involved without choosing any", () => {
    const ctx = summariseTransactions([rec({ entityName: "Entity A", paymentCountry: "GH" }), rec({ id: "2", entityName: "Entity A", paymentCountry: "GH" })]);
    expect(ctx).toMatchObject({ entities: ["Entity A"], markets: ["GH"], withoutEntity: 0, warnings: [] });
  });
  it("warns when linked records span entities or markets, and ignores test records", () => {
    const ctx = summariseTransactions([rec({ entityName: "Entity A", paymentCountry: "GH" }), rec({ id: "2", entityName: "Entity B", paymentCountry: "QA" }), rec({ id: "3", entityName: "Entity C", isTest: true })]);
    expect(ctx.warnings).toHaveLength(2);
    expect(ctx.entities).toEqual(["Entity A", "Entity B"]);
  });
  it("counts records with no contracting entity chosen yet", () => {
    expect(summariseTransactions([rec({}), rec({ id: "2", entityName: "Entity A" })]).withoutEntity).toBe(1);
  });
  it("requires a target and notes a different employer", () => {
    expect(planLink({ contactId: null, organisationId: null }, { contactId: null, organisationId: null }, null).ok).toBe(false);
    const plan = planLink({ contactId: null, organisationId: null }, { contactId: "c1", organisationId: "o2" }, "o1");
    expect(plan).toMatchObject({ ok: true, changes: true });
    expect(plan.ok && plan.notes).toHaveLength(1);
    expect(planLink({ contactId: "c1", organisationId: null }, { contactId: "c1", organisationId: null }, null)).toMatchObject({ ok: true, changes: false });
  });
});
