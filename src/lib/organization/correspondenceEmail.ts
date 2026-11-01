import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";

// PREFERRED CORRESPONDENCE EMAIL (proposed migration 0178: public.profile_correspondence_emails, append-only).
//
//   Account Email — Used for Login                      the Supabase Auth email. READ-ONLY here: nothing in this module (or anywhere in this feature) can change it.
//   Preferred Correspondence Email — Used for Communication   what a person has asked Ordift to use for ordinary correspondence. Unverified, recorded by an administrator
//                                                             with a short evidence reference. The latest row is the current preference; a cleared row means "use the account email".
//
// SECURITY BOUNDARY. Login and password reset keep using the account email, always, and no authentication or signature-engine code may import this module (enforced by
// correspondenceEmailIsolation.test.ts). The preference is used by exactly three things: the agreement CONTACT line (through the draft's Schedule A refresh), the person's
// own read-only portal card, and - for the INSTRUCTOR signatory only - the destination of the signing-link email at issuance (resolveInstructorSigningDelivery below, called
// only from instructorAgreementIssuance.ts). The signing token, its hash, expiry, revocation and the signing page are unchanged; only where the link is mailed differs.
//
// PRIVACY. Reading and writing require Super Admin or people-management authority (the same authority as the people page). The audit log is readable by all staff,
// so it receives only MASKED addresses and never the evidence note. The evidence note is a short reference, validated to contain no email address and no long number.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const CORRESPONDENCE_SOURCES = ["person_request", "staff_entered"] as const;
export type CorrespondenceSource = (typeof CORRESPONDENCE_SOURCES)[number];
export const CORRESPONDENCE_SOURCE_LABELS: Record<CorrespondenceSource, string> = { person_request: "Requested by the person", staff_entered: "Entered by staff" };

// ---------------------------------------------------------------------------------------------------------------- pure helpers
const EMAIL_SHAPE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normalizeCorrespondenceEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// One address, lower-case, no display name, no list. Rejects rather than repairs anything ambiguous.
export function validateCorrespondenceEmail(raw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeCorrespondenceEmail(raw);
  if (!email) return { ok: false, error: "Enter an email address." };
  if (/[\s,;<>()"\\[\]]/.test(email)) return { ok: false, error: "Enter exactly one plain email address (no spaces, names or lists)." };
  if (email.length > 254) return { ok: false, error: "That email address is too long." };
  if (!EMAIL_SHAPE.test(email)) return { ok: false, error: "That does not look like a valid email address." };
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return { ok: false, error: "That does not look like a valid email address." };
  const labels = domain.split(".");
  if (labels.some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return { ok: false, error: "That does not look like a valid email address." };
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return { ok: false, error: "That does not look like a valid email address." };
  return { ok: true, email };
}

// The evidence note is a REFERENCE to how the request was made and checked - never a copy of a message, an address or a number.
export function validateEvidenceNote(raw: string): { ok: true; note: string } | { ok: false; error: string } {
  const note = raw.trim();
  if (note.length < 10) return { ok: false, error: "Add a short evidence reference (at least 10 characters), for example how the request was made and how it was checked." };
  if (note.length > 500) return { ok: false, error: "The evidence reference is too long (500 characters at most)." };
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+/.test(note)) return { ok: false, error: "Do not put an email address in the evidence reference; describe the evidence instead." };
  if (/[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9][ -]?[0-9]/.test(note)) return { ok: false, error: "Do not put a phone, card or ID number in the evidence reference." };
  return { ok: true, note };
}

// For the SHARED audit log: enough to tell two addresses apart, not enough to read or reuse one. "sample.name14@example.test" -> "s***4@e***.test".
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at), domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
  const maskedDomain = dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain[0] ?? ""}***`;
  return `${maskedLocal}@${maskedDomain}`;
}

// The email the CONTACT line / ordinary correspondence should use: the preference when one is recorded, otherwise the account email.
export function resolveContactEmail(accountEmail: string | null | undefined, preferredEmail: string | null | undefined): { email: string | null; source: "preferred" | "account" | "none" } {
  const preferred = preferredEmail?.trim();
  if (preferred) return { email: preferred, source: "preferred" };
  const account = accountEmail?.trim();
  return account ? { email: account, source: "account" } : { email: null, source: "none" };
}

// ---------------------------------------------------------------------------------------------------------------- signing-link delivery (instructor issuance only)
export type SigningDeliverySource = "preferred_correspondence" | "account_email";
export type SigningDelivery = { ok: true; email: string; source: SigningDeliverySource; masked: string } | { ok: false; error: string };

// Pure decision. `preference`: a string = the recorded preferred address; null = no preference (or cleared) -> use the account email; undefined = a preference may exist but
// could not be read -> STOP (never fall back silently, because the signing link is a bearer credential and its destination is the security boundary).
export function chooseSigningDelivery(p: { accountEmail: string | null | undefined; preference: string | null | undefined }): SigningDelivery {
  if (p.preference === undefined) return { ok: false, error: "The signing-link destination could not be confirmed because the preferred correspondence email could not be read. Nothing was sent; try again, or contact the administrator." };
  if (p.preference !== null) {
    const v = validateCorrespondenceEmail(p.preference);
    if (!v.ok) return { ok: false, error: "The recorded preferred correspondence email is not a usable address, so the signing link was not sent. Correct the preferred correspondence email, then issue again." };
    return { ok: true, email: v.email, source: "preferred_correspondence", masked: maskEmail(v.email) as string };
  }
  const account = p.accountEmail?.trim();
  if (!account) return { ok: false, error: "The “instructor” signatory's account has no email on file." };
  return { ok: true, email: account, source: "account_email", masked: maskEmail(account) as string };
}

// Resolves where the INSTRUCTOR's signing link goes. The login (account) email is never changed or replaced - it is only the fallback.
export async function resolveInstructorSigningDelivery(profileId: string, accountEmail: string | null | undefined): Promise<SigningDelivery> {
  let preference: string | null | undefined;
  try { preference = await getPreferredCorrespondenceEmail(profileId); } catch { preference = undefined; }
  return chooseSigningDelivery({ accountEmail, preference });
}

// ---------------------------------------------------------------------------------------------------------------- authority
// Same authority as the people page: Super Admin, or people.workforce.administer. Nobody else can read or change a preference.
export async function canAccessCorrespondenceEmail(actorUserId: string): Promise<boolean> {
  return (await authorizeWithSuperAdminOverride(actorUserId, PEOPLE_CAPABILITIES.workforceAdminister)).ok;
}

// ---------------------------------------------------------------------------------------------------------------- reads
type Row = { id: string; email: string | null; source: CorrespondenceSource; evidence_note: string; recorded_by: string; created_at: string };

async function latestRows(profileId: string, limit: number): Promise<Row[] | null> {
  const { data, error } = await createAdminClient().from("profile_correspondence_emails").select("id, email, source, evidence_note, recorded_by, created_at").eq("profile_id", profileId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) return null; // the table is unreadable (for example the migration is not applied yet): UNKNOWN, never "no preference"
  return (data ?? []) as Row[];
}

// For the agreement: the CURRENT preferred address, null when none (or cleared), undefined when it cannot be read (callers then keep what they had).
// No authority check here: this is called by server code that is itself authorized (the Schedule A save), and it returns the address only to that code.
export async function getPreferredCorrespondenceEmail(profileId: string | null | undefined): Promise<string | null | undefined> {
  if (!profileId) return undefined;
  const rows = await latestRows(profileId, 1);
  if (rows === null) return undefined;
  return rows[0]?.email ?? null;
}

export type CorrespondenceEmailHistoryItem = { id: string; action: "set" | "changed" | "cleared"; maskedEmail: string | null; source: CorrespondenceSource; sourceLabel: string; evidenceNote: string; recordedByName: string | null; recordedAt: string };
export type ContactEmailsView = {
  accountEmail: string | null;
  preferred: { email: string; source: CorrespondenceSource; sourceLabel: string; evidenceNote: string; recordedByName: string | null; recordedAt: string } | null;
  effective: { email: string | null; source: "preferred" | "account" | "none" };
  history: CorrespondenceEmailHistoryItem[]; // newest first; EVERY address here is masked (only the current preference is shown in full, above)
  available: boolean; // false when the history table cannot be read (migration not applied): the two lines still show, the preference is simply not available yet
};

// For the people-management and onboarding screens. Returns null when the viewer has no authority (so the caller shows nothing).
export async function loadContactEmailsForViewer(profileId: string, viewerUserId: string): Promise<ContactEmailsView | null> {
  if (!(await canAccessCorrespondenceEmail(viewerUserId))) return null;
  const admin = createAdminClient();
  const [account, rows] = await Promise.all([admin.auth.admin.getUserById(profileId), latestRows(profileId, 50)]);
  const accountEmail = account.data?.user?.email ?? null;
  if (rows === null) return { accountEmail, preferred: null, effective: resolveContactEmail(accountEmail, null), history: [], available: false };
  const actorIds = Array.from(new Set(rows.map((r) => r.recorded_by)));
  const { data: actors } = actorIds.length ? await admin.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const nameOf = new Map((actors ?? []).map((a) => [a.id as string, (a.full_name as string | null) ?? null]));
  const history = rows.map((r, i) => {
    const earlier = rows[i + 1]; // the entry just before this one
    return { id: r.id, action: r.email === null ? "cleared" : earlier && earlier.email !== null ? "changed" : "set", maskedEmail: maskEmail(r.email), source: r.source, sourceLabel: CORRESPONDENCE_SOURCE_LABELS[r.source], evidenceNote: r.evidence_note, recordedByName: nameOf.get(r.recorded_by) ?? null, recordedAt: r.created_at } as CorrespondenceEmailHistoryItem;
  });
  const current = rows[0] && rows[0].email ? rows[0] : null;
  const preferred = current ? { email: current.email as string, source: current.source, sourceLabel: CORRESPONDENCE_SOURCE_LABELS[current.source], evidenceNote: current.evidence_note, recordedByName: nameOf.get(current.recorded_by) ?? null, recordedAt: current.created_at } : null;
  return { accountEmail, preferred, effective: resolveContactEmail(accountEmail, preferred?.email ?? null), history, available: true };
}

// ---------------------------------------------------------------------------------------------------------------- own view (portal)
// The signed-in person's OWN two addresses, for the read-only card on their portal page. The preferred address comes ONLY from the database function
// public.my_correspondence_email(), called with the person's own session (the request-scoped client): the function has no parameter, answers from the caller's own identity
// and returns that one address (or NULL), so nothing else - no evidence note, no recorded-by, no history, no other person's record - can be retrieved this way. Signed-in roles
// have no privilege on the table itself. The account email is the session user's. The service-role client is not used here.
export type OwnContactEmails = { accountEmail: string | null; preferredEmail: string | null; available: boolean };
export async function loadOwnContactEmails(sessionUser: { email: string | null }): Promise<OwnContactEmails> {
  const accountEmail = sessionUser.email ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_correspondence_email");
  if (error) return { accountEmail, preferredEmail: null, available: false }; // unreadable (for example the function does not exist yet): shown as "not available", never as "no preference"
  return { accountEmail, preferredEmail: typeof data === "string" && data.trim() ? data : null, available: true };
}

// ---------------------------------------------------------------------------------------------------------------- write
// Records, changes or clears the preference. APPEND-ONLY: a new row is added; nothing is edited or deleted. The Supabase Auth account is never touched.
export async function setCorrespondenceEmail(p: { profileId: string; email: string | null; source: CorrespondenceSource; evidenceNote: string; actorUserId: string }): Promise<Result<{ action: "set" | "changed" | "cleared"; recordId: string }>> {
  if (!(await canAccessCorrespondenceEmail(p.actorUserId))) return { ok: false, error: "You are not authorized to record a correspondence email." };
  if (!(CORRESPONDENCE_SOURCES as readonly string[]).includes(p.source)) return { ok: false, error: "Choose how the request was made." };
  const note = validateEvidenceNote(p.evidenceNote);
  if (!note.ok) return note;

  const admin = createAdminClient();
  const { data: person } = await admin.from("profiles").select("id").eq("id", p.profileId).maybeSingle();
  if (!person) return { ok: false, error: "That person was not found." };
  const rows = await latestRows(p.profileId, 1);
  if (rows === null) return { ok: false, error: "The correspondence-email record is not available yet." };
  const current = rows[0]?.email ?? null;

  let email: string | null = null;
  if (p.email !== null && p.email.trim() !== "") {
    const v = validateCorrespondenceEmail(p.email);
    if (!v.ok) return v;
    email = v.email;
    if (email === current) return { ok: false, error: "That address is already the recorded preference." };
    const account = (await admin.auth.admin.getUserById(p.profileId)).data?.user?.email?.toLowerCase() ?? null;
    if (account && account === email) return { ok: false, error: "That is already the account email, which is used when no preference is recorded. Clear the preference instead." };
  } else if (current === null) {
    return { ok: false, error: "No preferred correspondence email is recorded, so there is nothing to clear." };
  }

  const { data, error } = await admin.from("profile_correspondence_emails").insert({ profile_id: p.profileId, email, source: p.source, evidence_note: note.note, recorded_by: p.actorUserId }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not record the correspondence email. Please try again." };
  const action = email === null ? "cleared" : current === null ? "set" : "changed";
  // The shared audit log is readable by all staff: masked addresses only, and no evidence text (only that evidence was recorded).
  await logActivity({ actorUserId: p.actorUserId, action: `profile.correspondence_email_${action}`, entityType: "user", entityId: p.profileId, metadata: { recordId: data.id, previous: maskEmail(current), current: maskEmail(email), source: p.source, evidenceRecorded: true } });
  return { ok: true, action, recordId: data.id as string };
}
