import { isFreeMailDomain, normaliseDomain } from "@/lib/organisations/names";

// Client Directory — email and phone normalisation. Pure and import-light: used by the matcher, the server layer and tests.
//
// Identity rule (see contactMatching.ts): an identical PERSONAL email address means "reuse or review the existing contact", never an automatic merge.
// A SHARED address (info@, bookings@, reservations@ ...) belongs to a place, not a person, so it is never identity: several contacts and
// organisations may hold it. We only lowercase an address; we do not strip "+tags" or Gmail dots, because that could join two different people.

export function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let e = raw.trim().replace(/^mailto:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
  if (e.length === 0 || e.length > 254 || /\s/.test(e)) return null;
  if (!/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e)) return null;
  e = e.replace(/\.$/, "");
  return e;
}

export function emailDomainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at < 0 ? null : normaliseDomain(email.slice(at + 1));
}

// Local parts that name a role or a place rather than a person.
const SHARED_LOCAL_PARTS = new Set([
  "info", "hello", "hi", "contact", "contacts", "enquiries", "enquiry", "inquiries", "inquiry", "bookings", "booking", "reservations", "reservation",
  "reception", "frontdesk", "front-desk", "events", "event", "sales", "marketing", "admin", "administrator", "office", "support", "help", "team",
  "accounts", "accounting", "finance", "billing", "procurement", "purchasing", "hr", "careers", "jobs", "press", "media", "general", "mail",
  "noreply", "no-reply", "donotreply", "orders", "studio", "concierge", "banquet", "banquets",
]);

export function looksSharedAddress(email: string): boolean {
  const local = email.slice(0, email.lastIndexOf("@")).split("+")[0];
  return SHARED_LOCAL_PARTS.has(local);
}

export type ClassifiedEmail = { email: string; domain: string | null; freeMail: boolean; suggestedShared: boolean };

export function classifyEmail(raw: string): ClassifiedEmail | null {
  const email = normaliseEmail(raw);
  if (!email) return null;
  const domain = emailDomainOf(email);
  return { email, domain, freeMail: isFreeMailDomain(domain), suggestedShared: looksSharedAddress(email) };
}

// ---- Phones --------------------------------------------------------------------------------------------------------------------------------
// Phone numbers are SUGGESTIONS only (offices and families share lines), never identity. We keep digits, and compare by the last nine digits so
// "0244 000 000" and "+233 244 000 000" line up without needing to know the country.

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function phoneKey(digits: string): string {
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export const MAX_PHONES = 5;
export const MAX_EMAILS = 10;
