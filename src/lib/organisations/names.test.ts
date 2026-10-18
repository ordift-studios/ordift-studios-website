import { describe, expect, it } from "vitest";
import { blockingMatches, domainsMatch, isFreeMailDomain, matchOrganisations, nameSimilarity, normaliseDomain, normaliseOrganisationName, registrableDomain } from "./names";

describe("normaliseOrganisationName", () => {
  it("treats legal-form and punctuation variants of one name as the same key", () => {
    const keys = ["Acme Industries Ltd.", "ACME INDUSTRIES LIMITED", "Acme-Industries, Ltd", "The Acme Industries Co."].map(normaliseOrganisationName);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("acme industries");
  });
  it("folds accents and ampersands", () => {
    expect(normaliseOrganisationName("Société Générale & Fils SA")).toBe("societe generale and fils");
  });
  it("keeps a distinguishing qualifier so two entities are not merged", () => {
    expect(normaliseOrganisationName("Acme Ghana Ltd")).not.toBe(normaliseOrganisationName("Acme Qatar Ltd"));
  });
  it("never reduces a name to nothing", () => {
    expect(normaliseOrganisationName("The Company Ltd")).not.toBe("");
  });
});

describe("domains", () => {
  it("normalises addresses, urls and hosts", () => {
    expect(normaliseDomain("Jane@Mail.Example.com")).toBe("mail.example.com");
    expect(normaliseDomain("https://www.example.com/path?q=1")).toBe("example.com");
    expect(normaliseDomain("not a domain")).toBeNull();
    expect(normaliseDomain("")).toBeNull();
  });
  it("matches a sender subdomain to the organisation's own domain", () => {
    expect(registrableDomain("mail.acme.com.gh")).toBe("acme.com.gh");
    expect(registrableDomain("procurement.example.co.uk")).toBe("example.co.uk");
    expect(domainsMatch("mail.example.com", "example.com")).toBe(true);
    expect(domainsMatch("example.com", "example.org")).toBe(false);
    expect(domainsMatch(null, "example.com")).toBe(false);
  });
  it("recognises free mailbox providers", () => {
    expect(isFreeMailDomain("gmail.com")).toBe(true);
    expect(isFreeMailDomain("someone@Yahoo.com")).toBe(true);
    expect(isFreeMailDomain("example.com")).toBe(false);
  });
});

describe("nameSimilarity / matchOrganisations", () => {
  const dir = [
    { id: "1", name: "Acme Industries Limited", primaryDomain: "acme.com" },
    { id: "2", name: "Globex Corporation", primaryDomain: "globex.com" },
    { id: "3", name: "Initech Ghana", primaryDomain: null },
  ];
  it("scores identical normalised names as 1 and unrelated names low", () => {
    expect(nameSimilarity("Acme Industries Ltd", "ACME INDUSTRIES LIMITED")).toBe(1);
    expect(nameSimilarity("Acme Industries", "Globex")).toBeLessThan(0.4);
  });
  it("finds an exact match and flags it as exact", () => {
    const m = matchOrganisations(dir, { name: "ACME industries ltd." });
    expect(m[0].organisation.id).toBe("1");
    expect(m[0].strength).toBe("exact");
  });
  it("finds a likely match from a contained name, and from a shared domain", () => {
    expect(matchOrganisations(dir, { name: "Acme" })[0].strength).toBe("likely");
    const byDomain = matchOrganisations(dir, { name: "Completely Different Name", domain: "mail.globex.com" });
    expect(byDomain[0].organisation.id).toBe("2");
    expect(byDomain[0].reasons).toContain("same_domain");
  });
  it("never uses a free-mail domain as evidence of identity", () => {
    expect(matchOrganisations([{ id: "9", name: "Someone Else", primaryDomain: "gmail.com" }], { name: "Unrelated", domain: "gmail.com" })).toHaveLength(0);
  });
  it("returns nothing for a genuinely new organisation", () => {
    expect(matchOrganisations(dir, { name: "Wayne Enterprises", domain: "wayne.example" })).toHaveLength(0);
  });
  it("blockingMatches keeps only exact and likely matches", () => {
    const m = matchOrganisations([...dir, { id: "4", name: "Acme Industrial Supplies", primaryDomain: null }], { name: "Acme Industries" });
    expect(blockingMatches(m).every((x) => x.strength !== "possible")).toBe(true);
    expect(blockingMatches(m)[0].organisation.id).toBe("1");
  });
});
