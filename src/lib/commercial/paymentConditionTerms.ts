// QUOTATION PAYMENT CONDITION (pure, no I/O). The ordinary-quotation form records the payment condition as a STRUCTURED choice (none / percentage deposit / full payment before booking confirmation)
// and the client-facing written terms are GENERATED from that choice, so the two cannot contradict. Any extra terms the person types (cancellation, rescheduling, ...) are kept separately and checked:
// if they state a different payment condition the form refuses to save.
//
// The reading of free text (readTerms / classifyPaymentTerms) is the SAME logic the booking-confirmation branch uses to compare a quotation's terms with its structured condition
// (src/lib/bookings/rules.ts on local/enquiry-booking-design). Keep the two identical; the tests below pin the behaviour the booking gate depends on.
import { PAYMENT_CONDITIONS, type PaymentCondition } from "@/lib/crewSupport/paymentCondition";

export type PaymentChoice = { condition: PaymentCondition; depositPercent: number | null };
export type TermsCheck = "consistent" | "no_payment_language" | "ambiguous" | "contradiction" | "no_terms";
type Hint = { kind: "none" | "deposit" | "full" | "later"; percent?: number };

export function readTerms(text: string): Hint[] {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `, hints: Hint[] = [];
  if (/(no (deposit|advance|upfront|prepayment|payment)( is)? (required|needed|due))|(payment (is )?not required)|(nothing (is )?due (up ?front|in advance))/.test(t)) hints.push({ kind: "none" });
  if (/(100\s*%|full|entire|whole|total)\s*(payment|amount|fee)?[^.]{0,30}(in advance|upfront|up front|before|prior|to confirm|to secure)|paid in full|payment in full|full prepayment|prepay(ment)? in full/.test(t)) hints.push({ kind: "full" });
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%[^.]{0,40}(deposit|advance|upfront|up front|retainer|booking fee|to confirm|to secure)|(deposit|advance|retainer)[^.]{0,40}?(\d{1,2}(?:\.\d+)?)\s*%/g)) hints.push({ kind: "deposit", percent: Number(m[1] ?? m[4]) });
  if (/(deposit|advance|upfront|up front)[^.]{0,40}\bor\b[^.]{0,40}(full|100\s*%)|(full|100\s*%)[^.]{0,40}\bor\b[^.]{0,40}(deposit|advance)/.test(t) && !hints.some((h) => h.kind === "full")) hints.push({ kind: "full" });
  if (/(on|upon|after) (delivery|completion)|net\s*\d+|within \d+ days of (the )?invoice|pay(able)? later/.test(t)) hints.push({ kind: "later" });
  return hints;
}
export function classifyPaymentTerms(termsText: string | null | undefined, condition: PaymentCondition, depositPercent: number | null): TermsCheck {
  const text = (termsText ?? "").trim();
  if (!text) return "no_terms";
  const hints = readTerms(text);
  if (hints.length === 0) return condition === "none" ? "no_payment_language" : "ambiguous";
  const kinds = new Set(hints.map((h) => h.kind === "deposit" ? `deposit:${h.percent}` : h.kind));
  if (kinds.size > 1 && !(kinds.size === 2 && kinds.has("later") && (kinds.has("none") || [...kinds].some((k) => k.startsWith("deposit") || k === "full")))) return "ambiguous";
  const stated = hints.find((h) => h.kind !== "later") ?? hints[0];
  if (stated.kind === "later" || stated.kind === "none") return condition === "none" ? "consistent" : "contradiction";
  if (stated.kind === "full") return condition === "full" ? "consistent" : "contradiction";
  return condition === "deposit" && depositPercent !== null && Math.abs((stated.percent ?? -1) - depositPercent) < 0.005 ? "consistent" : "contradiction";
}

const pct = (n: number) => String(Number(n.toFixed(2)));                                   // 50 -> "50", 12.5 -> "12.5"
// The written payment condition shown to the client, generated from the structured choice. WORDING IS FOR FOUNDER REVIEW (listed in the report); nothing legal is asserted.
export function paymentConditionSentence(c: PaymentChoice): string {
  if (c.condition === "deposit") return `A ${pct(c.depositPercent ?? 0)}% deposit is required to confirm the booking.`;
  if (c.condition === "full") return "Full payment is required before the booking is confirmed.";
  return "No payment is required before the booking is confirmed.";
}

// validate the structured choice itself (shape only)
export function validatePaymentChoice(c: { condition: string; depositPercent: number | null }): { ok: true; choice: PaymentChoice } | { ok: false; error: string } {
  if (!(PAYMENT_CONDITIONS as readonly string[]).includes(c.condition)) return { ok: false, error: "Choose whether payment is required up front: no upfront payment, a percentage deposit, or full payment before booking confirmation." };
  const condition = c.condition as PaymentCondition;
  if (condition === "deposit") {
    if (!(c.depositPercent !== null && Number.isFinite(c.depositPercent) && c.depositPercent > 0 && c.depositPercent < 100)) return { ok: false, error: "Enter the deposit as a percentage above 0 and below 100." };
    return { ok: true, choice: { condition, depositPercent: Math.round(c.depositPercent * 100) / 100 } };
  }
  return { ok: true, choice: { condition, depositPercent: null } };              // a percentage typed for a non-deposit choice is ignored, never stored (the database check ties the two together)
}

// The text that is saved and shown to the client: the generated sentence, then the person's other terms. Refuses other terms that state a different payment condition.
export function composePaymentTerms(choice: PaymentChoice, otherTerms: string | null | undefined): { ok: true; text: string } | { ok: false; error: string } {
  const other = (otherTerms ?? "").trim();
  const text = other ? `${paymentConditionSentence(choice)}\n\n${other}` : paymentConditionSentence(choice);
  const check = classifyPaymentTerms(text, choice.condition, choice.depositPercent);
  if (check === "contradiction") return { ok: false, error: "The other terms you wrote state a different payment condition from the one you selected. Remove that wording (the selected condition is added automatically) or change the selection." };
  if (check === "ambiguous") return { ok: false, error: "The other terms mention payment in a way that is unclear next to the selected condition. State only the selected condition (it is added automatically) and keep the other terms to cancellation, rescheduling and similar." };
  return { ok: true, text };
}

// For editing a saved draft: separate the generated sentence from the person's other terms. Text that does not begin with the generated sentence (older drafts) is returned whole as "other terms".
export function splitPaymentTerms(stored: string | null | undefined, choice: PaymentChoice): { otherTerms: string; generated: boolean } {
  const s = (stored ?? "").trim(), sentence = paymentConditionSentence(choice);
  if (s === sentence) return { otherTerms: "", generated: true };
  if (s.startsWith(`${sentence}\n\n`)) return { otherTerms: s.slice(sentence.length).trim(), generated: true };
  return { otherTerms: s, generated: false };
}
