import { PLACEHOLDER_MARK } from "../types";

// Wording checks for registry text. They exist because some things are deliberately UNDEFINED and must not be promised by accident: turnaround, usage rights, deposits and payment terms, travel,
// revision allowances, gallery duration, the contents of a sneak peek or a documentary edit, guarantees and internal percentage guidance. A hit is a refusal, not a warning.
export const MAX_DESCRIPTION = 240;
export const MAX_LINE = 200;
// Custom-quotation notes are longer than a package description by design (the longest approved note is 279 characters). Only this limit differs: every claims check below still applies to them.
export const MAX_NOTE = 300;
export const MAX_HEADING = 80;

const CHECKS: [string, RegExp][] = [
  ["turnaround or delivery time", /\b(turn-?around|delivered (within|in|by)|delivery (time|within|in)|within \d+\s*(hours?|days?|weeks?|business)|\d+\s*(hour|day|week|business-day)s?\s+(delivery|turnaround)|same[- ]day|next[- ]day|rush)\b/i],
  ["usage rights or licensing", /\b(usage|image rights|licen[cs]e[ds]?|licen[cs]ing|royalt(y|ies)|copyright|exclusiv\w*|buy-?out)\b/i],
  ["deposit or payment terms", /\b(deposit|instal?lments?|payment (plan|schedule|terms)|non-refundable|refund\w*|balance due)\b/i],
  ["travel or location charges", /\b(travel|accommodation|transport(ation)?|mileage|per diem)\b/i],
  ["revision allowance", /\brevisions?\b/i],
  ["gallery duration or format", /(gallery[^.]*\b(\d+[\s-]*(days?|weeks?|months?|years?)|expires?|download\w*|hosted)\b|\b\d+[\s-]*(day|week|month|year)s?\b[^.]*gallery)/i],
  ["sneak peek timing or format", /(sneak peek[^.]*\b(\d+|within|hours?|days?|same|reel|teaser)\b|\b\d+[\s-]*(hour|day)s?\b[^.]*sneak peek)/i],
  ["documentary edit contents or length", /(documentary[^.]*\b(\d+[\s-]*(min|minutes?|hours?)|feature|cinematic|full-?length)\b|\b\d+[\s-]*(min|minutes?|hour)s?\b[^.]*documentary)/i],
  ["guarantee or absolute promise", /\b(guarantee[ds]?|unlimited|always|never|100%)\b/i],
  ["percentage figure (internal guidance)", /\d\s?%|per ?cent/i],
];

// Returns the problems with one piece of registry text (empty list = acceptable).
export function lintCopy(text: string, kind: "description" | "line" | "note" | "heading" = "line"): string[] {
  const out: string[] = [];
  if (typeof text !== "string" || !text.trim()) return ["empty wording"];
  if (text !== text.trim()) out.push("leading or trailing space");
  if (text.includes(PLACEHOLDER_MARK) || /\b(TODO|TBD|FIXME|lorem ipsum|xxx)\b/i.test(text)) out.push("placeholder text");
  const max = { description: MAX_DESCRIPTION, line: MAX_LINE, note: MAX_NOTE, heading: MAX_HEADING }[kind];
  if (text.length > max) out.push(`longer than ${max} characters`);
  for (const [name, re] of CHECKS) if (re.test(text)) out.push(name);
  return out;
}
