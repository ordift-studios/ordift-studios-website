// Pure statement-matching for bank / credit-card reconciliation. No database access, no I/O, no banking connection.
// It only PROPOSES matches between what the books EXPECT to have left (or entered) an account and the lines a statement actually shows.
// A proposal is never a confirmation: a Super Admin confirms each one, and nothing here posts a transaction or marks anything paid.
// Verified and awaiting-statement are kept apart: an expectation is "awaiting statement" until a statement that COVERS its date has been supplied.
import { toCents } from "@/lib/organization/equipmentFinancingRules";

export type StatementLine = { id: string; date: string; amount: number; direction: "debit" | "credit"; currency: string; description: string };
export type StatementCoverage = { from: string; to: string };             // the period a supplied statement document covers (inclusive)
export type Expectation = {
  key: string;                                // e.g. "instalment:<id>", "expense:<id>"
  kind: "instalment" | "supplier_payment" | "expense" | "other";
  amount: number; currency: string; direction: "debit" | "credit";
  // When the payment is expected on the statement. A REPORTED payment date narrows the window; an expected MONTH gives the whole month.
  windowFrom: string; windowTo: string;
  hints?: string[];                           // words the statement description is expected to contain (provider, merchant); matching is case-insensitive
};

export type MatchStatus =
  | "proposed"              // exactly one line fits amount, currency, direction and window: a human confirms
  | "proposed_with_hint"    // as above AND a hint appears in the description
  | "ambiguous"             // more than one line or expectation competes: a human chooses
  | "variance_review"       // description and window fit but the amount differs: never auto-matched
  | "not_found_in_covered_period" // a covering statement exists but shows nothing: an exception to investigate
  | "awaiting_statement";   // no supplied statement covers the window yet: NOT verified, NOT an exception
export type Proposal = { expectationKey: string; status: MatchStatus; lineIds: string[]; note: string };
export type Result = { proposals: Proposal[]; unmatchedLines: StatementLine[] };

const inWindow = (d: string, a: string, b: string) => d >= a && d <= b;
const covered = (e: Expectation, cov: StatementCoverage[]) => cov.some((c) => c.from <= e.windowFrom && c.to >= e.windowTo);
const hit = (l: StatementLine, hints?: string[]) => !!hints?.some((h) => h && l.description.toLowerCase().includes(h.toLowerCase()));

export function proposeMatches(expectations: Expectation[], lines: StatementLine[], coverage: StatementCoverage[]): Result {
  const fits = (e: Expectation) => lines.filter((l) => l.currency === e.currency && l.direction === e.direction && toCents(l.amount) === toCents(e.amount) && inWindow(l.date, e.windowFrom, e.windowTo));
  const cand = new Map(expectations.map((e) => [e.key, fits(e)] as const));
  // how many expectations each line could satisfy (a line may satisfy only one)
  const claims = new Map<string, number>();
  for (const cs of cand.values()) for (const l of cs) claims.set(l.id, (claims.get(l.id) ?? 0) + 1);
  const used = new Set<string>();
  const proposals: Proposal[] = [];
  for (const e of expectations) {
    const cs = cand.get(e.key)!;
    if (cs.length === 1 && claims.get(cs[0].id) === 1) {
      used.add(cs[0].id);
      const h = hit(cs[0], e.hints);
      proposals.push({ expectationKey: e.key, status: h ? "proposed_with_hint" : "proposed", lineIds: [cs[0].id], note: h ? "amount, date window and description agree" : "amount and date window agree; the description names none of the expected words" });
    } else if (cs.length > 0) {
      cs.forEach((l) => used.add(l.id));
      proposals.push({ expectationKey: e.key, status: "ambiguous", lineIds: cs.map((l) => l.id), note: "more than one candidate: a person must choose" });
    } else {
      const near = lines.filter((l) => l.currency === e.currency && l.direction === e.direction && inWindow(l.date, e.windowFrom, e.windowTo) && hit(l, e.hints) && toCents(l.amount) !== toCents(e.amount));
      if (near.length) { near.forEach((l) => used.add(l.id)); proposals.push({ expectationKey: e.key, status: "variance_review", lineIds: near.map((l) => l.id), note: `the amount differs from the expected ${e.amount.toFixed(2)} ${e.currency}: investigate, never auto-match` }); }
      else if (covered(e, coverage)) proposals.push({ expectationKey: e.key, status: "not_found_in_covered_period", lineIds: [], note: "a statement covering this window was supplied and shows no matching line" });
      else proposals.push({ expectationKey: e.key, status: "awaiting_statement", lineIds: [], note: "no supplied statement covers this window yet" });
    }
  }
  return { proposals, unmatchedLines: lines.filter((l) => !used.has(l.id)) };
}

// What a Super Admin may count as VERIFIED: only a proposal they have confirmed, and only an unambiguous kind. Pure so the rule is tested.
export function mayConfirm(p: Proposal): boolean { return p.status === "proposed" || p.status === "proposed_with_hint"; }
