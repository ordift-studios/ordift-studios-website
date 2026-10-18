import { isFreeMailDomain, registrableDomain } from "@/lib/organisations/names";
import { classifyEmail, normalisePhone, phoneKey } from "./emails";

// Client Directory — duplicate prevention for people. Pure.
//
// The matcher only ever SUGGESTS, except for one hard rule that the database also enforces: a personal (non-shared) email address can belong to
// only one active contact. Nothing here merges two contacts; a person decides. Name similarity alone never blocks anything, because two different
// people can share a name, so a name-only match is capped at "possible".

export type ContactCandidate = {
  id: string;
  fullName: string;
  organisationId: string | null;
  organisationName: string | null;
  status: "active" | "inactive";
  profileId: string | null;
  emails: { email: string; isShared: boolean; removed: boolean }[];
  phones: string[];
};

export type ContactQuery = { fullName: string; emails: { email: string; isShared: boolean }[]; phones: string[]; organisationId?: string | null };
export type ContactMatchReason = "same_personal_email" | "same_phone" | "similar_name" | "same_organisation" | "same_email_domain";
export type ContactMatch = { contact: ContactCandidate; score: number; strength: "same_person" | "likely" | "possible"; reasons: ContactMatchReason[] };
export type ContactMatchResult = {
  matches: ContactMatch[];
  // Contacts that hold one of the query's SHARED addresses. Informational: a shared address is not identity.
  sharedAddressHolders: { email: string; contacts: ContactCandidate[] }[];
};

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "sir", "madam", "mme", "chief", "hon", "rev", "eng"]);

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function personNameTokens(name: string): string[] {
  return stripDiacritics(name).toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/[-']/g, "").split(/\s+/).filter((t) => t && !HONORIFICS.has(t));
}

// 0..1. Order-insensitive ("Mensah Kofi" = "Kofi Mensah"); a single-letter initial matches a name that starts with it ("K. Mensah" ~ "Kofi Mensah").
export function personNameSimilarity(a: string, b: string): number {
  const ta = personNameTokens(a);
  const tb = personNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  let hits = 0;
  for (const t of short) {
    const idx = long.findIndex((u, i) => !used.has(i) && (u === t || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u))));
    if (idx >= 0) {
      used.add(idx);
      hits++;
    }
  }
  if (short.length === 1 && long.length > 1) return hits === 1 ? 0.5 : 0; // a single name alone ("Kofi") is weak evidence
  return hits / Math.max(ta.length, tb.length);
}

function activeEmails(c: ContactCandidate) {
  return c.emails.filter((e) => !e.removed);
}

export function matchContacts(candidates: ContactCandidate[], query: ContactQuery, opts: { excludeContactId?: string } = {}): ContactMatchResult {
  const qEmails = query.emails.map((e) => ({ ...e, norm: classifyEmail(e.email)?.email ?? null })).filter((e): e is { email: string; isShared: boolean; norm: string } => e.norm !== null);
  const qPersonal = new Set(qEmails.filter((e) => !e.isShared).map((e) => e.norm));
  const qShared = qEmails.filter((e) => e.isShared).map((e) => e.norm);
  const qPhoneKeys = new Set(query.phones.map((p) => normalisePhone(p)).filter((p): p is string => p !== null).map(phoneKey));
  const qDomains = new Set(qEmails.filter((e) => !e.isShared).map((e) => classifyEmail(e.norm)?.domain).filter((d): d is string => Boolean(d) && !isFreeMailDomain(d)).map((d) => registrableDomain(d)).filter((d): d is string => d !== null));

  const matches: ContactMatch[] = [];
  const sharedHolders = new Map<string, ContactCandidate[]>();

  for (const c of candidates) {
    if (c.id === opts.excludeContactId) continue;
    const emails = activeEmails(c);
    const reasons: ContactMatchReason[] = [];

    for (const e of emails) if (e.isShared && qShared.includes(e.email)) sharedHolders.set(e.email, [...(sharedHolders.get(e.email) ?? []), c]);

    const samePersonal = emails.some((e) => !e.isShared && qPersonal.has(e.email));
    if (samePersonal) reasons.push("same_personal_email");

    const samePhone = c.phones.some((p) => qPhoneKeys.has(phoneKey(p)));
    if (samePhone) reasons.push("same_phone");

    const nameSim = personNameSimilarity(c.fullName, query.fullName);
    const sameOrg = Boolean(query.organisationId) && c.organisationId === query.organisationId;
    const cDomains = new Set(emails.filter((e) => !e.isShared).map((e) => classifyEmail(e.email)?.domain).filter((d): d is string => Boolean(d) && !isFreeMailDomain(d)).map((d) => registrableDomain(d)));
    const sameDomain = [...qDomains].some((d) => cDomains.has(d));

    const nameOk = nameSim >= 0.8;
    if (nameOk) reasons.push("similar_name");
    if (nameSim >= 0.6 && sameOrg) reasons.push("same_organisation");
    if (nameSim >= 0.6 && sameDomain) reasons.push("same_email_domain");

    const corroborated = (nameOk && (samePhone || sameOrg || sameDomain)) || (samePhone && nameSim >= 0.5);
    let strength: ContactMatch["strength"] | null = null;
    if (samePersonal) strength = "same_person";
    else if (corroborated) strength = "likely";
    else if (nameOk || samePhone) strength = "possible";
    if (!strength) continue;

    const score = samePersonal ? 1 : Math.min(0.95, (nameOk ? nameSim * 0.6 : 0) + (samePhone ? 0.3 : 0) + (sameOrg ? 0.15 : 0) + (sameDomain ? 0.1 : 0));
    matches.push({ contact: c, score, strength, reasons });
  }

  matches.sort((x, y) => y.score - x.score || x.contact.fullName.localeCompare(y.contact.fullName));
  return { matches, sharedAddressHolders: [...sharedHolders].map(([email, contacts]) => ({ email, contacts })) };
}

// ---- Decisions -------------------------------------------------------------------------------------------------------------------------

export type ContactCreateDecision =
  | { ok: true }
  | { ok: false; kind: "reuse_existing"; contactId: string; error: string }
  | { ok: false; kind: "review"; contactId: string; error: string };

export function decideContactCreate(result: ContactMatchResult, confirmedDistinct: boolean): ContactCreateDecision {
  const same = result.matches.find((m) => m.strength === "same_person");
  if (same) return { ok: false, kind: "reuse_existing", contactId: same.contact.id, error: `${same.contact.fullName} already uses this personal email address. Open that contact and add details to it instead of creating a new one.` };
  const likely = result.matches.find((m) => m.strength === "likely");
  if (likely && !confirmedDistinct) return { ok: false, kind: "review", contactId: likely.contact.id, error: `${likely.contact.fullName} looks like the same person. Open that contact, or tick the box to confirm this is a different person.` };
  return { ok: true };
}

export type EmailAddDecision = { ok: true } | { ok: false; kind: "held_by_other"; contactId: string; error: string };

// Adding an address to a contact. A personal address already held by a DIFFERENT contact is not moved or merged: the two records are flagged
// for a person to review. A shared address may always be added.
export function decideEmailAdd(contactId: string, email: string, isShared: boolean, holders: { contactId: string; contactName: string; isShared: boolean }[]): EmailAddDecision {
  if (isShared) return { ok: true };
  const other = holders.find((h) => h.contactId !== contactId && !h.isShared);
  if (other) return { ok: false, kind: "held_by_other", contactId: other.contactId, error: `${other.contactName} already uses this personal address. They may be the same person: review both contacts. Nothing was changed.` };
  return { ok: true };
}

// Possible duplicates among existing contacts (for the review list), without comparing a contact with itself.
export function findPossibleDuplicates(candidates: ContactCandidate[]): { a: ContactCandidate; b: ContactCandidate; reasons: ContactMatchReason[] }[] {
  const out: { a: ContactCandidate; b: ContactCandidate; reasons: ContactMatchReason[] }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    const res = matchContacts(candidates.slice(i + 1), { fullName: a.fullName, emails: activeEmails(a).map((e) => ({ email: e.email, isShared: e.isShared })), phones: a.phones, organisationId: a.organisationId });
    for (const m of res.matches.filter((x) => x.strength !== "possible")) out.push({ a, b: m.contact, reasons: m.reasons });
  }
  return out;
}
