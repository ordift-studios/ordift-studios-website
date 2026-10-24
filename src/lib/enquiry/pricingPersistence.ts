import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { hasRole, isStaffOrAdmin, isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";
import { createClientQuotation } from "@/lib/commercial/clientQuotations";
import { applyDiscount } from "@/lib/pricing/discountMath";
import { ENQUIRY_PRICING_PERSISTENCE_ENABLED, approvalStillValid, conversionIdempotencyKey, scopeHash, followUpState, type FollowUpState } from "./pricingHistory";

// Persistent enquiry pricing: communicated-price history, Founder/Super Admin-approved discounts, handlers and follow-ups, and conversion to a DRAFT quotation.
// EVERY function starts with gate(): while ENQUIRY_PRICING_PERSISTENCE_ENABLED is false (migration 0168 not applied) nothing here reads or writes the database.
// Nothing here sends a message, posts revenue, takes payment, confirms a booking or creates an agreement or payable. Client-facing amounts are USD; a local
// currency is stored only as a clearly labelled internal reference (rate and date) and is never what the client is quoted.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const gate = () => (ENQUIRY_PRICING_PERSISTENCE_ENABLED ? null : fail("Saving enquiry prices and follow-ups is not switched on yet."));
const staffOnly = (u: CurrentUser) => (isStaffOrAdmin(u) ? null : fail("Only staff can do this."));
const clean = (e: { message?: string } | null) => (e?.message ?? "That could not be saved.").replace(/^.*?ERROR:\s*/, "");

export type CommunicatedInput = {
  enquiryId: string; service: string; scopeTitle: string; scopeLines: string[]; baseTotalUsd: number; communicatedUsd: number;
  channel: string; communicatedAt: string; assumptions?: string; exclusions?: string; missingInformation?: string; notes?: string;
  discountApprovalId?: string | null;
  indicativeLocal?: { currency: "QAR" | "GHS"; amount: number; rateToUsd: number; effectiveFrom: string } | null;
  pricingSnapshot?: Record<string, unknown>;
};

// Saves what the client was actually told, as a new revision. A discount may be carried only if it was APPROVED for exactly this scope and amount (the
// database enforces this too). The original calculator total is kept beside the communicated amount, so a revision never overwrites history.
export async function saveCommunicatedPrice(user: CurrentUser, i: CommunicatedInput): Promise<Result<{ revision: number }>> {
  const g = gate(); if (g) return g;
  const s = staffOnly(user); if (s) return s;
  if (!(i.communicatedUsd > 0) || !(i.baseTotalUsd > 0)) return fail("Enter a price greater than zero.");
  if (i.channel.trim().length < 3) return fail("Say how the price was communicated (phone, WhatsApp, email, in person…).");
  if (new Date(i.communicatedAt).getTime() > Date.now() + 5 * 60_000) return fail("The date and time cannot be in the future.");
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("id, payment_country, commercial_intent").eq("id", i.enquiryId).maybeSingle();
  if (!enq) return fail("That enquiry was not found.");
  if (enq.commercial_intent === "creative_crew_support") return fail("This is a Creative Crew Support enquiry; its pricing is managed from the Crew Support request.");
  const hash = scopeHash({ title: i.scopeTitle, lines: i.scopeLines, baseUsd: i.baseTotalUsd });
  if (i.discountApprovalId) {
    const { data: d } = await admin.from("enquiry_discount_approvals").select("status, scope_hash, total_after_usd, enquiry_id").eq("id", i.discountApprovalId).maybeSingle();
    if (!d || d.enquiry_id !== i.enquiryId) return fail("That discount belongs to a different enquiry.");
    const v = approvalStillValid({ scopeHash: d.scope_hash as string, status: d.status as string }, { title: i.scopeTitle, lines: i.scopeLines, baseUsd: i.baseTotalUsd });
    if (!v.valid) return fail(v.reason);
    if (Number(d.total_after_usd) !== i.communicatedUsd) return fail("The communicated amount must equal the approved discounted total.");
  } else if (Math.round(i.communicatedUsd * 100) !== Math.round(i.baseTotalUsd * 100)) {
    return fail("A price different from the calculator total needs an approved discount, or a revised scope.");
  }
  const loc = i.indicativeLocal;
  const { data, error } = await admin.from("enquiry_price_communications").insert({
    enquiry_id: i.enquiryId, service: i.service, market_slug: (enq.payment_country as string | null) ?? "unspecified", scope_title: i.scopeTitle, scope_lines: i.scopeLines, pricing_snapshot: i.pricingSnapshot ?? { source: "governed calculator", capturedAt: new Date().toISOString() },
    scope_hash: hash, original_total_usd: i.baseTotalUsd, communicated_amount: i.communicatedUsd, communicated_currency: "USD",
    indicative_local_currency: loc?.currency ?? null, indicative_local_amount: loc?.amount ?? null, fx_rate_to_usd: loc?.rateToUsd ?? null, fx_effective_from: loc?.effectiveFrom ?? null,
    discount_approval_id: i.discountApprovalId ?? null, assumptions: i.assumptions?.trim() || null, exclusions: i.exclusions?.trim() || null, missing_information: i.missingInformation?.trim() || null,
    channel: i.channel.trim(), notes: i.notes?.trim() || null, communicated_at: i.communicatedAt, recorded_by: user.id,
  }).select("revision_number").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "enquiry.price_communicated", entityType: "enquiry", entityId: i.enquiryId, metadata: { revision: data.revision_number, usd: i.communicatedUsd } });
  return { ok: true, revision: Number(data.revision_number) };
}

// Staff PROPOSE. The discount is computed with the existing applyDiscount, so there is no second arithmetic.
export async function proposeDiscount(user: CurrentUser, i: { enquiryId: string; scopeTitle: string; scopeLines: string[]; baseTotalUsd: number; type: "percentage" | "fixed"; value: number; reason: string }): Promise<Result<{ id: string; totalAfterUsd: number }>> {
  const g = gate(); if (g) return g;
  const s = staffOnly(user); if (s) return s;
  if (i.reason.trim().length < 10) return fail("Give the reason for the discount (at least a short sentence).");
  if (!(i.value > 0)) return fail("Enter a discount greater than zero.");
  const { discountAmountUsd, finalAmountUsd } = applyDiscount(i.baseTotalUsd, { discountType: i.type, value: i.value });
  if (!(discountAmountUsd > 0) || !(finalAmountUsd > 0)) return fail("That discount is not valid for this price.");
  const admin = createAdminClient();
  const { data, error } = await admin.from("enquiry_discount_approvals").insert({
    enquiry_id: i.enquiryId, scope_hash: scopeHash({ title: i.scopeTitle, lines: i.scopeLines, baseUsd: i.baseTotalUsd }), scope_snapshot: { title: i.scopeTitle, lines: i.scopeLines, baseUsd: i.baseTotalUsd },
    eligible_base_usd: i.baseTotalUsd, discount_type: i.type, discount_value: i.value, discount_usd: discountAmountUsd, total_after_usd: finalAmountUsd, reason: i.reason.trim(), proposed_by: user.id,
  }).select("id").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "enquiry.discount_proposed", entityType: "enquiry", entityId: i.enquiryId, metadata: { discountUsd: discountAmountUsd } });
  return { ok: true, id: data.id as string, totalAfterUsd: finalAmountUsd };
}

// Only a Super Admin decides. The database re-checks the role at the moment of the update.
export async function decideDiscount(user: CurrentUser, discountId: string, decision: "approved" | "rejected", note: string): Promise<Result> {
  const g = gate(); if (g) return g;
  if (!isSuperAdmin(user)) return fail("Only a Super Admin can approve or reject a discretionary discount.");
  if (note.trim().length < 3) return fail("Add a short note with your decision.");
  const { error } = await createAdminClient().from("enquiry_discount_approvals").update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note.trim() }).eq("id", discountId).eq("status", "proposed");
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `enquiry.discount_${decision}`, entityType: "enquiry_discount", entityId: discountId });
  return { ok: true };
}

export async function createFollowUp(user: CurrentUser, i: { enquiryId: string; handlerId: string; nextAction: string; dueAt: string }): Promise<Result> {
  const g = gate(); if (g) return g;
  const s = staffOnly(user); if (s) return s;
  if (i.nextAction.trim().length < 3) return fail("Say what the next action is.");
  if (Number.isNaN(new Date(i.dueAt).getTime())) return fail("Choose a due date.");
  const { error } = await createAdminClient().from("enquiry_followups").insert({ enquiry_id: i.enquiryId, handler_profile_id: i.handlerId, next_action: i.nextAction.trim(), due_at: i.dueAt, created_by: user.id });
  if (error) return fail(error.message.includes("enquiry_one_open_followup") ? "This enquiry already has an open follow-up. Reschedule or complete it first." : clean(error));
  await logActivity({ actorUserId: user.id, action: "enquiry.followup_created", entityType: "enquiry", entityId: i.enquiryId });
  return { ok: true };
}

// Rescheduling (and handing over to another handler) closes the old follow-up with its reason and opens a new one in one transaction, so history is kept.
export async function rescheduleFollowUp(user: CurrentUser, i: { followUpId: string; newDueAt: string; reason: string; newHandlerId?: string | null }): Promise<Result> {
  const g = gate(); if (g) return g;
  const s = staffOnly(user); if (s) return s;
  if (i.reason.trim().length < 3) return fail("Say why it is being rescheduled.");
  if (Number.isNaN(new Date(i.newDueAt).getTime())) return fail("Choose a new due date.");
  const { error } = await createAdminClient().rpc("reschedule_enquiry_followup", { p_followup_id: i.followUpId, p_new_due: i.newDueAt, p_actor: user.id, p_note: i.reason.trim(), p_handler: i.newHandlerId ?? null });
  if (error) return fail(clean(error));
  return { ok: true };
}

export async function completeFollowUp(user: CurrentUser, followUpId: string, note: string): Promise<Result> {
  const g = gate(); if (g) return g;
  const s = staffOnly(user); if (s) return s;
  const { error } = await createAdminClient().from("enquiry_followups").update({ status: "done", completed_at: new Date().toISOString(), completed_by: user.id, completion_note: note.trim() || null, last_contact_at: new Date().toISOString() }).eq("id", followUpId).eq("status", "open");
  if (error) return fail(clean(error));
  return { ok: true };
}

// Proceed to quotation: creates ONE draft quotation from the latest communicated price and records the link. Pressing it twice, retrying, or two people at once
// all end in the same single quotation (deterministic key + unique constraints). It books nothing, takes no payment and posts no revenue.
export async function convertToQuotation(user: CurrentUser, enquiryId: string): Promise<Result<{ quotationId: string; quotationReference: string; alreadyDone: boolean }>> {
  const g = gate(); if (g) return g;
  // Creating a quotation is already an admin-level act in the quotation module; say so here instead of failing later with a vaguer message.
  if (!hasRole(user, "admin") && !isSuperAdmin(user)) return fail("Only an admin can create the quotation. Ask an admin to press Proceed to quotation.");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("enquiry_conversions").select("target_id").eq("enquiry_id", enquiryId).eq("target_type", "client_quotation").maybeSingle();
  if (existing) {
    const { data: q } = await admin.from("client_quotations").select("id, quotation_reference").eq("id", existing.target_id).maybeSingle();
    return { ok: true, quotationId: existing.target_id as string, quotationReference: (q?.quotation_reference as string) ?? "", alreadyDone: true };
  }
  const { data: enq } = await admin.from("enquiries").select("id, user_id, full_name, email, phone, commercial_intent").eq("id", enquiryId).maybeSingle();
  if (!enq) return fail("That enquiry was not found.");
  const { data: comm } = await admin.from("enquiry_price_communications").select("id, scope_title, scope_lines, communicated_amount, communicated_currency, assumptions, exclusions").eq("enquiry_id", enquiryId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  if (!comm) return fail("Save the communicated price first, so the quotation matches what the client was told.");
  if (comm.communicated_currency !== "USD") return fail("Only USD communicated prices can become a quotation here.");
  const lines = (comm.scope_lines as string[]).filter((l) => !/^(Estimated Total|Total|Ordift Fee)/i.test(l));
  const q = await createClientQuotation({
    enquiryId, currency: "USD",
    ...(enq.user_id ? { clientProfileId: enq.user_id as string } : { prospectName: (enq.full_name as string) || "Prospect", prospectEmail: (enq.email as string | null) ?? null, prospectPhone: (enq.phone as string | null) ?? null }),
    commercialNotes: [comm.assumptions ? `Assumptions: ${comm.assumptions}` : "", comm.exclusions ? `Exclusions: ${comm.exclusions}` : ""].filter(Boolean).join("\n") || null,
    items: [{ serviceItem: comm.scope_title as string, description: lines.join("; ").slice(0, 900) || null, quantity: 1, unitBasis: "package", sellingRate: Number(comm.communicated_amount), sourceType: "manual" }],
  });
  if (!q.ok) return fail(q.error);
  const { error } = await admin.from("enquiry_conversions").insert({ enquiry_id: enquiryId, target_type: "client_quotation", target_id: q.quotationId, price_communication_id: comm.id, idempotency_key: conversionIdempotencyKey(enquiryId, "client_quotation"), converted_by: user.id });
  if (error) return fail("The quotation was created but the link could not be recorded. Open the quotation from the Quotations list and tell the Founder.");
  await logActivity({ actorUserId: user.id, action: "enquiry.converted_to_quotation", entityType: "enquiry", entityId: enquiryId, metadata: { quotationReference: q.quotationReference } });
  return { ok: true, quotationId: q.quotationId, quotationReference: q.quotationReference, alreadyDone: false };
}

// ---------------------------------------------------------------- reads
export type EnquiryPricingView = {
  communications: { id: string; revision: number; scopeTitle: string; original: number | null; communicated: number; currency: string; channel: string; at: string; discountApprovalId: string | null; localNote: string | null }[];
  discount: { id: string; status: string; type: string; value: number; discountUsd: number; totalAfterUsd: number; reason: string; decisionNote: string | null } | null;
  followUp: { id: string; handlerId: string; handlerName: string; nextAction: string; dueAt: string; state: FollowUpState } | null;
  followUpHistory: { dueAt: string; handlerName: string; status: string; note: string | null }[];
  conversion: { quotationId: string; quotationReference: string } | null;
};
export async function getEnquiryPricingView(enquiryId: string): Promise<EnquiryPricingView | null> {
  if (!ENQUIRY_PRICING_PERSISTENCE_ENABLED) return null;
  const admin = createAdminClient();
  const [{ data: comms }, { data: discs }, { data: fus }, { data: conv }] = await Promise.all([
    admin.from("enquiry_price_communications").select("*").eq("enquiry_id", enquiryId).order("revision_number", { ascending: false }),
    admin.from("enquiry_discount_approvals").select("*").eq("enquiry_id", enquiryId).in("status", ["proposed", "approved"]).limit(1),
    admin.from("enquiry_followups").select("*").eq("enquiry_id", enquiryId).order("created_at", { ascending: false }),
    admin.from("enquiry_conversions").select("target_id").eq("enquiry_id", enquiryId).eq("target_type", "client_quotation").maybeSingle(),
  ]);
  const handlerIds = [...new Set((fus ?? []).map((f) => f.handler_profile_id as string))];
  const { data: profs } = handlerIds.length ? await admin.from("profiles").select("id, full_name").in("id", handlerIds) : { data: [] };
  const nameOf = (id: string) => (profs ?? []).find((p) => p.id === id)?.full_name ?? "Unnamed";
  const open = (fus ?? []).find((f) => f.status === "open");
  const quote = conv ? (await admin.from("client_quotations").select("id, quotation_reference").eq("id", conv.target_id).maybeSingle()).data : null;
  const d = (discs ?? [])[0];
  return {
    communications: (comms ?? []).map((c) => ({ id: c.id, revision: c.revision_number, scopeTitle: c.scope_title, original: c.original_total_usd === null ? null : Number(c.original_total_usd), communicated: Number(c.communicated_amount), currency: c.communicated_currency, channel: c.channel, at: c.communicated_at, discountApprovalId: c.discount_approval_id, localNote: c.indicative_local_currency ? `Internal reference only: ${c.indicative_local_currency} ${Number(c.indicative_local_amount).toFixed(2)} at ${c.fx_rate_to_usd} (rate effective ${String(c.fx_effective_from).slice(0, 10)})` : null })),
    discount: d ? { id: d.id, status: d.status, type: d.discount_type, value: Number(d.discount_value), discountUsd: Number(d.discount_usd), totalAfterUsd: Number(d.total_after_usd), reason: d.reason, decisionNote: d.decision_note } : null,
    followUp: open ? { id: open.id, handlerId: open.handler_profile_id, handlerName: nameOf(open.handler_profile_id), nextAction: open.next_action, dueAt: open.due_at, state: followUpState(open.due_at) } : null,
    followUpHistory: (fus ?? []).filter((f) => f.status !== "open").map((f) => ({ dueAt: f.due_at, handlerName: nameOf(f.handler_profile_id), status: f.status, note: f.completion_note })),
    conversion: conv && quote ? { quotationId: quote.id as string, quotationReference: quote.quotation_reference as string } : null,
  };
}

// Due and overdue follow-ups for the enquiries list.
export async function listDueFollowUps(limit = 20): Promise<{ id: string; enquiryId: string; reference: string; nextAction: string; dueAt: string; handlerName: string; state: FollowUpState }[]> {
  if (!ENQUIRY_PRICING_PERSISTENCE_ENABLED) return [];
  const admin = createAdminClient();
  const horizon = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { data: fus } = await admin.from("enquiry_followups").select("id, enquiry_id, handler_profile_id, next_action, due_at").eq("status", "open").lte("due_at", horizon).order("due_at", { ascending: true }).limit(limit);
  if (!fus?.length) return [];
  const [{ data: enqs }, { data: profs }] = await Promise.all([
    admin.from("enquiries").select("id, reference_number").in("id", fus.map((f) => f.enquiry_id as string)),
    admin.from("profiles").select("id, full_name").in("id", fus.map((f) => f.handler_profile_id as string)),
  ]);
  return fus.map((f) => ({ id: f.id as string, enquiryId: f.enquiry_id as string, reference: (enqs ?? []).find((e) => e.id === f.enquiry_id)?.reference_number ?? "", nextAction: f.next_action as string, dueAt: f.due_at as string, handlerName: (profs ?? []).find((p) => p.id === f.handler_profile_id)?.full_name ?? "Unnamed", state: followUpState(f.due_at as string) }));
}
