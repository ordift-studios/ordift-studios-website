// BOOKING CONFIRMATION - pure rules (no I/O). The database enforces the same rules (supabase/proposals/PROPOSAL_booking_confirmation.sql: NOT applied anywhere until the Founder authorises it);
// this module gives the screen and the server the same reading so they can show blockers BEFORE a confirmation is attempted. Thresholds and categories are DATA (booking_rule_settings), never constants here.
import { paymentBlocker, type PaymentCondition } from "@/lib/crewSupport/paymentCondition";

export const BOOKING_FLAG = "BOOKING_CONFIRMATION_ENABLED";
export const bookingFlagOn = (env: Record<string, string | undefined> = process.env): boolean => env[BOOKING_FLAG] === "true";   // default OFF

export type BookingSettings = { version: number; status: "provisional" | "approved"; thresholds: Record<string, number>; alwaysCategories: string[]; escalators: string[] };   // all versioned DATA

// ---- agreement requirement (mirrors the database): category, value threshold per currency (a missing threshold = required, fail closed), explicit escalators
export function evaluateAgreement(s: BookingSettings, i: { activities: string[]; currency: string; total: number; escalators?: string[]; segments?: { startsAt: string; timezone: string }[] }): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const a of i.activities) if (s.alwaysCategories.includes(a)) reasons.push(`category:${a}`);
  const thr = s.thresholds[i.currency];
  if (thr === undefined) reasons.push(`no_threshold_for_currency:${i.currency}`); else if (i.total >= thr) reasons.push("value_at_or_above_threshold");
  for (const e of i.escalators ?? []) if (s.escalators.includes(e)) reasons.push(`escalator:${e}`);          // only circumstances the current settings version defines
  if (s.escalators.includes("multi_day_assignment") && !reasons.includes("escalator:multi_day_assignment") && (i.segments ?? []).length > 0) {
    const days = new Set((i.segments ?? []).map((g) => new Intl.DateTimeFormat("en-CA", { timeZone: g.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(g.startsAt))));
    if (days.size > 1) reasons.push("escalator:multi_day_assignment");                                         // detected from the schedule itself
  }
  return { required: reasons.length > 0, reasons };
}

// ---- the quotation's own structured payment condition vs its free-text terms. A silent contradiction is never allowed through.
export type TermsCheck = "consistent" | "no_payment_language" | "ambiguous" | "contradiction" | "no_terms";
type Hint = { kind: "none" | "deposit" | "full" | "later"; percent?: number };
export function readTerms(text: string): Hint[] {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `, hints: Hint[] = [];
  if (/(no (deposit|advance|upfront|prepayment|payment)( is)? (required|needed|due))|(payment (is )?not required)|(nothing (is )?due (up ?front|in advance))/.test(t)) hints.push({ kind: "none" });
  if (/(100\s*%|full|entire|whole|total)\s*(payment|amount|fee)?[^.]{0,30}(in advance|upfront|up front|before|prior|to confirm|to secure)|paid in full|payment in full|full prepayment|prepay(ment)? in full/.test(t)) hints.push({ kind: "full" });
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%[^.]{0,40}(deposit|advance|upfront|up front|retainer|booking fee|to confirm|to secure)|(deposit|advance|retainer)[^.]{0,40}?(\d{1,2}(?:\.\d+)?)\s*%/g)) hints.push({ kind: "deposit", percent: Number(m[1] ?? m[4]) });
  if (/(deposit|advance|upfront|up front)[^.]{0,40}\bor\b[^.]{0,40}(full|100\s*%)|(full|100\s*%)[^.]{0,40}\bor\b[^.]{0,40}(deposit|advance)/.test(t) && !hints.some((h) => h.kind === "full")) hints.push({ kind: "full" });   // 'a deposit or full payment' states two conditions
  if (/(on|upon|after) (delivery|completion)|net\s*\d+|within \d+ days of (the )?invoice|pay(able)? later/.test(t)) hints.push({ kind: "later" });
  return hints;
}
export function classifyPaymentTerms(termsText: string | null | undefined, condition: PaymentCondition, depositPercent: number | null): TermsCheck {
  const text = (termsText ?? "").trim();
  if (!text) return "no_terms";                                            // the quotation says nothing at all: a person must clarify
  const hints = readTerms(text);
  if (hints.length === 0) return condition === "none" ? "no_payment_language" : "ambiguous";   // a structured upfront condition that the terms never mention is not confirmed by them
  const kinds = new Set(hints.map((h) => h.kind === "deposit" ? `deposit:${h.percent}` : h.kind));
  if (kinds.size > 1 && !(kinds.size === 2 && kinds.has("later") && (kinds.has("none") || [...kinds].some((k) => k.startsWith("deposit") || k === "full")))) return "ambiguous";
  const stated = hints.find((h) => h.kind !== "later") ?? hints[0];
  if (stated.kind === "later" || stated.kind === "none") return condition === "none" ? "consistent" : "contradiction";
  if (stated.kind === "full") return condition === "full" ? "consistent" : "contradiction";
  return condition === "deposit" && depositPercent !== null && Math.abs((stated.percent ?? -1) - depositPercent) < 0.005 ? "consistent" : "contradiction";
}
export const termsCheckBlocks = (c: TermsCheck, hasClarification: { kind: string; evidence: string } | null): string | null => {
  if (c === "consistent" || c === "no_payment_language") return null;
  const ok = hasClarification && ["client_confirmed_in_writing", "quotation_revised"].includes(hasClarification.kind) && hasClarification.evidence.trim().length >= 15 && !(c === "contradiction" && hasClarification.kind !== "client_confirmed_in_writing");
  if (ok) return null;
  return c === "contradiction" ? "The quotation's structured payment condition contradicts its own terms. Record the client's written confirmation of the correct condition before confirming."
    : "The quotation's payment terms are missing or unclear. Record how they were clarified with the client (in writing) before confirming.";
};

// ---- payment gate (the existing Crew Support arithmetic; amounts are VERIFIED payments only)
export const paymentGate = (condition: PaymentCondition, depositPercent: number | null, amountDueUsd: number | null, verifiedPaidUsd: number | null): string | null =>
  paymentBlocker({ condition, depositPercent, amountDueUsd: amountDueUsd ?? 0, amountPaidUsd: verifiedPaidUsd ?? 0 });

// ---- schedule
export type Segment = { startsAt: string; endsAt: string; timezone: string; kind: "on_site" | "online" | "studio"; location?: string | null; platform?: string | null; note?: string | null };
const tzOk = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
export function validateSegments(segments: Segment[]): string | null {
  if (!Array.isArray(segments) || segments.length === 0) return "Add the confirmed date, time and place (at least one session).";
  for (const [i, s] of segments.entries()) {
    const n = i + 1, a = Date.parse(s.startsAt), b = Date.parse(s.endsAt);
    if (Number.isNaN(a) || Number.isNaN(b)) return `Session ${n}: enter a valid start and end.`;
    if (b <= a) return `Session ${n}: the end must be after the start.`;
    if (!tzOk(s.timezone)) return `Session ${n}: choose a valid time zone.`;
    if (s.kind === "online" && (s.platform ?? "").trim().length < 2) return `Session ${n}: say which platform the online session uses.`;
    if ((s.kind === "on_site" || s.kind === "studio") && (s.location ?? "").trim().length < 3) return `Session ${n}: say where it takes place.`;
  }
  return null;
}
const localDate = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// ---- conflicts (same definition as the database: firm = confirmed booking, confirmed Crew Support slot, approved leave; soft = in progress)
export type Conflict = { key: string; kind: "booking" | "crew_slot" | "leave"; firm: boolean; label: string; from: string; to: string };
export type Commitments = {
  bookings: { id: string; reference: string; assigneeId: string | null; enquiryId: string; segments: { startsAt: string; endsAt: string }[] }[];
  crewSlots: { id: string; reference: string; assigneeId: string; requestStatus: string; startDate: string; endDate: string; isTest: boolean }[];
  leave: { id: string; profileId: string; startDate: string; endDate: string }[];
};
export function classifyConflicts(assigneeId: string | null, segments: Segment[], c: Commitments, excludeEnquiryId: string | null): Conflict[] {
  if (!assigneeId) return [];
  const out = new Map<string, Conflict>();
  for (const s of segments) {
    const from = localDate(s.startsAt, s.timezone), to = localDate(s.endsAt, s.timezone);
    for (const b of c.bookings) if (b.assigneeId === assigneeId && b.enquiryId !== excludeEnquiryId)
      for (const g of b.segments) if (Date.parse(g.startsAt) < Date.parse(s.endsAt) && Date.parse(g.endsAt) > Date.parse(s.startsAt)) out.set(`booking:${b.id}`, { key: `booking:${b.id}`, kind: "booking", firm: true, label: b.reference, from: g.startsAt, to: g.endsAt });
    for (const x of c.crewSlots) if (x.assigneeId === assigneeId && !x.isTest && !["declined", "cancelled"].includes(x.requestStatus) && x.startDate <= to && x.endDate >= from)
      out.set(`crew_slot:${x.id}`, { key: `crew_slot:${x.id}`, kind: "crew_slot", firm: x.requestStatus === "confirmed", label: x.reference, from: x.startDate, to: x.endDate });
    for (const l of c.leave) if (l.profileId === assigneeId && l.startDate <= to && l.endDate >= from) out.set(`leave:${l.id}`, { key: `leave:${l.id}`, kind: "leave", firm: true, label: "approved leave", from: l.startDate, to: l.endDate });
  }
  return [...out.values()];
}
export type Resolution = { key: string; kind: string; verifiedWithProfileId?: string; method?: string; reference?: string; verifiedOn?: string };
// A firm conflict is cleared ONLY by availability verified WITH the assigned person, documented (method, reference, a date that is not in the future). A reason alone never clears it.
export function unresolvedFirmConflicts(conflicts: Conflict[], resolutions: Resolution[], assigneeId: string | null, today: string): Conflict[] {
  return conflicts.filter((c) => c.firm && !resolutions.some((r) => r.key === c.key && r.kind === "availability_verified" && r.verifiedWithProfileId === assigneeId
    && ["direct_message", "call", "in_person", "email"].includes(r.method ?? "") && (r.reference ?? "").trim().length >= 10 && !!r.verifiedOn && r.verifiedOn <= today));
}

// ---- the blockers the confirm screen shows (the database re-checks every one of them)
export type BlockerInput = {
  quotationAccepted: boolean; entityEligible: boolean; agreement: { required: boolean; reasons: string[]; hasExecutedAgreement: boolean };
  payment: { condition: PaymentCondition; depositPercent: number | null; amountDueUsd: number | null; verifiedPaidUsd: number | null };
  termsCheck: TermsCheck; clarification: { kind: string; evidence: string } | null; segments: Segment[]; conflicts: Conflict[]; resolutions: Resolution[]; assigneeId: string | null; today: string;
};
export function confirmationBlockers(i: BlockerInput): string[] {
  const out: string[] = [];
  if (!i.quotationAccepted) out.push("The client must accept an issued ordinary quotation first.");
  if (!i.entityEligible) out.push("The contracting entity is no longer eligible for the quoted activities. An agreement cannot override an unlicensed activity.");
  if (i.agreement.required && !i.agreement.hasExecutedAgreement) out.push(`An executed agreement is required (${i.agreement.reasons.join(", ")}).`);
  const pay = paymentGate(i.payment.condition, i.payment.depositPercent, i.payment.amountDueUsd, i.payment.verifiedPaidUsd); if (pay) out.push(pay);
  const terms = termsCheckBlocks(i.termsCheck, i.clarification); if (terms) out.push(terms);
  const seg = validateSegments(i.segments); if (seg) out.push(seg);
  for (const c of unresolvedFirmConflicts(i.conflicts, i.resolutions, i.assigneeId, i.today)) out.push(`Firm scheduling conflict with ${c.label}: reassign or reschedule, or document that the assigned person has verified their availability.`);
  return out;
}

// ---- who sees what (server-side projection; the database is Super-Admin-read only, everything else goes through server code)
export type Viewer = { id: string; roles: string[] };
export type PanelFull = { blockers: string[]; conflicts: Conflict[]; payment: { condition: PaymentCondition; amountDueUsd: number | null; verifiedPaidUsd: number | null; outstandingUsd: number | null } | null; agreement: { required: boolean; reasons: string[] }; confirmation: Record<string, unknown> | null };
export function projectPanel(panel: PanelFull, v: Viewer, assigneeId: string | null) {
  if (v.roles.includes("super_admin")) return { level: "super_admin" as const, ...panel };
  if (v.roles.includes("admin")) return { level: "admin" as const, blockers: panel.blockers, conflicts: panel.conflicts.map(({ kind, firm, label, from, to }) => ({ kind, firm, label, from, to })), agreement: panel.agreement };   // operational blockers; no amounts, no confirmation record
  if (v.roles.includes("staff") && assigneeId === v.id) return { level: "staff" as const, conflicts: panel.conflicts.map(({ kind, firm, label, from, to }) => ({ kind, firm, label, from, to })) };                 // only conflicts on their own assignment
  return null;
}
export const canConfirm = (v: Viewer) => v.roles.includes("super_admin");

// ---- the quotation form's structured payment condition (none / percentage deposit / full before confirmation) must AGREE with the written terms
export type StructuredCondition = { condition: PaymentCondition; depositPercent: number | null };
export function validateStructuredCondition(c: StructuredCondition, termsText: string | null | undefined): { ok: true; check: TermsCheck } | { ok: false; error: string } {
  if (!["none", "deposit", "full"].includes(c.condition)) return { ok: false, error: "Choose whether payment is required up front: no upfront payment, a percentage deposit, or full payment before confirmation." };
  if (c.condition === "deposit" && !(c.depositPercent !== null && c.depositPercent > 0 && c.depositPercent < 100)) return { ok: false, error: "Enter the deposit as a percentage between 0 and 100." };
  if (c.condition !== "deposit" && c.depositPercent !== null) return { ok: false, error: "A deposit percentage applies only to a deposit condition." };
  const check = classifyPaymentTerms(termsText, c.condition, c.depositPercent);
  if (check === "contradiction") return { ok: false, error: "The written payment terms say something different from the condition you selected. Make the terms and the selection agree before saving." };
  if (check === "ambiguous") return { ok: false, error: "The written payment terms do not clearly state the selected condition. Say it plainly in the terms before saving." };
  if (check === "no_terms" && c.condition !== "none") return { ok: false, error: "Write the payment terms so they state the selected condition." };
  return { ok: true, check };
}
