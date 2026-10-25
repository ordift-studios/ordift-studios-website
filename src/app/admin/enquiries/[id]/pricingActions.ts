"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeFollowUp, convertToQuotation, createFollowUp, decideDiscount, proposeDiscount, rescheduleFollowUp, saveCommunicatedPrice, type Result } from "@/lib/enquiry/pricingPersistence";

export type PState = { ok: boolean; message: string; kind?: "created" | "found"; reference?: string; quotationId?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
async function run(f: FormData, fn: (u: CurrentUser, enquiryId: string) => Promise<Result<object>>, okMessage: string): Promise<PState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const enquiryId = str(f, "enquiryId");
  const r = await fn(u, enquiryId);
  revalidatePath(`/admin/enquiries/${enquiryId}`); revalidatePath("/admin/enquiries");
  return r.ok ? { ok: true, message: okMessage } : { ok: false, message: r.error };
}
// The scope a discount applies to is always the LATEST communicated price, read from the database, never from the form.
async function latest(enquiryId: string) {
  const { data } = await createAdminClient().from("enquiry_price_communications").select("service, scope_title, scope_lines, original_total_usd, communicated_amount").eq("enquiry_id", enquiryId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  return data ? { service: data.service as string, title: data.scope_title as string, lines: data.scope_lines as string[], base: Number(data.original_total_usd ?? data.communicated_amount) } : null;
}

export async function proposeDiscountAction(_: PState, f: FormData): Promise<PState> {
  return run(f, async (u, id) => { const l = await latest(id); if (!l) return { ok: false, error: "Save the communicated price first." }; return proposeDiscount(u, { enquiryId: id, scopeTitle: l.title, scopeLines: l.lines, baseTotalUsd: l.base, type: str(f, "type") === "fixed" ? "fixed" : "percentage", value: Number(str(f, "value")), reason: str(f, "reason") }); }, "Proposed. It does not apply until a Super Admin approves it.");
}
export async function decideDiscountAction(_: PState, f: FormData): Promise<PState> {
  return run(f, (u) => decideDiscount(u, str(f, "discountId"), str(f, "decision") === "approved" ? "approved" : "rejected", str(f, "note")), "Decision recorded.");
}
export async function communicateDiscountAction(_: PState, f: FormData): Promise<PState> {
  return run(f, async (u, id) => {
    const l = await latest(id); if (!l) return { ok: false, error: "Save the communicated price first." };
    const { data: d } = await createAdminClient().from("enquiry_discount_approvals").select("id, total_after_usd").eq("enquiry_id", id).eq("status", "approved").maybeSingle();
    if (!d) return { ok: false, error: "There is no approved discount to communicate." };
    return saveCommunicatedPrice(u, { enquiryId: id, service: l.service, scopeTitle: l.title, scopeLines: l.lines, baseTotalUsd: l.base, communicatedUsd: Number(d.total_after_usd), channel: str(f, "channel"), communicatedAt: str(f, "communicatedAt") || new Date().toISOString(), discountApprovalId: d.id as string });
  }, "Saved as a new revision. Nothing was sent to the client.");
}
export async function createFollowUpAction(_: PState, f: FormData): Promise<PState> {
  return run(f, (u, id) => createFollowUp(u, { enquiryId: id, handlerId: str(f, "handlerId") || u.id, nextAction: str(f, "nextAction"), dueAt: str(f, "dueAt") }), "Follow-up set. Nobody is emailed or messaged.");
}
export async function rescheduleFollowUpAction(_: PState, f: FormData): Promise<PState> {
  return run(f, (u) => rescheduleFollowUp(u, { followUpId: str(f, "followUpId"), newDueAt: str(f, "dueAt"), reason: str(f, "reason"), newHandlerId: str(f, "handlerId") || null }), "Rescheduled; the earlier date is kept in the history.");
}
export async function completeFollowUpAction(_: PState, f: FormData): Promise<PState> {
  return run(f, (u) => completeFollowUp(u, str(f, "followUpId"), str(f, "note")), "Follow-up completed.");
}
export async function convertAction(_: PState, f: FormData): Promise<PState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const enquiryId = str(f, "enquiryId");
  const r = await convertToQuotation(u, enquiryId);
  revalidatePath(`/admin/enquiries/${enquiryId}`); revalidatePath("/admin/pricing/quotations");
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, kind: r.alreadyDone ? "found" : "created", reference: r.quotationReference, quotationId: r.quotationId, message: r.alreadyDone ? `A quotation already exists (${r.quotationReference}); no second one was created.` : `Draft quotation ${r.quotationReference} created. It is not issued or sent, and nothing is booked or charged.` };
}
