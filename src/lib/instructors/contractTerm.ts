import { createAdminClient } from "@/lib/supabase/admin";
import { getEngagementTypeSlug } from "@/lib/organization/engagementTypeLookup";

// CONTRACTUAL TERM of an instructor's executed OS-LGL-010 agreement, read from the agreement's OWN frozen Schedule A snapshot (never hardcoded, never global).
// The effective date is Schedule A "agreementEffectiveDate"; the expiry is the second date of a "DATE RANGE: <from> to <to>" master term ("ONGOING" has no fixed expiry).
// All comparisons are calendar-date comparisons in the agreement's JURISDICTIONAL time basis (Ghana = Africa/Accra, Qatar = Asia/Qatar). The effective date and the expiry date
// are both INCLUSIVE. Anything that cannot be determined fails CLOSED with a reason: a restricted activity is never allowed on a guess.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const JURISDICTION_TIMEZONES: Record<string, string> = { ghana: "Africa/Accra", qatar: "Asia/Qatar" };

export type AgreementTerm = {
  agreementId: string;
  reference: string;
  status: string;
  executedAt: string | null;
  jurisdiction: string | null;
  timezone: string | null;
  effectiveDate: string | null;
  expiryDate: string | null; // null with `ongoing` = no fixed expiry
  ongoing: boolean;
  problems: string[]; // why the term cannot be fully determined (empty when it can)
};

export function timezoneForJurisdiction(jurisdiction: string | null | undefined): string | null {
  return JURISDICTION_TIMEZONES[(jurisdiction ?? "").trim().toLowerCase()] ?? null;
}

export function parseAgreementTerm(input: { agreementId: string; reference: string; status: string; executedAt?: string | null; jurisdiction: string | null; scheduleA: Record<string, unknown> | null | undefined }): AgreementTerm {
  const problems: string[] = [];
  const timezone = timezoneForJurisdiction(input.jurisdiction);
  if (!timezone) problems.push("The agreement's jurisdiction is not recognised, so its time basis cannot be determined.");
  const rawEffective = String(input.scheduleA?.agreementEffectiveDate ?? "").trim();
  const effectiveDate = ISO.test(rawEffective) && !Number.isNaN(Date.parse(rawEffective)) ? rawEffective : null;
  if (!effectiveDate) problems.push("The agreement's effective date is not recorded in a readable form.");
  const masterTerm = String(input.scheduleA?.masterTerm ?? "").trim();
  const ongoing = /^ongoing\b/i.test(masterTerm);
  let expiryDate: string | null = null;
  if (!ongoing) {
    const dates = masterTerm.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    if (dates.length >= 2 && !Number.isNaN(Date.parse(dates[1]))) expiryDate = dates[1];
    else problems.push("The agreement's expiry date cannot be read from its master term.");
    if (expiryDate && effectiveDate && expiryDate < effectiveDate) problems.push("The agreement's expiry date is before its effective date.");
  }
  return { agreementId: input.agreementId, reference: input.reference, status: input.status, executedAt: input.executedAt ?? null, jurisdiction: input.jurisdiction, timezone, effectiveDate, expiryDate, ongoing, problems };
}

// The calendar date (YYYY-MM-DD) a timestamp falls on in a time zone.
export function localCalendarDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type WindowState = "inside" | "before_term" | "after_term" | "spans_effective_date" | "spans_expiry_date" | "term_unknown";
export type WindowVerdict = { state: WindowState; message: string };
const D = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Is the delivery window [start, end] (calendar dates in the agreement's time basis) inside the contractual term?
export function evaluateWindow(term: AgreementTerm, startDate: string, endDate?: string | null): WindowVerdict {
  const end = endDate && endDate > startDate ? endDate : startDate;
  if (term.problems.length > 0 || !term.effectiveDate) return { state: "term_unknown", message: `The contractual term cannot be confirmed: ${term.problems[0] ?? "no effective date"}` };
  const eff = term.effectiveDate;
  const exp = term.expiryDate;
  if (end < eff) return { state: "before_term", message: `The delivery date (${D(startDate)}) is before the agreement's effective date (${D(eff)}).` };
  if (exp && startDate > exp) return { state: "after_term", message: `The delivery date (${D(startDate)}) is after the agreement's expiry date (${D(exp)}).` };
  if (startDate < eff) return { state: "spans_effective_date", message: `The delivery window starts (${D(startDate)}) before the agreement's effective date (${D(eff)}) and continues into the term.` };
  if (exp && end > exp) return { state: "spans_expiry_date", message: `The delivery window runs (${D(end)}) beyond the agreement's expiry date (${D(exp)}).` };
  return { state: "inside", message: "The delivery window is inside the contractual term." };
}

export type TermToday = "not_started" | "in_term" | "expired" | "unknown";
export function evaluateToday(term: AgreementTerm, now: Date = new Date()): TermToday {
  if (term.problems.length > 0 || !term.effectiveDate || !term.timezone) return "unknown";
  const today = localCalendarDate(now.toISOString(), term.timezone);
  if (today < term.effectiveDate) return "not_started";
  if (term.expiryDate && today > term.expiryDate) return "expired";
  return "in_term";
}

type AgreementRow = { id: string; agreement_reference: string; status: string; executed_at: string | null; jurisdiction: string | null };

// Every genuinely executed OS-LGL-010 agreement for this instructor (newest execution first), each with its term read from its own latest Schedule A snapshot.
export async function loadInstructorAgreementTerms(profileId: string): Promise<AgreementTerm[]> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id").eq("canonical_code", "OS-LGL-010").maybeSingle();
  if (!master) return [];
  const { data } = await admin
    .from("agreements")
    .select("id, agreement_reference, status, executed_at, jurisdiction")
    .eq("master_id", master.id)
    .eq("primary_context_type", "instructor_profile")
    .eq("primary_context_reference", profileId)
    .in("status", ["fully_executed", "active", "completed"])
    .or("evidence_classification.is.null,evidence_classification.neq.controlled_test")
    .order("executed_at", { ascending: false });
  const rows = (data ?? []) as AgreementRow[];
  const terms: AgreementTerm[] = [];
  for (const r of rows) terms.push(await termForRow(r));
  return terms;
}

async function termForRow(r: AgreementRow): Promise<AgreementTerm> {
  const { data: snap } = await createAdminClient().from("agreement_snapshots").select("snapshot_data").eq("agreement_id", r.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const scheduleA = ((snap?.snapshot_data as { scheduleA?: Record<string, unknown> } | null)?.scheduleA ?? null) as Record<string, unknown> | null;
  return parseAgreementTerm({ agreementId: r.id, reference: r.agreement_reference, status: r.status, executedAt: r.executed_at, jurisdiction: r.jurisdiction, scheduleA });
}

// The term of ONE specific agreement (used for a Session Schedule, which names its own agreement).
export async function loadAgreementTerm(agreementId: string): Promise<AgreementTerm | null> {
  const { data } = await createAdminClient().from("agreements").select("id, agreement_reference, status, executed_at, jurisdiction").eq("id", agreementId).maybeSingle();
  return data ? termForRow(data as AgreementRow) : null;
}

// The calendar dates (in the agreement's time basis) a schedule's sessions fall on.
export function scheduleWindowDates(term: AgreementTerm, firstSessionAt: string, lastSessionAt: string | null): { start: string; end: string | null } {
  const tz = term.timezone ?? "UTC";
  return { start: localCalendarDate(firstSessionAt, tz), end: lastSessionAt ? localCalendarDate(lastSessionAt, tz) : null };
}

// REFUSAL (or null) for a delivery window. Applies only to people classified as independent instructors; everyone else is unaffected. The caller has already checked that an
// executed agreement exists (instructorAssignmentRefusal), but this fails closed too when none is found.
export async function instructorWindowRefusal(profileId: string | null | undefined, startDate: string, endDate?: string | null): Promise<string | null> {
  if (!profileId) return null;
  if ((await getEngagementTypeSlug(profileId)) !== "instructor") return null;
  const terms = await loadInstructorAgreementTerms(profileId);
  if (terms.length === 0) return "This instructor has no executed agreement whose term can be checked, so this date cannot be accepted.";
  const verdicts = terms.map((t) => evaluateWindow(t, startDate, endDate));
  if (verdicts.some((v) => v.state === "inside")) return null;
  return `${verdicts[0].message} Planning is allowed only for dates inside the contractual term.`;
}

// REFUSAL (or null) for actually delivering a workshop TODAY (attendance, delivery actions): the instructor's term must be in force today in the agreement's time basis.
export async function instructorDeliveryTodayRefusal(profileId: string | null | undefined, now: Date = new Date()): Promise<string | null> {
  if (!profileId) return null;
  if ((await getEngagementTypeSlug(profileId)) !== "instructor") return null;
  const terms = await loadInstructorAgreementTerms(profileId);
  if (terms.length === 0) return "This instructor has no executed agreement, so workshop delivery cannot be recorded.";
  const states = terms.map((t) => ({ t, s: evaluateToday(t, now) }));
  if (states.some((x) => x.s === "in_term")) return null;
  const first = states[0];
  if (first.s === "not_started") return `Workshop delivery cannot start before the agreement's effective date (${D(first.t.effectiveDate!)}).`;
  if (first.s === "expired") return `The agreement expired on ${D(first.t.expiryDate!)}; workshop delivery cannot be recorded.`;
  return `The contractual term cannot be confirmed (${first.t.problems[0] ?? "unknown"}), so workshop delivery cannot be recorded.`;
}

export type AuthorizationState = "planning_only" | "authorized" | "outside_term" | "term_unknown";
// Planning vs. active authorization of an APPROVED assignment: an approved schedule whose delivery window is inside a term that has not started yet is PLANNING ONLY (it
// authorises no delivery, advertising or registration); once the term is in force and the window is inside it, it is AUTHORIZED.
export function assignmentAuthorization(term: AgreementTerm | null, windowStart: string, windowEnd: string | null, now: Date = new Date()): { state: AuthorizationState; message: string } {
  if (!term) return { state: "term_unknown", message: "No executed agreement term is available." };
  const w = evaluateWindow(term, windowStart, windowEnd);
  if (w.state === "term_unknown") return { state: "term_unknown", message: w.message };
  if (w.state !== "inside") return { state: "outside_term", message: w.message };
  const today = evaluateToday(term, now);
  if (today === "not_started") return { state: "planning_only", message: `Approved for planning only until the agreement takes effect on ${D(term.effectiveDate!)}. No advertising, registration or delivery is authorised yet.` };
  if (today === "in_term") return { state: "authorized", message: "Inside the contractual term." };
  return { state: "outside_term", message: `The agreement expired on ${D(term.expiryDate!)}.` };
}
