import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyEmail } from "./emails";
import { decideContactCreate, matchContacts, type ContactCandidate } from "./contactMatching";
import { EMAIL_NOT_PROVIDED, LAST_WAY_TO_REACH_ERROR, MINIMUM_CONTACT_ERROR, minimumContactError, realEmailsOf, realPhonesOf, summariseContactChannels, wouldLoseLastWayToReach } from "./contactability";
import { placeholderEmailFor } from "@/lib/shared/email/placeholder";

const PLACEHOLDER = placeholderEmailFor("ENQ-2026-000010");

describe("the placeholder address is not an address", () => {
  it("is the exact value that was rejected in Production", () => {
    expect(PLACEHOLDER).toBe("enq-2026-000010@no-email.invalid");
    expect(classifyEmail(PLACEHOLDER)).toBeNull();
  });
  it("is dropped from a record's emails, so a record without an email has none", () => {
    expect(realEmailsOf([PLACEHOLDER])).toEqual([]);
    expect(realEmailsOf([null, undefined, "", "   ", PLACEHOLDER, "x@something.invalid"])).toEqual([]);
    expect(realEmailsOf([" Kofi@Example.com "])).toEqual(["Kofi@Example.com"]);
  });
  it("keeps a phone number and drops blanks", () => {
    expect(realPhonesOf(["+97466697216", "", null, "  "])).toEqual(["+97466697216"]);
  });
});

describe("minimum contactability", () => {
  it("accepts a valid email only, a valid phone only, or both", () => {
    expect(minimumContactError(["a@example.com"], [])).toBeNull();
    expect(minimumContactError([], ["97466697216"])).toBeNull();
    expect(minimumContactError(["a@example.com"], ["97466697216"])).toBeNull();
  });
  it("refuses neither, and a phone that is not a phone", () => {
    expect(minimumContactError([], [])).toBe(MINIMUM_CONTACT_ERROR);
    expect(minimumContactError([], ["12"])).toBe(MINIMUM_CONTACT_ERROR);
    expect(minimumContactError([PLACEHOLDER], [])).toBe(MINIMUM_CONTACT_ERROR);
  });
  it("blocks only a change that removes the LAST way to reach someone", () => {
    expect(wouldLoseLastWayToReach({ activeEmails: 0, phones: 1 }, { activeEmails: 0, phones: 0 })).toBe(true);
    expect(wouldLoseLastWayToReach({ activeEmails: 1, phones: 0 }, { activeEmails: 0, phones: 0 })).toBe(true);
    expect(wouldLoseLastWayToReach({ activeEmails: 1, phones: 1 }, { activeEmails: 0, phones: 1 })).toBe(false);
    // a legacy contact with neither can still be edited
    expect(wouldLoseLastWayToReach({ activeEmails: 0, phones: 0 }, { activeEmails: 0, phones: 0 })).toBe(false);
    expect(LAST_WAY_TO_REACH_ERROR).toMatch(/only way to reach/);
  });
});

describe("a phone-only contact", () => {
  const whatsAppOnly = { emails: [], phones: ["97466697216"], profileLinked: false };
  const s = summariseContactChannels(whatsAppOnly);
  it("says the email is not provided and shows the number, never an invented address", () => {
    expect(s.emailLabel).toBe(EMAIL_NOT_PROVIDED);
    expect(s.primaryEmail).toBeNull();
    expect(s.phoneLabel).toBe("97466697216");
    expect(s.phoneOrWhatsApp.available).toBe(true);
  });
  it("switches email-dependent actions off and says why", () => {
    for (const k of ["email", "automaticEmail", "portalInvitation", "accountLinkSuggestion"] as const) {
      expect(s[k].available).toBe(false);
      expect(s[k].reason).toBeTruthy();
    }
    expect(s.portalInvitation.reason).toMatch(/personal email address/);
  });
  it("a shared mailbox alone is not enough for a portal invitation", () => {
    const shared = summariseContactChannels({ emails: [{ email: "info@x.com", isPrimary: true, isShared: true, removed: false }], phones: [], profileLinked: false });
    expect(shared.automaticEmail.available).toBe(true);
    expect(shared.portalInvitation.available).toBe(false);
    expect(shared.portalInvitation.reason).toMatch(/shared mailbox/);
  });
  it("a personal email enables them, a removed email does not", () => {
    const personal = summariseContactChannels({ emails: [{ email: "a@x.com", isPrimary: true, isShared: false, removed: false }], phones: [], profileLinked: false });
    expect(personal.portalInvitation.available).toBe(true);
    const removed = summariseContactChannels({ emails: [{ email: "a@x.com", isPrimary: true, isShared: false, removed: true }], phones: ["97466697216"], profileLinked: false });
    expect(removed.email.available).toBe(false);
  });
});

describe("a phone alone never merges people", () => {
  const existing: ContactCandidate = { id: "c1", fullName: "Najib McGyver", organisationId: null, organisationName: null, status: "active", profileId: null, emails: [], phones: ["97466697216"] };
  it("the same phone with the same name is a likely duplicate to review, not an automatic merge", () => {
    const res = matchContacts([existing], { fullName: "Najib McGyver", emails: [], phones: ["+974 6669 7216"] });
    const d = decideContactCreate(res, false);
    expect(res.matches[0].strength).toBe("likely");
    expect(d.ok).toBe(false);
    expect(decideContactCreate(res, true).ok).toBe(true);
  });
  it("the same phone alone (different name) is only a possible match and does not block", () => {
    const res = matchContacts([existing], { fullName: "Someone Else", emails: [], phones: ["+97466697216"] });
    expect(res.matches[0]?.strength).toBe("possible");
    expect(decideContactCreate(res, false).ok).toBe(true);
  });
  it("a different person with a different phone and name is not matched", () => {
    expect(matchContacts([existing], { fullName: "Ama Boateng", emails: [], phones: ["233244000000"] }).matches).toEqual([]);
  });
});

describe("the directory service uses these rules", () => {
  const src = readFileSync(new URL("./directory.ts", import.meta.url), "utf8");
  it("builds a record's emails and phones through the placeholder filter, so the placeholder never reaches contact creation", () => {
    expect(src).toContain("emails: realEmailsOf([data.email])");
    expect(src).toContain("emails: realEmailsOf([data.prospect_email])");
    expect(src).not.toContain("emails: data.email ? [data.email] : []");
  });
  it("refuses a typed placeholder with its own message and requires a way to reach the contact", () => {
    expect(src).toContain("PLACEHOLDER_EMAIL_ERROR");
    expect(src).toContain("minimumContactError(");
  });
  it("never writes a fabricated address into contact_emails", () => {
    expect(src).not.toMatch(/no-email\.invalid/);
  });
});
