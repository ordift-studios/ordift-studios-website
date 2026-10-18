import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { blockingMatches, matchOrganisations, normaliseDomain, normaliseOrganisationName, registrableDomain, isFreeMailDomain, type OrganisationCandidate, type OrganisationMatch } from "@/lib/organisations/names";
import { classifyEmail, emailDomainOf, MAX_EMAILS, MAX_PHONES, normalisePhone } from "./emails";
import { decideContactCreate, decideEmailAdd, matchContacts, type ContactCandidate, type ContactMatchResult } from "./contactMatching";
import { planLink, summariseTransactions, type LinkedRecord, type TransactionContext } from "./links";

// Client Directory v1 — server layer. Server-only.
//
// What it keeps to (src/lib/directory/directory.test.ts checks this by reading the file):
//   * Access is the existing organisation-registry capability with Super Admin override, re-checked in every function. Nothing is public.
//   * Nothing links, merges, backfills or reassigns on its own. Every link is set by a person, one record at a time, and logged.
//   * The only columns it ever writes on enquiries and client_quotations are the four directory links. Stages, amounts, payment fields,
//     contracting entities and quotation status are never read for change or written here.
//   * The directory is entity-neutral: it reads the existing contracting entity and payment market to SHOW them, and never sets either.
//   * No email is sent, no mailbox read, no payment, payable, vendor or supplier record touched.

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
}
const NOT_AUTHORISED = "Not authorised to manage the client directory.";

type Admin = ReturnType<typeof createAdminClient>;
type Fail = { ok: false; error: string };

// ---- Shapes ---------------------------------------------------------------------------------------------------------------------------

export type ContactEmailView = { id: string; email: string; isPrimary: boolean; isShared: boolean; removed: boolean };
export type ContactSummary = {
  id: string;
  fullName: string;
  preferredName: string | null;
  jobTitle: string | null;
  organisationId: string | null;
  organisationName: string | null;
  status: "active" | "inactive";
  profileLinked: boolean;
  emails: ContactEmailView[];
  phones: string[];
  enquiryCount: number;
  quotationCount: number;
};
export type LinkedRecordView = LinkedRecord & { status: string; service: string | null };
export type AccountSuggestion = { profileId: string; fullName: string | null; email: string };
export type ContactDetail = ContactSummary & {
  notes: string | null;
  createdAt: string;
  profile: { id: string; fullName: string | null; email: string | null } | null;
  records: LinkedRecordView[];
  context: TransactionContext;
  possibleDuplicates: { contactId: string; fullName: string; strength: string }[];
  accountSuggestions: AccountSuggestion[];
};
export type OrganisationDetail = {
  id: string;
  name: string;
  primaryDomain: string | null;
  status: "active" | "inactive";
  notes: string | null;
  createdAt: string;
  relationships: { kind: string; status: string; approvedAt: string | null }[];
  contacts: ContactSummary[];
  applications: { id: string; status: string; reference: string | null; submittedOn: string }[];
  records: LinkedRecordView[];
  context: TransactionContext;
};
export type RecordSubject = { type: "enquiry" | "quotation"; id: string };
export type RecordLinkContext = {
  subject: RecordSubject;
  label: string;
  current: { contactId: string | null; contactName: string | null; organisationId: string | null; organisationName: string | null };
  contractingEntity: string | null;
  paymentCountry: "GH" | "QA" | null;
  contactSuggestions: { contactId: string; fullName: string; organisationName: string | null; strength: string }[];
  organisationSuggestions: { organisationId: string; name: string; strength: string }[];
  sharedAddressNotes: string[];
};

// ---- Loaders --------------------------------------------------------------------------------------------------------------------------

type RawContact = {
  id: string; full_name: string; preferred_name: string | null; job_title: string | null; organisation_id: string | null; profile_id: string | null;
  phones: string[] | null; notes: string | null; status: string; created_at: string;
  organisations: { name: string } | { name: string }[] | null;
  contact_emails: { id: string; email: string; is_primary: boolean; is_shared: boolean; removed_at: string | null }[] | null;
};
const CONTACT_SELECT = "id, full_name, preferred_name, job_title, organisation_id, profile_id, phones, notes, status, created_at, organisations(name), contact_emails(id, email, is_primary, is_shared, removed_at)";

function orgName(o: RawContact["organisations"]): string | null {
  return (Array.isArray(o) ? o[0] : o)?.name ?? null;
}

function toSummary(r: RawContact, counts: { enquiries: Map<string, number>; quotations: Map<string, number> }): ContactSummary {
  return {
    id: r.id,
    fullName: r.full_name,
    preferredName: r.preferred_name,
    jobTitle: r.job_title,
    organisationId: r.organisation_id,
    organisationName: orgName(r.organisations),
    status: r.status as "active" | "inactive",
    profileLinked: r.profile_id !== null,
    emails: (r.contact_emails ?? []).map((e) => ({ id: e.id, email: e.email, isPrimary: e.is_primary, isShared: e.is_shared, removed: e.removed_at !== null })),
    phones: r.phones ?? [],
    enquiryCount: counts.enquiries.get(r.id) ?? 0,
    quotationCount: counts.quotations.get(r.id) ?? 0,
  };
}

function toCandidate(r: RawContact): ContactCandidate {
  return {
    id: r.id,
    fullName: r.full_name,
    organisationId: r.organisation_id,
    organisationName: orgName(r.organisations),
    status: r.status as "active" | "inactive",
    profileId: r.profile_id,
    emails: (r.contact_emails ?? []).map((e) => ({ email: e.email, isShared: e.is_shared, removed: e.removed_at !== null })),
    phones: r.phones ?? [],
  };
}

async function loadRawContacts(admin: Admin): Promise<RawContact[]> {
  const { data, error } = await admin.from("contacts").select(CONTACT_SELECT).order("full_name").limit(5000);
  if (error) {
    console.error("[directory] failed to load contacts", error.message);
    return [];
  }
  return (data ?? []) as unknown as RawContact[];
}

async function linkCounts(admin: Admin, column: "contact_id" | "organisation_id") {
  const [{ data: enq }, { data: quo }] = await Promise.all([
    admin.from("enquiries").select(column).not(column, "is", null),
    admin.from("client_quotations").select(column).not(column, "is", null),
  ]);
  const tally = (rows: unknown[] | null) => {
    const m = new Map<string, number>();
    for (const r of (rows ?? []) as Record<string, string>[]) m.set(r[column], (m.get(r[column]) ?? 0) + 1);
    return m;
  };
  return { enquiries: tally(enq), quotations: tally(quo) };
}

async function loadOrganisationCandidates(admin: Admin): Promise<OrganisationCandidate[]> {
  const { data } = await admin.from("organisations").select("id, name, primary_domain").limit(5000);
  return (data ?? []).map((o) => ({ id: o.id, name: o.name, primaryDomain: o.primary_domain }));
}

// The contracting entity (latest version) and payment market are READ here only so they can be shown; they are never set from the directory.
async function loadLinkedRecords(admin: Admin, by: { column: "contact_id" | "organisation_id"; id: string }): Promise<LinkedRecordView[]> {
  const [{ data: enquiries }, { data: quotations }] = await Promise.all([
    admin.from("enquiries").select("id, reference_number, service, crm_stage, payment_country, is_test").eq(by.column, by.id).order("submitted_at", { ascending: false }),
    admin.from("client_quotations").select("id, quotation_reference, status, is_test").eq(by.column, by.id).order("created_at", { ascending: false }),
  ]);
  const enq = enquiries ?? [];
  const quo = quotations ?? [];
  const entityBySubject = await loadContractingEntityNames(admin, [
    ...enq.map((e) => ({ type: "enquiry", id: e.id })),
    ...quo.map((q) => ({ type: "quotation", id: q.id })),
  ]);
  return [
    ...enq.map((e): LinkedRecordView => ({ type: "enquiry", id: e.id, label: e.reference_number, entityName: entityBySubject.get(`enquiry:${e.id}`) ?? null, paymentCountry: e.payment_country === "GH" || e.payment_country === "QA" ? e.payment_country : null, isTest: Boolean(e.is_test), status: e.crm_stage, service: e.service })),
    ...quo.map((q): LinkedRecordView => ({ type: "quotation", id: q.id, label: q.quotation_reference, entityName: entityBySubject.get(`quotation:${q.id}`) ?? null, paymentCountry: null, isTest: Boolean(q.is_test), status: q.status, service: null })),
  ];
}

async function loadContractingEntityNames(admin: Admin, subjects: { type: string; id: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (subjects.length === 0) return out;
  const ids = subjects.map((s) => s.id);
  const { data: rows } = await admin.from("booking_contracting_entities").select("subject_type, subject_id, version, employing_entity_id").in("subject_id", ids).in("subject_type", ["enquiry", "quotation"]);
  const latest = new Map<string, { version: number; entityId: string }>();
  for (const r of rows ?? []) {
    const key = `${r.subject_type}:${r.subject_id}`;
    const cur = latest.get(key);
    if (!cur || r.version > cur.version) latest.set(key, { version: r.version, entityId: r.employing_entity_id });
  }
  if (latest.size === 0) return out;
  const { data: entities } = await admin.from("employing_entities").select("id, name").in("id", [...new Set([...latest.values()].map((v) => v.entityId))]);
  const nameById = new Map((entities ?? []).map((e) => [e.id, e.name as string]));
  for (const [key, v] of latest) {
    const n = nameById.get(v.entityId);
    if (n) out.set(key, n);
  }
  return out;
}

async function listAccountEmails(admin: Admin): Promise<{ profileId: string; email: string }[]> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return (data?.users ?? []).filter((u) => u.email).map((u) => ({ profileId: u.id, email: String(u.email).toLowerCase() }));
}

// ---- Reads ----------------------------------------------------------------------------------------------------------------------------

export async function listContacts(actorUserId: string): Promise<ContactSummary[]> {
  if (!(await authorize(actorUserId)).ok) return [];
  const admin = createAdminClient();
  const [raw, counts] = await Promise.all([loadRawContacts(admin), linkCounts(admin, "contact_id")]);
  return raw.map((r) => toSummary(r, counts));
}

export async function getContactDetail(actorUserId: string, id: string): Promise<ContactDetail | null> {
  if (!(await authorize(actorUserId)).ok) return null;
  const admin = createAdminClient();
  const raw = await loadRawContacts(admin);
  const r = raw.find((c) => c.id === id);
  if (!r) return null;
  const records = await loadLinkedRecords(admin, { column: "contact_id", id });
  const summary = toSummary(r, { enquiries: new Map([[id, records.filter((x) => x.type === "enquiry").length]]), quotations: new Map([[id, records.filter((x) => x.type === "quotation").length]]) });

  const me = toCandidate(r);
  const dup = matchContacts(raw.map(toCandidate), { fullName: me.fullName, emails: me.emails.filter((e) => !e.removed).map((e) => ({ email: e.email, isShared: e.isShared })), phones: me.phones, organisationId: me.organisationId }, { excludeContactId: id });

  let profile: ContactDetail["profile"] = null;
  let accountSuggestions: AccountSuggestion[] = [];
  const accounts = await listAccountEmails(admin);
  if (r.profile_id) {
    const { data: p } = await admin.from("profiles").select("id, full_name").eq("id", r.profile_id).maybeSingle();
    profile = p ? { id: p.id, fullName: p.full_name, email: accounts.find((a) => a.profileId === p.id)?.email ?? null } : null;
  } else {
    const personal = new Set(summary.emails.filter((e) => !e.removed && !e.isShared).map((e) => e.email));
    const taken = new Set(raw.map((c) => c.profile_id).filter((p): p is string => p !== null));
    const matches = accounts.filter((a) => personal.has(a.email) && !taken.has(a.profileId));
    if (matches.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", matches.map((m) => m.profileId));
      accountSuggestions = matches.map((m) => ({ profileId: m.profileId, email: m.email, fullName: profs?.find((p) => p.id === m.profileId)?.full_name ?? null }));
    }
  }
  return {
    ...summary,
    notes: r.notes,
    createdAt: r.created_at,
    profile,
    records,
    context: summariseTransactions(records),
    possibleDuplicates: dup.matches.filter((m) => m.strength !== "possible").map((m) => ({ contactId: m.contact.id, fullName: m.contact.fullName, strength: m.strength })),
    accountSuggestions,
  };
}

export async function getOrganisationDetail(actorUserId: string, id: string): Promise<OrganisationDetail | null> {
  if (!(await authorize(actorUserId)).ok) return null;
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("id, name, primary_domain, status, notes, created_at, organisation_relationships(kind, status, approved_at)").eq("id", id).maybeSingle();
  if (!org) return null;
  const [raw, counts, { data: apps }, records] = await Promise.all([
    loadRawContacts(admin),
    linkCounts(admin, "contact_id"),
    admin.from("supplier_applications").select("id, status, reference, submitted_on").eq("organisation_id", id).order("submitted_on", { ascending: false }),
    loadLinkedRecords(admin, { column: "organisation_id", id }),
  ]);
  return {
    id: org.id,
    name: org.name,
    primaryDomain: org.primary_domain,
    status: org.status,
    notes: org.notes,
    createdAt: org.created_at,
    relationships: ((org.organisation_relationships ?? []) as { kind: string; status: string; approved_at: string | null }[]).map((r) => ({ kind: r.kind, status: r.status, approvedAt: r.approved_at })),
    contacts: raw.filter((c) => c.organisation_id === id).map((c) => toSummary(c, counts)),
    applications: (apps ?? []).map((a) => ({ id: a.id, status: a.status, reference: a.reference, submittedOn: a.submitted_on })),
    records,
    context: summariseTransactions(records),
  };
}

// ---- Creating and editing contacts ---------------------------------------------------------------------------------------------------

export function parseAddressList(raw: string): string[] {
  return raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

function cleanPhones(raw: string[]): string[] | Fail {
  const out: string[] = [];
  for (const p of raw) {
    if (!p.trim()) continue;
    const n = normalisePhone(p);
    if (!n) return { ok: false, error: `"${p.trim()}" is not a valid phone number (7 to 15 digits).` };
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > MAX_PHONES) return { ok: false, error: `A contact can have at most ${MAX_PHONES} phone numbers.` };
  return out;
}

export async function createContact(params: {
  fullName: string;
  jobTitle?: string | null;
  organisationId?: string | null;
  emails: string[];
  phones: string[];
  notes?: string | null;
  confirmedDistinct: boolean;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const fullName = params.fullName.trim();
  if (!fullName || fullName.length > 200) return { ok: false, error: "Enter the person's name (up to 200 characters)." };
  const classified: NonNullable<ReturnType<typeof classifyEmail>>[] = [];
  for (const raw of params.emails) {
    const c = classifyEmail(raw);
    if (!c) return { ok: false, error: `"${raw}" is not a valid email address.` };
    if (!classified.some((x) => x.email === c.email)) classified.push(c);
  }
  if (classified.length > MAX_EMAILS) return { ok: false, error: `A contact can have at most ${MAX_EMAILS} email addresses.` };
  const phones = cleanPhones(params.phones);
  if (!Array.isArray(phones)) return phones;

  const admin = createAdminClient();
  if (params.organisationId) {
    const { data: org } = await admin.from("organisations").select("id").eq("id", params.organisationId).maybeSingle();
    if (!org) return { ok: false, error: "That organisation no longer exists." };
  }
  const raw = await loadRawContacts(admin);
  const result = matchContacts(raw.map(toCandidate), { fullName, emails: classified.map((c) => ({ email: c.email, isShared: c.suggestedShared })), phones, organisationId: params.organisationId ?? null });
  const decision = decideContactCreate(result, params.confirmedDistinct);
  if (!decision.ok) return { ok: false, error: decision.error };

  const { data: contact, error } = await admin
    .from("contacts")
    .insert({ full_name: fullName, job_title: params.jobTitle?.trim() || null, organisation_id: params.organisationId || null, phones, notes: params.notes?.trim() || null, created_by: params.actorUserId })
    .select("id")
    .maybeSingle();
  if (error || !contact) {
    console.error("[directory] failed to create contact", error?.message);
    return { ok: false, error: "Failed to create the contact." };
  }
  if (classified.length > 0) {
    const { error: emailError } = await admin.from("contact_emails").insert(classified.map((c, i) => ({ contact_id: contact.id, email: c.email, is_primary: i === 0, is_shared: c.suggestedShared, created_by: params.actorUserId })));
    if (emailError) {
      console.error("[directory] failed to add contact emails", emailError.message);
      // The contact was created; report the address problem so a person can add it again. Nothing is rolled back silently.
      return { ok: false, error: emailError.code === "23505" ? "The contact was created, but one of its email addresses is already used by another contact. Open the contact and review." : "The contact was created, but its email addresses could not be saved. Open the contact and add them again." };
    }
  }
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.created", entityType: "contact", entityId: contact.id, metadata: { organisationId: params.organisationId ?? null, emailCount: classified.length, confirmedDistinct: params.confirmedDistinct } });
  return { ok: true, id: contact.id };
}

export async function updateContact(params: {
  contactId: string;
  fullName: string;
  preferredName?: string | null;
  jobTitle?: string | null;
  organisationId?: string | null;
  phones: string[];
  notes?: string | null;
  status: "active" | "inactive";
  actorUserId: string;
}): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const fullName = params.fullName.trim();
  if (!fullName || fullName.length > 200) return { ok: false, error: "Enter the person's name (up to 200 characters)." };
  const phones = cleanPhones(params.phones);
  if (!Array.isArray(phones)) return phones;
  const admin = createAdminClient();
  if (params.organisationId) {
    const { data: org } = await admin.from("organisations").select("id").eq("id", params.organisationId).maybeSingle();
    if (!org) return { ok: false, error: "That organisation no longer exists." };
  }
  const { data, error } = await admin
    .from("contacts")
    .update({ full_name: fullName, preferred_name: params.preferredName?.trim() || null, job_title: params.jobTitle?.trim() || null, organisation_id: params.organisationId || null, phones, notes: params.notes?.trim() || null, status: params.status })
    .eq("id", params.contactId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Failed to save the contact." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.updated", entityType: "contact", entityId: params.contactId, metadata: { status: params.status, organisationId: params.organisationId ?? null } });
  return { ok: true };
}

async function holdersOf(admin: Admin, email: string) {
  const { data } = await admin.from("contact_emails").select("contact_id, is_shared, contacts(full_name)").eq("email", email).is("removed_at", null);
  return (data ?? []).map((h) => {
    const c = h.contacts as { full_name: string } | { full_name: string }[] | null;
    return { contactId: h.contact_id as string, contactName: (Array.isArray(c) ? c[0] : c)?.full_name ?? "Another contact", isShared: Boolean(h.is_shared) };
  });
}

export async function addContactEmail(params: { contactId: string; email: string; isShared?: boolean; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const c = classifyEmail(params.email);
  if (!c) return { ok: false, error: "That is not a valid email address." };
  const isShared = params.isShared ?? c.suggestedShared;
  const admin = createAdminClient();
  const { data: existing } = await admin.from("contact_emails").select("id, is_primary").eq("contact_id", params.contactId).is("removed_at", null);
  if ((existing ?? []).length >= MAX_EMAILS) return { ok: false, error: `A contact can have at most ${MAX_EMAILS} email addresses.` };
  const decision = decideEmailAdd(params.contactId, c.email, isShared, await holdersOf(admin, c.email));
  if (!decision.ok) return { ok: false, error: decision.error };
  const { error } = await admin.from("contact_emails").insert({ contact_id: params.contactId, email: c.email, is_shared: isShared, is_primary: (existing ?? []).length === 0, created_by: params.actorUserId });
  if (error) return { ok: false, error: error.code === "23505" ? "This contact already has that address, or another contact uses it as a personal address." : "Failed to add the address." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.email_added", entityType: "contact", entityId: params.contactId, metadata: { shared: isShared, domain: emailDomainOf(c.email) } });
  return { ok: true };
}

export async function removeContactEmail(params: { contactId: string; emailId: string; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data, error } = await admin.from("contact_emails").update({ removed_at: new Date().toISOString() }).eq("id", params.emailId).eq("contact_id", params.contactId).is("removed_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "That address could not be removed." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.email_removed", entityType: "contact", entityId: params.contactId, metadata: {} });
  return { ok: true };
}

export async function setPrimaryEmail(params: { contactId: string; emailId: string; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data: target } = await admin.from("contact_emails").select("id").eq("id", params.emailId).eq("contact_id", params.contactId).is("removed_at", null).maybeSingle();
  if (!target) return { ok: false, error: "That address could not be found." };
  // The one-primary index is partial, so clear the old primary first, then set the new one.
  const { error: clearError } = await admin.from("contact_emails").update({ is_primary: false }).eq("contact_id", params.contactId).eq("is_primary", true).is("removed_at", null);
  if (clearError) return { ok: false, error: "Failed to change the primary address." };
  const { error } = await admin.from("contact_emails").update({ is_primary: true }).eq("id", params.emailId);
  if (error) return { ok: false, error: "Failed to change the primary address." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.primary_email_set", entityType: "contact", entityId: params.contactId, metadata: {} });
  return { ok: true };
}

export async function setEmailShared(params: { contactId: string; emailId: string; shared: boolean; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data: row } = await admin.from("contact_emails").select("id, email").eq("id", params.emailId).eq("contact_id", params.contactId).is("removed_at", null).maybeSingle();
  if (!row) return { ok: false, error: "That address could not be found." };
  if (!params.shared) {
    const decision = decideEmailAdd(params.contactId, row.email, false, await holdersOf(admin, row.email));
    if (!decision.ok) return { ok: false, error: decision.error };
  }
  const { error } = await admin.from("contact_emails").update({ is_shared: params.shared }).eq("id", params.emailId);
  if (error) return { ok: false, error: "Another contact already uses this address as a personal address, so it cannot be marked personal here." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.email_sharing_set", entityType: "contact", entityId: params.contactId, metadata: { shared: params.shared } });
  return { ok: true };
}

// ---- Portal account link (optional, human-approved, never automatic) ----------------------------------------------------------------

export async function linkContactToAccount(params: { contactId: string; profileId: string; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", params.profileId).maybeSingle();
  if (!profile) return { ok: false, error: "That account no longer exists." };
  const { data, error } = await admin.from("contacts").update({ profile_id: params.profileId }).eq("id", params.contactId).is("profile_id", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "That account is already linked to another contact." : "The contact could not be linked (it may already have an account link)." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.account_linked", entityType: "contact", entityId: params.contactId, metadata: { profileId: params.profileId } });
  return { ok: true };
}

export async function unlinkContactFromAccount(params: { contactId: string; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data, error } = await admin.from("contacts").update({ profile_id: null }).eq("id", params.contactId).not("profile_id", "is", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "This contact has no account link to remove." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.contact.account_unlinked", entityType: "contact", entityId: params.contactId, metadata: {} });
  return { ok: true };
}

// ---- Organisations created from the directory --------------------------------------------------------------------------------------

export async function createOrganisationRecord(params: { name: string; domain?: string | null; notes?: string | null; confirmedDistinct: boolean; actorUserId: string }): Promise<{ ok: true; id: string } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const name = params.name.trim();
  const key = normaliseOrganisationName(name);
  if (!name || name.length > 200 || !key) return { ok: false, error: "Enter the organisation's name (up to 200 characters)." };
  const rawDomain = params.domain?.trim() || null;
  const domain = normaliseDomain(rawDomain);
  if (rawDomain && !domain) return { ok: false, error: "That is not a valid domain. Use the organisation's own domain, for example example.com." };
  const admin = createAdminClient();
  const matches = matchOrganisations(await loadOrganisationCandidates(admin), { name, domain });
  const blockers = blockingMatches(matches);
  if (blockers.some((m) => m.strength === "exact")) return { ok: false, error: `"${blockers[0].organisation.name}" is already registered. Choose it instead of creating a new one.` };
  if (blockers.length > 0 && !params.confirmedDistinct) return { ok: false, error: `"${blockers[0].organisation.name}" looks like the same organisation. Choose it, or tick the box to confirm this is a different organisation.` };
  const { data, error } = await admin.from("organisations").insert({ name, normalized_name: key, primary_domain: domain && !isFreeMailDomain(domain) ? domain : null, notes: params.notes?.trim() || null, created_by: params.actorUserId }).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "An organisation with this name is already registered. Choose it instead." : "Failed to create the organisation." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.organisation.created", entityType: "organisation", entityId: data.id, metadata: { confirmedDistinct: params.confirmedDistinct } });
  return { ok: true, id: data.id };
}

// ---- Linking enquiries and quotations (one record at a time, by a person) ----------------------------------------------------------

const TABLE: Record<RecordSubject["type"], "enquiries" | "client_quotations"> = { enquiry: "enquiries", quotation: "client_quotations" };

async function subjectQuery(admin: Admin, subject: RecordSubject): Promise<{ label: string; contactId: string | null; organisationId: string | null; name: string; emails: string[]; phones: string[]; company: string | null; paymentCountry: "GH" | "QA" | null } | null> {
  if (subject.type === "enquiry") {
    const { data } = await admin.from("enquiries").select("id, reference_number, full_name, email, phone, contact_id, organisation_id, payment_country").eq("id", subject.id).maybeSingle();
    if (!data) return null;
    return { label: data.reference_number, contactId: data.contact_id, organisationId: data.organisation_id, name: data.full_name, emails: data.email ? [data.email] : [], phones: data.phone ? [data.phone] : [], company: null, paymentCountry: data.payment_country === "GH" || data.payment_country === "QA" ? data.payment_country : null };
  }
  const { data } = await admin.from("client_quotations").select("id, quotation_reference, prospect_name, prospect_email, prospect_phone, prospect_company, contact_id, organisation_id").eq("id", subject.id).maybeSingle();
  if (!data) return null;
  return { label: data.quotation_reference, contactId: data.contact_id, organisationId: data.organisation_id, name: data.prospect_name ?? "", emails: data.prospect_email ? [data.prospect_email] : [], phones: data.prospect_phone ? [data.prospect_phone] : [], company: data.prospect_company, paymentCountry: null };
}

async function suggestionsFor(admin: Admin, q: { name: string; emails: string[]; phones: string[]; company: string | null }) {
  const raw = await loadRawContacts(admin);
  const emails = q.emails.map((e) => classifyEmail(e)).filter((c): c is NonNullable<ReturnType<typeof classifyEmail>> => c !== null);
  const result: ContactMatchResult = q.name || emails.length ? matchContacts(raw.map(toCandidate), { fullName: q.name, emails: emails.map((e) => ({ email: e.email, isShared: e.suggestedShared })), phones: q.phones }) : { matches: [], sharedAddressHolders: [] };
  const orgs = await loadOrganisationCandidates(admin);
  const domain = emails.find((e) => e.domain && !e.freeMail)?.domain ?? null;
  const orgMatches: OrganisationMatch[] = q.company || domain ? matchOrganisations(orgs, { name: q.company ?? "", domain }) : [];
  return { result, orgMatches };
}

export async function getRecordLinkContext(actorUserId: string, subject: RecordSubject): Promise<RecordLinkContext | null> {
  if (!(await authorize(actorUserId)).ok) return null;
  const admin = createAdminClient();
  const q = await subjectQuery(admin, subject);
  if (!q) return null;
  const [{ result, orgMatches }, entityMap] = await Promise.all([suggestionsFor(admin, q), loadContractingEntityNames(admin, [subject])]);
  const names = { contact: null as string | null, organisation: null as string | null };
  if (q.contactId) names.contact = (await admin.from("contacts").select("full_name").eq("id", q.contactId).maybeSingle()).data?.full_name ?? null;
  if (q.organisationId) names.organisation = (await admin.from("organisations").select("name").eq("id", q.organisationId).maybeSingle()).data?.name ?? null;
  return {
    subject,
    label: q.label,
    current: { contactId: q.contactId, contactName: names.contact, organisationId: q.organisationId, organisationName: names.organisation },
    contractingEntity: entityMap.get(`${subject.type}:${subject.id}`) ?? null,
    paymentCountry: q.paymentCountry,
    contactSuggestions: result.matches.slice(0, 5).map((m) => ({ contactId: m.contact.id, fullName: m.contact.fullName, organisationName: m.contact.organisationName, strength: m.strength })),
    organisationSuggestions: orgMatches.slice(0, 5).map((m) => ({ organisationId: m.organisation.id, name: m.organisation.name, strength: m.strength })),
    sharedAddressNotes: result.sharedAddressHolders.map((h) => `${h.email} is a shared address used by ${h.contacts.length} contact${h.contacts.length === 1 ? "" : "s"}.`),
  };
}

export async function linkRecord(params: { subject: RecordSubject; contactId: string | null; organisationId: string | null; actorUserId: string }): Promise<{ ok: true; notes: string[] } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const q = await subjectQuery(admin, params.subject);
  if (!q) return { ok: false, error: "That record was not found." };
  let contactOrganisationId: string | null = null;
  if (params.contactId) {
    const { data } = await admin.from("contacts").select("id, organisation_id").eq("id", params.contactId).maybeSingle();
    if (!data) return { ok: false, error: "That contact no longer exists." };
    contactOrganisationId = data.organisation_id;
  }
  if (params.organisationId) {
    const { data } = await admin.from("organisations").select("id").eq("id", params.organisationId).maybeSingle();
    if (!data) return { ok: false, error: "That organisation no longer exists." };
  }
  const plan = planLink({ contactId: q.contactId, organisationId: q.organisationId }, { contactId: params.contactId, organisationId: params.organisationId }, contactOrganisationId);
  if (!plan.ok) return plan;
  if (!plan.changes) return { ok: true, notes: ["Already linked this way. No change."] };
  // Only the two directory link columns are written. Nothing else on the enquiry or quotation is read for change or touched.
  const { data, error } = await admin.from(TABLE[params.subject.type]).update({ contact_id: params.contactId, organisation_id: params.organisationId }).eq("id", params.subject.id).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "Failed to save the link." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.record.linked", entityType: params.subject.type === "enquiry" ? "enquiry" : "client_quotation", entityId: params.subject.id, metadata: { contactId: params.contactId, organisationId: params.organisationId, previousContactId: q.contactId, previousOrganisationId: q.organisationId } });
  return { ok: true, notes: plan.notes };
}

export async function unlinkRecord(params: { subject: RecordSubject; actorUserId: string }): Promise<{ ok: true } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const q = await subjectQuery(admin, params.subject);
  if (!q) return { ok: false, error: "That record was not found." };
  if (!q.contactId && !q.organisationId) return { ok: false, error: "This record has no directory link to remove." };
  const { data, error } = await admin.from(TABLE[params.subject.type]).update({ contact_id: null, organisation_id: null }).eq("id", params.subject.id).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "Failed to remove the link." };
  await logActivity({ actorUserId: params.actorUserId, action: "directory.record.unlinked", entityType: params.subject.type === "enquiry" ? "enquiry" : "client_quotation", entityId: params.subject.id, metadata: { previousContactId: q.contactId, previousOrganisationId: q.organisationId } });
  return { ok: true };
}

// Creates a contact from the details already on an enquiry or quotation and links that record to it, in one human-confirmed step. The same
// duplicate checks as createContact apply, so an enquiry whose personal email already belongs to a contact is sent to that contact instead.
export async function createContactFromRecord(params: { subject: RecordSubject; organisationId: string | null; confirmedDistinct: boolean; actorUserId: string }): Promise<{ ok: true; contactId: string } | Fail> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const q = await subjectQuery(admin, params.subject);
  if (!q) return { ok: false, error: "That record was not found." };
  if (q.contactId) return { ok: false, error: "This record is already linked to a contact." };
  const created = await createContact({ fullName: q.name, organisationId: params.organisationId, emails: q.emails, phones: q.phones, confirmedDistinct: params.confirmedDistinct, actorUserId: params.actorUserId });
  if (!created.ok) return created;
  const linked = await linkRecord({ subject: params.subject, contactId: created.id, organisationId: params.organisationId ?? q.organisationId, actorUserId: params.actorUserId });
  if (!linked.ok) return { ok: false, error: `The contact was created, but linking failed: ${linked.error}` };
  return { ok: true, contactId: created.id };
}

// ---- One-off review list: existing enquiries with no directory link yet -------------------------------------------------------------

export type ReviewItem = {
  enquiryId: string;
  reference: string;
  fullName: string;
  emailDomain: string | null;
  service: string;
  stage: string;
  submittedAt: string;
  isTest: boolean;
  contactSuggestions: { contactId: string; fullName: string; strength: string }[];
  organisationSuggestions: { organisationId: string; name: string; strength: string }[];
};

export async function listEnquiriesForLinkReview(actorUserId: string): Promise<ReviewItem[]> {
  if (!(await authorize(actorUserId)).ok) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("enquiries").select("id, reference_number, full_name, email, phone, service, crm_stage, submitted_at, is_test").is("contact_id", null).is("organisation_id", null).order("submitted_at", { ascending: true });
  if (error) {
    console.error("[directory] failed to load enquiries for review", error.message);
    return [];
  }
  const raw = await loadRawContacts(admin);
  const candidates = raw.map(toCandidate);
  const orgs = await loadOrganisationCandidates(admin);
  return (data ?? []).map((e) => {
    const c = e.email ? classifyEmail(e.email) : null;
    const res = matchContacts(candidates, { fullName: e.full_name, emails: c ? [{ email: c.email, isShared: c.suggestedShared }] : [], phones: e.phone ? [e.phone] : [] });
    const domain = c && c.domain && !c.freeMail ? registrableDomain(c.domain) : null;
    const orgMatches = domain ? matchOrganisations(orgs, { name: "", domain }) : [];
    return {
      enquiryId: e.id,
      reference: e.reference_number,
      fullName: e.full_name,
      emailDomain: c?.domain ?? null,
      service: e.service,
      stage: e.crm_stage,
      submittedAt: e.submitted_at,
      isTest: Boolean(e.is_test),
      contactSuggestions: res.matches.slice(0, 3).map((m) => ({ contactId: m.contact.id, fullName: m.contact.fullName, strength: m.strength })),
      organisationSuggestions: orgMatches.slice(0, 3).map((m) => ({ organisationId: m.organisation.id, name: m.organisation.name, strength: m.strength })),
    };
  });
}

