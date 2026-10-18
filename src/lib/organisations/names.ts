// Organisation registry — name and domain normalisation, and duplicate matching.
// Pure and import-free: used by the server layer (registry.ts) and by tests, never touches the database.
//
// The matcher only ever SUGGESTS. A person decides whether two names are the same organisation; the database
// separately refuses an exact normalised-name duplicate (unique index), so the worst case of a missed fuzzy match
// is a warning the person can still act on, never a silent merge.

const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "llc", "llp", "lp", "inc", "incorporated", "corp", "corporation", "co", "company", "plc", "pllc",
  "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "pty", "pvt", "private", "public", "holdings", "group", "the",
]);

const COMPOUND_SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "sch"]);

// Mailbox providers: a sender on one of these proves nothing about which organisation wrote the email.
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// "Acme Industries Ltd." and "ACME INDUSTRIES LIMITED" and "Acme-Industries (Ghana) Ltd" share a key (apart from the
// parenthesised qualifier, which is kept because it can genuinely distinguish two entities).
export function normaliseOrganisationName(name: string): string {
  const base = stripDiacritics(name).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = base.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !LEGAL_SUFFIXES.has(t));
  // A name made only of suffix words (e.g. "The Company") keeps its original tokens rather than becoming empty.
  return (kept.length > 0 ? kept : tokens).join(" ");
}

export function normaliseDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  if (!d) return null;
  const at = d.lastIndexOf("@");
  if (at >= 0) d = d.slice(at + 1);
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:\s]/)[0].replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null;
  return d;
}

// Registrable part of a host ("mail.acme.com.gh" -> "acme.com.gh") so a sender subdomain still matches the organisation's domain.
export function registrableDomain(host: string | null | undefined): string | null {
  const d = normaliseDomain(host);
  if (!d) return null;
  const labels = d.split(".");
  if (labels.length <= 2) return d;
  const secondLevel = labels[labels.length - 2];
  const tld = labels[labels.length - 1];
  const compound = COMPOUND_SECOND_LEVEL.has(secondLevel) && tld.length === 2;
  return labels.slice(compound ? -3 : -2).join(".");
}

export function isFreeMailDomain(domain: string | null | undefined): boolean {
  const d = normaliseDomain(domain);
  return d !== null && FREE_MAIL_DOMAINS.has(d);
}

export function domainsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = registrableDomain(a);
  const rb = registrableDomain(b);
  return ra !== null && rb !== null && ra === rb;
}

function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/\s+/g, " ");
  const out = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

// Sørensen–Dice on character bigrams of the normalised names: 1 = identical, 0 = nothing shared.
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseOrganisationName(a);
  const nb = normaliseOrganisationName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const n of ba.values()) total += n;
  for (const n of bb.values()) total += n;
  for (const [g, n] of ba) overlap += Math.min(n, bb.get(g) ?? 0);
  const dice = total === 0 ? 0 : (2 * overlap) / total;
  // One name wholly containing the other ("acme" vs "acme industries") is a strong duplicate signal on its own.
  const ta = na.split(" ");
  const tb = nb.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const contained = short.length >= 1 && short.every((t) => long.includes(t));
  return contained ? Math.max(dice, 0.85) : dice;
}

export type OrganisationCandidate = { id: string; name: string; primaryDomain: string | null };
export type MatchReason = "same_name" | "same_domain" | "similar_name";
export type OrganisationMatch = { organisation: OrganisationCandidate; score: number; strength: "exact" | "likely" | "possible"; reasons: MatchReason[] };

export const LIKELY_THRESHOLD = 0.82;
export const POSSIBLE_THRESHOLD = 0.6;

// Ranks existing organisations against a name and/or domain. A free-mail domain is never used as evidence of identity.
export function matchOrganisations(candidates: OrganisationCandidate[], query: { name: string; domain?: string | null }): OrganisationMatch[] {
  const matches: OrganisationMatch[] = [];
  const queryKey = normaliseOrganisationName(query.name);
  const queryDomain = isFreeMailDomain(query.domain) ? null : registrableDomain(query.domain);
  for (const c of candidates) {
    const reasons: MatchReason[] = [];
    const sameName = queryKey !== "" && normaliseOrganisationName(c.name) === queryKey;
    const sameDomain = queryDomain !== null && registrableDomain(c.primaryDomain) === queryDomain;
    const similarity = sameName ? 1 : nameSimilarity(c.name, query.name);
    if (sameName) reasons.push("same_name");
    if (sameDomain) reasons.push("same_domain");
    if (!sameName && similarity >= POSSIBLE_THRESHOLD) reasons.push("similar_name");
    if (reasons.length === 0) continue;
    const score = Math.min(1, similarity + (sameDomain ? 0.3 : 0));
    const strength = sameName ? "exact" : score >= LIKELY_THRESHOLD || sameDomain ? "likely" : "possible";
    matches.push({ organisation: c, score, strength, reasons });
  }
  return matches.sort((x, y) => y.score - x.score || x.organisation.name.localeCompare(y.organisation.name));
}

// What blocks a create: an exact normalised name already exists, or a "likely" match the person has not explicitly set aside.
export function blockingMatches(matches: OrganisationMatch[]): OrganisationMatch[] {
  return matches.filter((m) => m.strength === "exact" || m.strength === "likely");
}
