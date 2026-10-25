// Pure, dependency-free rules for ORDINARY quotation validity and issuance (safe to import from a client component).
// Policy (Founder, 2026-10-25, consistent with OS-LGL-004): a quotation is valid for 30 calendar days from the date it is ACTUALLY ISSUED. Any other period is an exception:
// it must be explicitly recorded with a reason, and anything beyond 30 days needs a Super Admin. Crew Support keeps its own existing rules and is not governed here.
// Dates are UTC calendar dates written YYYY-MM-DD. A quotation is valid THROUGH its "valid until" date.

export const ORDINARY_VALIDITY_DAYS = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const utcDate = (d: Date): string => d.toISOString().slice(0, 10);
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export const defaultValidUntil = (issuedAt: Date): string => addDays(utcDate(issuedAt), ORDINARY_VALIDITY_DAYS);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(date: string | null | undefined): string {
  const d = date?.slice(0, 10);
  if (!d || !ISO_DATE.test(d)) return "";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export type IssuancePlan =
  | { ok: true; validUntil: string; defaultUntil: string; isException: boolean; isExtension: boolean; replacedExpired: boolean }
  | { ok: false; error: string };

// Decides the validity a quotation is issued with. Never invents or back-dates anything: the date is either the policy default, or an explicitly requested/approved exception.
export function planIssuance(i: { now: Date; existingValidUntil: string | null; requestedValidUntil?: string | null; exceptionReason?: string | null; isSuperAdmin: boolean }): IssuancePlan {
  const today = utcDate(i.now);
  const def = defaultValidUntil(i.now);
  const requested = i.requestedValidUntil?.trim() || null;
  const existing = i.existingValidUntil?.slice(0, 10) || null;
  let replacedExpired = false;
  let chosen: string;
  if (requested) {
    if (!ISO_DATE.test(requested)) return { ok: false, error: "The validity date is not a valid date." };
    chosen = requested;
  } else if (existing && existing >= today) {
    chosen = existing;                                         // an earlier, deliberate choice on the draft is kept, but it is still checked below
  } else {
    chosen = def;                                              // none set, or the one carried over has already passed: never carried silently
    replacedExpired = Boolean(existing && existing < today);
  }
  if (chosen < today) return { ok: false, error: `The validity date (${formatDate(chosen)}) is already in the past. Choose a date from today onward, or use the default of ${formatDate(def)}.` };
  if (chosen === def) return { ok: true, validUntil: chosen, defaultUntil: def, isException: false, isExtension: false, replacedExpired };
  const isExtension = chosen > def;
  if ((i.exceptionReason ?? "").trim().length < 10) return { ok: false, error: `${formatDate(chosen)} is not the standard ${ORDINARY_VALIDITY_DAYS} days from issue (${formatDate(def)}). Record the reason for this different validity period (at least a short sentence).` };
  if (isExtension && !i.isSuperAdmin) return { ok: false, error: `A validity beyond ${ORDINARY_VALIDITY_DAYS} days (${formatDate(def)}) needs approval from a Founder / Super Admin. Ask a Super Admin to issue it, or choose ${formatDate(def)} or earlier.` };
  return { ok: true, validUntil: chosen, defaultUntil: def, isException: true, isExtension, replacedExpired };
}

export function issuanceBlockers(q: { status: string; lineCount: number; total: number; crewManaged: boolean }): string[] {
  const b: string[] = [];
  if (q.crewManaged) b.push("This is a Crew Support quotation: it is issued from its Crew Support request.");
  if (q.status !== "draft") b.push(q.status === "sent" || q.status === "accepted" ? "This quotation has already been issued." : "Only a draft quotation can be issued.");
  if (q.lineCount < 1) b.push("Add at least one line item before issuing.");
  if (!(q.total > 0)) b.push("The total must be greater than zero before issuing.");
  return b;
}

// Expired = issued (sent), not accepted, and past its valid-until date. Computed, never stored: the status only changes by a deliberate action.
export const isPastValidity = (validUntil: string | null | undefined, today: string): boolean => Boolean(validUntil && validUntil.slice(0, 10) < today);
export const isExpired = (status: string, validUntil: string | null | undefined, today: string): boolean => status === "sent" && isPastValidity(validUntil, today);

// A staff-recorded acceptance is judged on WHEN THE CLIENT ACCEPTED (the evidence date), not on the day someone types it in: an acceptance received in time can still be recorded
// late, while an acceptance received after the validity date cannot be recorded against the expired quotation. (The client portal checks "now".)
export function acceptanceExpiryRefusal(validUntil: string | null | undefined, receivedAtIso: string): string | null {
  if (!validUntil) return null;
  const received = receivedAtIso.slice(0, 10);
  return received > validUntil.slice(0, 10) ? `This quotation was valid until ${formatDate(validUntil)} and the acceptance was received ${formatDate(received)}. An expired quotation cannot be accepted: issue a revised quotation instead.` : null;
}

export type QuotationDates = { created: string; issued: string | null; validUntil: string | null; draft: boolean; expired: boolean; createdText: string; issuedText: string; validText: string };
// `crew`: a Crew Support quotation has its own validity rule (set before it is marked ready) and its own issue path, so the ordinary 30-day wording is never shown for it.
export function quotationDates(q: { createdAt: string; issuedAt: string | null; validUntil: string | null; status: string }, today: string, opts: { crew?: boolean } = {}): QuotationDates {
  const draft = q.status === "draft" || q.status === "ready";
  const expired = isExpired(q.status, q.validUntil, today) || q.status === "expired";
  const issued = draft ? null : q.issuedAt;
  const legacy = !draft && !q.issuedAt;      // issued before issue dates were recorded: say so, never invent one
  return {
    created: q.createdAt.slice(0, 10), issued, validUntil: q.validUntil?.slice(0, 10) ?? null, draft, expired,
    createdText: formatDate(q.createdAt),
    issuedText: draft ? "Not yet issued" : issued ? formatDate(issued) : legacy ? "Issue date not recorded" : "Not yet issued",
    validText: opts.crew
      ? (q.validUntil ? `${formatDate(q.validUntil)}${expired ? " (expired)" : ""}` : draft ? "Set before the quotation is issued (Crew Support)" : "No validity date recorded")
      : draft && q.validUntil && q.validUntil.slice(0, 10) < today
      ? `Set when issued (${ORDINARY_VALIDITY_DAYS} calendar days from the issue date). The earlier date, ${formatDate(q.validUntil)}, has passed and will not be carried over`
      : q.validUntil ? `${formatDate(q.validUntil)}${expired ? " (expired)" : ""}` : draft ? `Set when issued (${ORDINARY_VALIDITY_DAYS} calendar days from the issue date)` : "No validity date recorded",
  };
}
