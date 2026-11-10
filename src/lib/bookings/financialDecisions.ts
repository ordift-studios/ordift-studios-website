import { createAdminClient } from "@/lib/supabase/admin";
import { bookingFlagOn } from "./rules";

// FINAL-CANCELLATION MONEY WORKFLOW (server). PROPOSAL_cancellation_financial_decisions.sql: a refund, a write-off of an unpaid balance, or "no adjustment needed" is a RECORD with a reason and evidence reference, requested by an Admin or Super Admin
// and authorised or declined by a DIFFERENT Super Admin; a later Super Admin step records that it was carried out (with the external reference). This module and the database NEVER move money or touch payments, balances, the quotation or the
// project stage: they keep the decision trail. With the table absent (Production today) every function is a quiet no-op / a plain "not available" message.
export type DecisionKind = "no_adjustment" | "refund" | "write_off";
export type DecisionRow = {
  id: string; kind: DecisionKind; amount_usd: number | null; reason: string; evidence_ref: string; status: "requested" | "authorised" | "declined"; requested_by: string; requested_at: string;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; executed_reference: string | null; executed_by: string | null; executed_at: string | null;
  requestedLabel?: string | null; decidedLabel?: string | null; executedLabel?: string | null;
};
const MSG: [RegExp, string][] = [
  [/needs_final_cancellation/, "Money decisions are only recorded after a FINAL cancellation of the booking."],
  [/financial_reason/, "Give the reason in at least a sentence."], [/financial_evidence/, "Give a supporting evidence reference (at least a sentence: a document or message reference). Do not paste an e-mail address, a phone number or a long account number."],
  [/financial_amount/, "A refund or write-off needs an amount above zero; \"no adjustment\" carries none."], [/financial_kind/, "Choose refund, write-off, or no adjustment."],
  [/financial_over_cap/, "That amount is more than is available: a refund cannot exceed what was verified paid, a write-off cannot exceed the unpaid balance, counting other open or authorised requests."],
  [/separation_of_duties/, "A different Super Admin must decide this: nobody can authorise their own request."], [/financial_note/, "Write the reason for the decision (at least a sentence)."], [/financial_decision\b/, "Choose authorise or decline."],
  [/financial_decision_is_final/, "This has already been decided; a decision is final."], [/financial_not_authorised/, "Only an authorised request can be marked as carried out."], [/financial_reference|financial_execution_is_final/, "Give the external reference of the refund or write-off (not an e-mail address, phone number or long account number); it can be recorded once."],
  [/financial_missing/, "That request no longer exists."], [/not_authorised/, "You are not authorised to do that."],
];
const friendly = (m: string) => MSG.find(([r]) => r.test(m))?.[1] ?? "That could not be saved.";
const unavailable = (m: string) => /does not exist|could not find the function|schema cache/i.test(m);
const off = { ok: false as const, error: "Booking confirmation is not switched on." }, absent = { ok: false as const, error: "The money-decision records are not available in this database yet." };

export async function requestFinancialAction(p: { actorUserId: string; enquiryId: string; kind: string; amountUsd: number | null; reason: string; evidence: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return off;
  const { data, error } = await createAdminClient().rpc("request_cancellation_financial_action", { p_enquiry: p.enquiryId, p_kind: p.kind, p_amount: p.kind === "no_adjustment" ? null : p.amountUsd, p_reason: p.reason, p_evidence: p.evidence, p_actor: p.actorUserId });
  if (error || !data) return unavailable(error?.message ?? "") ? absent : { ok: false, error: friendly(error?.message ?? "") };
  return { ok: true, id: data as string };
}
export async function decideFinancialAction(p: { actorUserId: string; decisionId: string; decision: string; note: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return off;
  const { error } = await createAdminClient().rpc("decide_cancellation_financial_action", { p_id: p.decisionId, p_decision: p.decision, p_note: p.note, p_actor: p.actorUserId });
  return error ? (unavailable(error.message) ? absent : { ok: false, error: friendly(error.message) }) : { ok: true };
}
export async function recordFinancialExecution(p: { actorUserId: string; decisionId: string; reference: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return off;
  const { error } = await createAdminClient().rpc("record_cancellation_financial_execution", { p_id: p.decisionId, p_reference: p.reference, p_actor: p.actorUserId });
  return error ? (unavailable(error.message) ? absent : { ok: false, error: friendly(error.message) }) : { ok: true };
}
/** Newest first, with member-number labels (Audit Identity Standard). Empty when the table is absent. */
export async function listFinancialDecisions(enquiryId: string): Promise<DecisionRow[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("cancellation_financial_decisions").select("*").eq("enquiry_id", enquiryId).order("requested_at", { ascending: false }).limit(50);
  if (error || !data) return [];
  const ids = [...new Set(data.flatMap((d) => [d.requested_by, d.decided_by, d.executed_by]).filter(Boolean) as string[])];
  const { data: ps } = ids.length ? await db.from("profiles").select("id, full_name, member_number").in("id", ids) : { data: [] };
  const lab = new Map((ps ?? []).map((x) => [x.id as string, x.member_number ? `${x.member_number} — ${x.full_name ?? ""}`.trim() : (x.full_name as string | null) ?? "Unnamed profile"]));
  return data.map((d) => ({ ...(d as unknown as DecisionRow), amount_usd: d.amount_usd === null ? null : Number(d.amount_usd), requestedLabel: lab.get(d.requested_by as string) ?? null, decidedLabel: d.decided_by ? lab.get(d.decided_by as string) ?? null : null, executedLabel: d.executed_by ? lab.get(d.executed_by as string) ?? null : null }));
}
