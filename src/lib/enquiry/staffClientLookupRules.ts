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

// ---- INDEXED LOOKUP (database function public.staff_client_lookup): how its answer is read, and when the application may fall back.
// The database already masks and caps. The application still refuses anything that is not EXACTLY the minimal masked shape, so a wrong or widened function can never put
// more on a screen than the in-memory path would.
export const RPC_COLUMNS = ["contact_id", "display_name", "organisation_name", "matched_by", "masked_email", "masked_phone", "earlier_enquiries"] as const;
export const RPC_LIMIT = MAX_RESULTS + 1;
export type LookupPath = "indexed" | "in_memory_fallback";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MASKED_EMAIL = /^[^•@\s]•••@[^\s@]+$/;
const MASKED_PHONE = /^•••• \d{3}$/;

export function fromRpcRow(row: unknown, kind: QueryKind): StaffClientMatch | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.length !== RPC_COLUMNS.length || !RPC_COLUMNS.every((k) => keys.includes(k))) return null;      // an extra or missing column is refused, never passed on
  if (typeof r.contact_id !== "string" || !UUID.test(r.contact_id)) return null;
  if (typeof r.display_name !== "string" || !r.display_name.trim()) return null;
  if (r.organisation_name !== null && typeof r.organisation_name !== "string") return null;
  if (r.matched_by !== kind) return null;
  if (r.masked_email !== null && !(typeof r.masked_email === "string" && MASKED_EMAIL.test(r.masked_email))) return null;
  if (r.masked_phone !== null && !(typeof r.masked_phone === "string" && MASKED_PHONE.test(r.masked_phone))) return null;
  if (typeof r.earlier_enquiries !== "number" || !Number.isInteger(r.earlier_enquiries) || r.earlier_enquiries < 0) return null;
  return { contactId: r.contact_id, displayName: r.display_name, organisationName: r.organisation_name as string | null, matchedBy: kind, maskedEmail: r.masked_email as string | null, maskedPhone: r.masked_phone as string | null, earlierEnquiries: r.earlier_enquiries };
}

export type RpcOutcome =
  | { ok: true; matches: StaffClientMatch[]; moreMatches: boolean }
  | { ok: false; reason: "function_missing" | "bad_input" | "failed" };

// ONLY "the function does not exist" may fall back to the in-memory path (it is the same staff-only, masked, audited answer, just slower). A permission refusal, an
// unreadable answer or any other database error fails CLOSED: nothing is shown.
export function readRpcResult(kind: QueryKind, res: { data: unknown; error: { code?: string; message?: string } | null }): RpcOutcome {
  if (res.error) {
    const code = res.error.code ?? ""; const msg = res.error.message ?? "";
    if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg)) return { ok: false, reason: "function_missing" };
    if (/ordift:lookup_bad_/.test(msg)) return { ok: false, reason: "bad_input" };
    return { ok: false, reason: "failed" };
  }
  if (!Array.isArray(res.data) || res.data.length > RPC_LIMIT) return { ok: false, reason: "failed" };
  const mapped = res.data.map((row) => fromRpcRow(row, kind));
  if (mapped.some((m) => m === null)) return { ok: false, reason: "failed" };
  const ranked = rankAndCap(mapped as StaffClientMatch[]);
  return { ok: true, matches: ranked.shown, moreMatches: ranked.moreMatches };
}
