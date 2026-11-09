import { normaliseEmail, normalisePhone } from "@/lib/directory/emails";

// STAFF CLIENT LOOKUP - pure rules (no I/O). A staff member taking an enquiry by WhatsApp, telephone or in person can check whether the person is already a client.
// It is READ-ONLY and deliberately small: it answers "is this probably the same person?" and nothing more. It shows a name, the organisation, ONE masked identifier,
// and how many earlier enquiries exist. It never shows notes, job titles, full email addresses or phone numbers, addresses, quotations, amounts or payment facts.

export const MAX_RESULTS = 5;
export const MIN_NAME_CHARS = 3;
export const MAX_QUERY_CHARS = 60;
export const LOOKUPS_PER_MINUTE = 20;

export type QueryKind = "email" | "phone" | "name";
export type ParsedQuery = { ok: true; kind: QueryKind; value: string; tokens: string[] } | { ok: false; error: string };

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();

export function parseQuery(raw: string): ParsedQuery {
  const q = String(raw ?? "").trim();
  if (!q) return { ok: false, error: "Enter a name, a phone number or a complete email address." };
  if (q.length > MAX_QUERY_CHARS) return { ok: false, error: "That is too long to search for." };
  if (q.includes("@")) {
    const email = normaliseEmail(q);
    return email ? { ok: true, kind: "email", value: email, tokens: [] } : { ok: false, error: "Enter the complete email address (name@example.com). Partial addresses are not searched." };
  }
  if (/^[+\d\s().-]+$/.test(q)) {
    const phone = normalisePhone(q);
    return phone ? { ok: true, kind: "phone", value: phone, tokens: [] } : { ok: false, error: "Enter at least 7 digits of the phone number." };
  }
  const folded = fold(q);
  if (folded.replace(/\s/g, "").length < MIN_NAME_CHARS) return { ok: false, error: `Enter at least ${MIN_NAME_CHARS} letters of the name.` };
  return { ok: true, kind: "name", value: folded, tokens: folded.split(" ") };
}

export type ContactRow = {
  id: string; fullName: string; preferredName: string | null; organisationName: string | null; status: string; phones: string[];
  emails: { email: string; isPrimary: boolean; isShared: boolean; removed: boolean }[];
};

// Phone numbers are matched by their last digits (the directory's own rule): equal last nine digits, or, for a 7-8 digit query, a matching ending.
export function phoneMatches(query: string, contactPhone: string): boolean {
  const c = normalisePhone(contactPhone);
  if (!c) return false;
  return query.length >= 9 ? c.slice(-9) === query.slice(-9) : c.endsWith(query);
}

export type MatchedBy = QueryKind;
export function matchContact(p: Extract<ParsedQuery, { ok: true }>, c: ContactRow): MatchedBy | null {
  if (c.status !== "active") return null;
  if (p.kind === "email") return c.emails.some((e) => !e.removed && !e.isShared && e.email.toLowerCase() === p.value) ? "email" : null;     // a shared address (info@, bookings@) is a place, never identity
  if (p.kind === "phone") return c.phones.some((ph) => phoneMatches(p.value, ph)) ? "phone" : null;
  const hay = [c.fullName, c.preferredName ?? "", c.organisationName ?? ""].map(fold).join(" | ");
  return p.tokens.every((t) => hay.includes(t)) ? "name" : null;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}
export function maskPhone(raw: string): string {
  const d = normalisePhone(raw);
  return d ? `•••• ${d.slice(-3)}` : "•••";
}

export type StaffClientMatch = { contactId: string; displayName: string; organisationName: string | null; matchedBy: MatchedBy; maskedEmail: string | null; maskedPhone: string | null; earlierEnquiries: number };

// The ONLY shape that leaves the server. Anything not listed here cannot reach the screen.
export function toStaffMatch(c: ContactRow, by: MatchedBy, earlierEnquiries: number): StaffClientMatch {
  const email = c.emails.filter((e) => !e.removed && !e.isShared).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.email ?? null;
  const phone = c.phones.find((p) => normalisePhone(p)) ?? null;
  return { contactId: c.id, displayName: c.preferredName?.trim() || c.fullName, organisationName: c.organisationName, matchedBy: by, maskedEmail: email ? maskEmail(email) : null, maskedPhone: phone ? maskPhone(phone) : null, earlierEnquiries };
}

// Identifier matches (email, phone) outrank name matches; ties by name. Capped, with a flag (not a count) saying there are more.
export function rankAndCap<T extends { matchedBy: MatchedBy; displayName: string }>(list: T[]): { shown: T[]; moreMatches: boolean } {
  const order: Record<MatchedBy, number> = { email: 0, phone: 1, name: 2 };
  const sorted = [...list].sort((a, b) => order[a.matchedBy] - order[b.matchedBy] || a.displayName.localeCompare(b.displayName));
  return { shown: sorted.slice(0, MAX_RESULTS), moreMatches: sorted.length > MAX_RESULTS };
}

export const lookupAllowed = (recentLookups: number) => recentLookups < LOOKUPS_PER_MINUTE;

export function duplicateMessage(matches: StaffClientMatch[]): string {
  const names = matches.slice(0, 3).map((m) => `${m.displayName}${m.maskedEmail ? ` (${m.maskedEmail})` : m.maskedPhone ? ` (${m.maskedPhone})` : ""}`).join("; ");
  return `This email or phone number matches an existing client: ${names}. Use “Find an existing client” above to choose them, or tick “This is a different person” and record the enquiry again.`;
}
