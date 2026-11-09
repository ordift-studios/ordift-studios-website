import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { duplicateMessage, lookupAllowed, matchContact, parseQuery, rankAndCap, readRpcResult, RPC_LIMIT, toStaffMatch, type ContactRow, type LookupPath, type ParsedQuery, type StaffClientMatch } from "./staffClientLookupRules";

// STAFF CLIENT LOOKUP - server side (LOCAL build, nothing released). Server-only.
//  * Who: signed-in STAFF or admin (the people who may already record an enquiry). It is NOT a Super Admin power and does not use the directory's authority:
//    it can read a name, the organisation, one masked identifier and an enquiry count, and it can attach an enquiry to an EXISTING client once. It cannot read
//    notes, full contact details, quotations or payments, create, edit, merge or unlink any client, or see inactive clients.
//  * Every lookup is audited (kind, result count, query length, which path answered; never the query text or any result) and rate-limited. The audit write is strict: if it
//    cannot be recorded, nothing is shown.
//  * HOW it searches: the indexed database function public.staff_client_lookup (service role only, masked, capped) when it exists. ONLY if the function is missing does it fall
//    back to the older in-memory search, which has the same authority, masking, cap and audit; every other failure (permission, malformed or widened answer, database error)
//    fails closed. The fallback logs a warning and the audit entry says which path answered.

type Fail = { ok: false; error: string };
type Admin = ReturnType<typeof createAdminClient>;
export type LookupResult = { ok: true; kind: "email" | "phone" | "name"; results: StaffClientMatch[]; moreMatches: boolean } | Fail;
const NOT_AUTHORISED = "Not authorised to look up clients.";
const LOOKUP_ACTION = "directory.staff_lookup";
export const LINK_ACTION = "directory.staff_linked_enquiry";

async function authorisedStaff(actorUserId: string) {
  const user = await getCurrentUser();
  return user && user.id === actorUserId && isStaffOrAdmin(user) ? user : null;
}

type Raw = { id: string; full_name: string; preferred_name: string | null; phones: string[] | null; status: string; organisations: { name: string } | { name: string }[] | null;
  contact_emails: { email: string; is_primary: boolean; is_shared: boolean; removed_at: string | null }[] | null };
const SELECT = "id, full_name, preferred_name, phones, status, organisations(name), contact_emails(email, is_primary, is_shared, removed_at)";

async function loadActiveContacts(admin: Admin): Promise<ContactRow[] | null> {
  const { data, error } = await admin.from("contacts").select(SELECT).eq("status", "active").limit(5000);
  if (error) { console.error("[lookup] failed to load contacts", error.message); return null; }
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id, fullName: r.full_name, preferredName: r.preferred_name, status: r.status, phones: r.phones ?? [],
    organisationName: (Array.isArray(r.organisations) ? r.organisations[0] : r.organisations)?.name ?? null,
    emails: (r.contact_emails ?? []).map((e) => ({ email: e.email, isPrimary: e.is_primary, isShared: e.is_shared, removed: e.removed_at !== null })),
  }));
}

async function earlierEnquiryCount(admin: Admin, contactId: string): Promise<number> {
  const { count } = await admin.from("enquiries").select("id", { count: "exact", head: true }).eq("contact_id", contactId);
  return count ?? 0;
}

async function auditStrict(actorUserId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>): Promise<boolean> {
  const { error } = await createAdminClient().from("activity_log").insert({ actor_user_id: actorUserId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) { console.error("[lookup] audit write failed", action, error.message); return false; }
  return true;
}

async function matchesFor(admin: Admin, p: Extract<ParsedQuery, { ok: true }>, contacts: ContactRow[]) {
  const hits = contacts.flatMap((c) => { const by = matchContact(p, c); return by ? [{ c, by }] : []; });
  const ranked = rankAndCap(hits.map((h) => ({ ...h, matchedBy: h.by, displayName: h.c.preferredName?.trim() || h.c.fullName })));
  const shown = await Promise.all(ranked.shown.map(async (h) => toStaffMatch(h.c, h.by, await earlierEnquiryCount(admin, h.c.id))));
  return { shown, moreMatches: ranked.moreMatches };
}

type Parsed = Extract<ParsedQuery, { ok: true }>;
type Found = { ok: true; shown: StaffClientMatch[]; moreMatches: boolean; path: LookupPath } | Fail;
let fallbackWarned = false;

// One search, by the indexed function first. Fails closed except for the single "function missing" case.
async function search(admin: Admin, p: Parsed): Promise<Found> {
  const res = await admin.rpc("staff_client_lookup", { p_kind: p.kind, p_value: p.value, p_limit: RPC_LIMIT });
  const out = readRpcResult(p.kind, { data: res.data, error: res.error ? { code: res.error.code, message: res.error.message } : null });
  if (out.ok) return { ok: true, shown: out.matches, moreMatches: out.moreMatches, path: "indexed" };
  if (out.reason === "bad_input") return { ok: false, error: "That could not be searched. Check what you typed and try again." };
  if (out.reason === "failed") { console.error("[lookup] indexed lookup failed; nothing shown"); return { ok: false, error: "The client list could not be read right now. Nothing was shown." }; }
  if (!fallbackWarned) { fallbackWarned = true; console.warn("[lookup] public.staff_client_lookup is missing: using the in-memory search (slower, same limits)."); }
  const contacts = await loadActiveContacts(admin);
  if (!contacts) return { ok: false, error: "The client list could not be read right now. Nothing was shown." };
  const m = await matchesFor(admin, p, contacts);
  return { ok: true, shown: m.shown, moreMatches: m.moreMatches, path: "in_memory_fallback" };
}

export async function searchClientsForStaff(params: { actorUserId: string; query: string }): Promise<LookupResult> {
  const user = await authorisedStaff(params.actorUserId);
  if (!user) return { ok: false, error: NOT_AUTHORISED };
  const parsed = parseQuery(params.query);
  if (!parsed.ok) return parsed;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("activity_log").select("id", { count: "exact", head: true }).eq("action", LOOKUP_ACTION).eq("actor_user_id", user.id).gte("created_at", since);
  if (!lookupAllowed(count ?? 0)) return { ok: false, error: "Too many lookups in a minute. Wait a moment and try again." };
  const found = await search(admin, parsed);
  if (!found.ok) return found;
  const { shown, moreMatches, path } = found;
  const recorded = await auditStrict(user.id, LOOKUP_ACTION, "client_directory", null, { kind: parsed.kind, resultCount: shown.length, moreMatches, queryLength: params.query.trim().length, path });
  if (!recorded) return { ok: false, error: "The lookup could not be recorded, so nothing was shown. Try again." };
  return { ok: true, kind: parsed.kind, results: shown, moreMatches };
}

// Used while recording an enquiry: do the typed email or phone already belong to an existing client? Exact identifiers only (never a name).
export async function findPossibleExistingClients(params: { actorUserId: string; email: string | null; phone: string | null }): Promise<{ ok: true; matches: StaffClientMatch[]; message: string | null } | Fail> {
  const user = await authorisedStaff(params.actorUserId);
  if (!user) return { ok: false, error: NOT_AUTHORISED };
  const queries = [params.email, params.phone].flatMap((q) => { const p = q ? parseQuery(q) : null; return p && p.ok && p.kind !== "name" ? [p] : []; });
  if (queries.length === 0) return { ok: true, matches: [], message: null };
  const admin = createAdminClient();
  const found = new Map<string, StaffClientMatch>(); const paths = new Set<LookupPath>();
  for (const p of queries) {
    const r = await search(admin, p);
    if (!r.ok) return { ok: false, error: "The client list could not be read, so duplicates could not be checked. Nothing was recorded." };   // fail closed
    paths.add(r.path);
    for (const m of r.shown) if (!found.has(m.contactId)) found.set(m.contactId, m);
  }
  const matches = [...found.values()];
  const path: LookupPath = paths.has("in_memory_fallback") ? "in_memory_fallback" : "indexed";
  if (!(await auditStrict(user.id, LOOKUP_ACTION, "client_directory", null, { kind: "duplicate_check", resultCount: matches.length, moreMatches: false, queryLength: 0, path }))) return { ok: false, error: "The duplicate check could not be recorded. Nothing was recorded." };
  return { ok: true, matches, message: matches.length ? duplicateMessage(matches) : null };
}

// Attach an enquiry to an EXISTING, ACTIVE client, once. Staff cannot create, edit, merge or unlink clients, and cannot re-link an enquiry that already has a client (the
// directory's own authority, Super Admin, does that). Writes exactly the two directory link columns, only while both are empty.
export async function linkEnquiryToExistingClientAsStaff(params: { actorUserId: string; enquiryId: string; contactId: string }): Promise<{ ok: true } | Fail> {
  const user = await authorisedStaff(params.actorUserId);
  if (!user) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data: c } = await admin.from("contacts").select("id, organisation_id, status").eq("id", params.contactId).maybeSingle();
  if (!c || c.status !== "active") return { ok: false, error: "That client is not available to link." };
  const { data: e } = await admin.from("enquiries").select("id, contact_id, organisation_id").eq("id", params.enquiryId).maybeSingle();
  if (!e) return { ok: false, error: "Enquiry not found." };
  if (e.contact_id || e.organisation_id) return { ok: false, error: "This enquiry is already linked to a client. Only a Super Admin can change that." };
  const { data: done, error } = await admin.from("enquiries").update({ contact_id: c.id, organisation_id: c.organisation_id ?? null }).eq("id", params.enquiryId).is("contact_id", null).is("organisation_id", null).select("id").maybeSingle();
  if (error || !done) return { ok: false, error: "The enquiry could not be linked." };
  if (!(await auditStrict(user.id, LINK_ACTION, "enquiry", params.enquiryId, { contactId: c.id, organisationId: c.organisation_id ?? null, by: "staff_lookup" }))) {
    await admin.from("enquiries").update({ contact_id: null, organisation_id: null }).eq("id", params.enquiryId).eq("contact_id", c.id);
    return { ok: false, error: "The link could not be recorded, so it was reversed." };
  }
  return { ok: true };
}
