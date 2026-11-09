import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { bookingFlagOn } from "./rules";
import { loadLatestAvailabilityCheck } from "./availabilityService";
import { CONDITIONAL_WORDING_STATUS, CONDITIONAL_WORDING_VERSION, decideQuotationAvailability, hasConditionalSentence, outlookFor, withConditionalSentence, withoutConditionalSentence, type FormOutlook, type LatestCheckFacts, type PolicyMode } from "./quotationAvailabilityPolicy";

// QUOTATION AVAILABILITY POLICY - server side (LOCAL; inert while BOOKING_CONFIRMATION_ENABLED is off). Applied by the Issue action BEFORE a quotation is issued. It decides from the enquiry's latest
// availability check, records the declaration in the audit log (strict), and for a conditional quotation adds the standard sentence to the DRAFT's terms. It creates no booking, reservation, hold,
// payment or email, never touches an issued quotation, and does not replace the availability recheck that booking confirmation performs.
type Fail = { ok: false; error: string };
export const BASIS_ACTION = "client_quotation.availability_basis_declared";

type Q = { id: string; status: string; enquiry_id: string | null; crew_support_request_id: string | null; payment_booking_terms: string | null };
async function loadQuotation(id: string): Promise<Q | null> {
  const { data } = await createAdminClient().from("client_quotations").select("id, status, enquiry_id, crew_support_request_id, payment_booking_terms").eq("id", id).maybeSingle();
  return (data as Q | null) ?? null;
}
const factsOf = (l: Awaited<ReturnType<typeof loadLatestAvailabilityCheck>>): LatestCheckFacts => (l ? { state: l.state, at: l.at, stale: l.stale } : null);

export type QuotationAvailabilityContext = { applies: boolean; hasEnquiry: boolean; latestLabel: string | null; latestAt: string | null; latestStale: boolean; outlook: FormOutlook };
export async function loadQuotationAvailabilityContext(quotationId: string, env: Record<string, string | undefined> = process.env): Promise<QuotationAvailabilityContext | null> {
  if (!bookingFlagOn(env)) return null;
  const q = await loadQuotation(quotationId);
  if (!q || q.crew_support_request_id) return null;                                   // Crew Support quotations have their own process
  const latest = q.enquiry_id ? await loadLatestAvailabilityCheck(q.enquiry_id) : null;
  return { applies: true, hasEnquiry: Boolean(q.enquiry_id), latestLabel: latest?.label ?? null, latestAt: latest?.at ?? null, latestStale: latest?.stale ?? false, outlook: outlookFor({ flagOn: true, hasEnquiry: Boolean(q.enquiry_id), latest: factsOf(latest) }) };
}

export type AppliedPolicy = { ok: true; mode: PolicyMode; conditional: boolean; summary: string } | Fail;
export async function applyAvailabilityPolicyForIssue(params: { actorUserId: string; quotationId: string; basis: string; independentReason: string; conditionalAck: boolean }, env: Record<string, string | undefined> = process.env): Promise<AppliedPolicy> {
  if (!bookingFlagOn(env)) return { ok: true, mode: "not_applicable", conditional: false, summary: "" };
  const user = await getCurrentUser();
  if (!user || user.id !== params.actorUserId || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to issue quotations." };
  const q = await loadQuotation(params.quotationId);
  if (!q) return { ok: false, error: "Quotation not found." };
  if (q.crew_support_request_id) return { ok: true, mode: "not_applicable", conditional: false, summary: "" };
  if (q.status !== "draft") return { ok: false, error: "Only a draft can be issued." };
  const latest = q.enquiry_id ? await loadLatestAvailabilityCheck(q.enquiry_id) : null;
  const d = decideQuotationAvailability({ flagOn: true, hasEnquiry: Boolean(q.enquiry_id), basis: params.basis, independentReason: params.independentReason, conditionalAck: params.conditionalAck, latest: factsOf(latest) });
  if (!d.ok) return { ok: false, error: d.error };
  const admin = createAdminClient();
  // the declaration is recorded first (strict): nothing is issued on a basis that was not recorded
  const { error } = await admin.from("activity_log").insert({
    actor_user_id: user.id, action: BASIS_ACTION, entity_type: "client_quotation", entity_id: q.id,
    metadata: { mode: d.mode, basis: params.basis, independentReason: params.basis === "independent" ? params.independentReason.trim() : null, latestCheckState: latest?.state ?? null, latestCheckAt: latest?.at ?? null, enquiryId: q.enquiry_id,
      conditionalSentenceAdded: d.conditional, conditionalWording: d.conditional ? { version: CONDITIONAL_WORDING_VERSION, status: CONDITIONAL_WORDING_STATUS } : null, notReservation: true, availabilityRecheckedAtBookingConfirmation: true },
  });
  if (error) { console.error("[quotation-availability] audit write failed", error.message); return { ok: false, error: "The availability basis could not be recorded, so nothing was issued. Try again." }; }
  // the DRAFT's terms carry the conditional sentence exactly when (and only when) the quotation is conditional
  const terms = q.payment_booking_terms;
  const wanted = d.conditional ? withConditionalSentence(terms) : hasConditionalSentence(terms) ? withoutConditionalSentence(terms) : null;
  if (wanted !== null && wanted !== (terms ?? "")) {
    const { data, error: upErr } = await admin.from("client_quotations").update({ payment_booking_terms: wanted || null }).eq("id", q.id).eq("status", "draft").select("id").maybeSingle();
    if (upErr || !data) return { ok: false, error: "The quotation's terms could not be updated for the availability basis, so nothing was issued." };
  }
  return { ok: true, mode: d.mode, conditional: d.conditional, summary: d.summary };
}
