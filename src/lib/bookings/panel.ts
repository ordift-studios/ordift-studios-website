import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, type CurrentUser } from "@/lib/portal/roles";
import { getContractingEntityStanding } from "@/lib/organization/entityRegistrations";
import { listOverridePool } from "@/lib/crewSupport/candidates";
import type { PaymentCondition } from "@/lib/crewSupport/paymentCondition";
import { listBookingNotifications, type JobRow } from "./notificationService";
import { bookingFlagOn, classifyPaymentTerms, confirmationBlockers, evaluateAgreement, projectPanel, type BookingSettings, type Conflict, type PanelFull, type Resolution, type Segment, type TermsCheck, type Viewer } from "./rules";
import { loadBookingSettings, previewConflicts } from "./service";

// BOOKING CONFIRMATION - what the enquiry page shows. Read-only: nothing here writes. With the flag off every function returns null WITHOUT reading anything.
// The database stays the final judge (confirm_ordinary_booking re-checks every rule); this module lets the screen show the same blockers BEFORE an attempt.

// ---- pure: the assessment of one draft against the accepted quotation (shared by the page, the preview action and the tests)
export type AssessInput = {
  quotation: { currency: string; total: number; paymentCondition: PaymentCondition; depositPercent: number | null; termsText: string | null };
  activities: string[]; settings: BookingSettings; entityEligible: boolean; hasExecutedAgreement: boolean; amountDueUsd: number | null; verifiedPaidUsd: number | null;
  segments: Segment[]; escalators: string[]; clarification: { kind: string; evidence: string } | null; conflicts: Conflict[]; resolutions: Resolution[]; assigneeId: string | null; today: string;
};
export function assessDraft(i: AssessInput): PanelFull & { termsCheck: TermsCheck } {
  const agreement = evaluateAgreement(i.settings, { activities: i.activities, currency: i.quotation.currency, total: i.quotation.total, escalators: i.escalators, segments: i.segments });
  const termsCheck = classifyPaymentTerms(i.quotation.termsText, i.quotation.paymentCondition, i.quotation.depositPercent);
  const blockerInput = {
    quotationAccepted: true, entityEligible: i.entityEligible, agreement: { ...agreement, hasExecutedAgreement: i.hasExecutedAgreement },
    payment: { condition: i.quotation.paymentCondition, depositPercent: i.quotation.depositPercent, amountDueUsd: i.amountDueUsd, verifiedPaidUsd: i.verifiedPaidUsd },
    termsCheck, clarification: i.clarification, segments: i.segments, conflicts: i.conflicts, resolutions: i.resolutions, assigneeId: i.assigneeId, today: i.today,
  };
  const blockers = confirmationBlockers(blockerInput), operationalBlockers = confirmationBlockers(blockerInput, { redactAmounts: true });
  const outstanding = i.amountDueUsd === null ? null : Math.max(i.amountDueUsd - (i.verifiedPaidUsd ?? 0), 0);
  return { blockers, operationalBlockers, conflicts: i.conflicts, payment: { condition: i.quotation.paymentCondition, amountDueUsd: i.amountDueUsd, verifiedPaidUsd: i.verifiedPaidUsd, outstandingUsd: outstanding }, agreement, confirmation: null, termsCheck };
}

export const viewerOf = (u: CurrentUser | null): Viewer | null => (u ? { id: u.id, roles: u.roles } : null);
export const todayUtc = () => new Date().toISOString().slice(0, 10);          // the database's current_date (UTC)

// ---- the accepted ordinary quotation and everything the rules need, read once
export type AcceptedContext = {
  enquiry: { id: string; reference: string; crmStage: string; amountDueUsd: number | null; verifiedPaidUsd: number | null };
  quotation: { id: string; reference: string; currency: string; total: number; paymentCondition: PaymentCondition; depositPercent: number | null; termsText: string | null };
  activities: string[]; entityId: string | null; entityEligible: boolean; entityBlockers: string[]; executedAgreement: { id: string; reference: string } | null;
};
export async function loadAcceptedContext(enquiryId: string): Promise<AcceptedContext | { reason: "crew_support" | "no_enquiry" | "not_accepted" }> {
  const db = createAdminClient();
  const { data: e } = await db.from("enquiries").select("id, reference_number, crm_stage, amount_due, amount_paid, commercial_intent").eq("id", enquiryId).maybeSingle();
  if (!e) return { reason: "no_enquiry" };
  if (e.commercial_intent === "creative_crew_support") return { reason: "crew_support" };      // Crew Support has its own confirmation path
  const { data: q } = await db.from("client_quotations").select("id, quotation_reference, currency, total, payment_condition, deposit_percent, payment_booking_terms")
    .eq("enquiry_id", enquiryId).is("crew_support_request_id", null).eq("status", "accepted").not("issued_at", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!q) return { reason: "not_accepted" };
  const { data: issued } = await db.from("activity_log").select("metadata").eq("action", "client_quotation.issued").eq("entity_id", q.id as string).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const meta = (issued?.metadata ?? {}) as { declaredActivities?: string[]; contractingEntity?: { entityId?: string } };
  const activities = Array.isArray(meta.declaredActivities) ? meta.declaredActivities : [];
  const entityId = meta.contractingEntity?.entityId ?? null;
  const standing = entityId ? await getContractingEntityStanding(entityId, todayUtc(), activities) : null;
  const { data: ags } = await db.from("agreements").select("id, agreement_reference, primary_context_type, primary_context_reference, executed_at, cancelled_at, terminated_at, expired_at, declined_at, superseded_by_agreement_id")
    .in("primary_context_type", ["enquiry", "client_quotation"]).in("primary_context_reference", [e.reference_number as string, q.quotation_reference as string]).not("executed_at", "is", null);
  const live = (ags ?? []).find((a) => !a.cancelled_at && !a.terminated_at && !a.expired_at && !a.declined_at && !a.superseded_by_agreement_id);
  return {
    enquiry: { id: e.id as string, reference: e.reference_number as string, crmStage: String(e.crm_stage), amountDueUsd: e.amount_due === null ? null : Number(e.amount_due), verifiedPaidUsd: e.amount_paid === null ? null : Number(e.amount_paid) },
    quotation: { id: q.id as string, reference: q.quotation_reference as string, currency: q.currency as string, total: Number(q.total), paymentCondition: ((q.payment_condition as string | null) ?? "none") as PaymentCondition, depositPercent: q.deposit_percent === null ? null : Number(q.deposit_percent), termsText: (q.payment_booking_terms as string | null) ?? null },
    activities, entityId, entityEligible: Boolean(standing?.eligibility.eligible), entityBlockers: standing?.eligibility.blockers ?? (entityId ? ["The contracting entity could not be read."] : ["No contracting entity was recorded when the quotation was issued."]),
    executedAgreement: live ? { id: live.id as string, reference: live.agreement_reference as string } : null,
  };
}

// ---- the latest confirmation record (append-only: a change or cancellation is a newer row)
export type CurrentBooking = { id: string; version: number; kind: "confirmed" | "changed" | "cancelled"; assignedProfileId: string | null; assignedLabel: string | null; confirmedAt: string; reason: string | null; basis: string | null; segments: Segment[]; settingsVersion: number | null;
  payment: { condition: PaymentCondition | null; depositPercent: number | null; requiredUsd: number | null; verifiedPaidUsd: number | null; outstandingUsd: number | null }; agreementRequired: boolean; agreementReasons: string[]; conflictsReviewed: number; clarification: { kind: string; evidence: string } | null };
export async function loadCurrentBooking(enquiryId: string): Promise<CurrentBooking | null> {
  const db = createAdminClient();
  const { data: c } = await db.from("enquiry_booking_confirmations").select("*").eq("enquiry_id", enquiryId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!c) return null;
  const [{ data: segs }, { data: person }] = await Promise.all([
    db.from("enquiry_booking_segments").select("seq, starts_at, ends_at, timezone, kind, location, platform, note").eq("confirmation_id", c.id as string).order("seq"),
    c.assigned_profile_id ? db.from("profiles").select("full_name, member_number").eq("id", c.assigned_profile_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = person as { full_name: string | null; member_number: string | null } | null;
  const review = (c.conflict_review ?? {}) as { conflicts?: unknown[] };
  return {
    id: c.id as string, version: c.version as number, kind: c.kind as CurrentBooking["kind"], assignedProfileId: (c.assigned_profile_id as string | null) ?? null,
    assignedLabel: p ? (p.member_number ? `${p.member_number} — ${p.full_name ?? ""}`.trim() : p.full_name ?? "Unnamed profile") : null,        // member number first (Audit Identity Standard)
    confirmedAt: c.confirmed_at as string, reason: (c.reason as string | null) ?? null, basis: (c.basis as string | null) ?? null, settingsVersion: (c.settings_version as number | null) ?? null,
    segments: (segs ?? []).map((s) => ({ startsAt: s.starts_at as string, endsAt: s.ends_at as string, timezone: s.timezone as string, kind: s.kind as Segment["kind"], location: s.location as string | null, platform: s.platform as string | null, note: s.note as string | null })),
    payment: { condition: (c.payment_condition as PaymentCondition | null) ?? null, depositPercent: c.deposit_percent === null ? null : Number(c.deposit_percent), requiredUsd: c.required_usd === null ? null : Number(c.required_usd), verifiedPaidUsd: c.verified_paid_usd === null ? null : Number(c.verified_paid_usd), outstandingUsd: c.outstanding_usd === null ? null : Number(c.outstanding_usd) },
    agreementRequired: Boolean(c.agreement_required), agreementReasons: (c.agreement_reasons as string[]) ?? [], conflictsReviewed: Array.isArray(review.conflicts) ? review.conflicts.length : 0,
    clarification: c.payment_clarification && typeof c.payment_clarification === "object" ? { kind: String((c.payment_clarification as Record<string, unknown>).kind ?? ""), evidence: String((c.payment_clarification as Record<string, unknown>).evidence ?? "") } : null,
  };
}

// What each level may see of the booking RECORD: a Super Admin everything; an Admin the schedule, person and version only (no amounts, no payment condition, no internal note); staff none (they see conflicts only).
export function projectBooking(b: CurrentBooking | null, level: "super_admin" | "admin" | "staff"): CurrentBooking | null {
  if (!b || level === "staff") return null;
  if (level === "super_admin") return b;
  return { ...b, basis: null, settingsVersion: null, conflictsReviewed: 0, clarification: null, payment: { condition: null, depositPercent: null, requiredUsd: null, verifiedPaidUsd: null, outstandingUsd: null }, reason: b.reason };
}

// ---- the whole panel for one viewer. null = show nothing (flag off, no role, or not applicable to this viewer)
export type BookingPanelData = {
  level: "super_admin" | "admin" | "staff"; enquiry: { id: string; reference: string }; quotation?: AcceptedContext["quotation"]; notReady?: string;
  current: CurrentBooking | null; assessment: ReturnType<typeof projectPanel>; settings: BookingSettings | null; assignable: { profileId: string; label: string }[]; canConfirm: boolean;
  agreementReference: string | null; entityBlockers: string[]; notifications: JobRow[];
};
export async function loadBookingPanel(enquiryId: string, env: Record<string, string | undefined> = process.env): Promise<BookingPanelData | null> {
  if (!bookingFlagOn(env)) return null;
  const user = await getCurrentUser(); const viewer = viewerOf(user); if (!viewer) return null;
  const isSuper = viewer.roles.includes("super_admin"), isAdmin = viewer.roles.includes("admin"), isStaff = viewer.roles.includes("staff");
  if (!isSuper && !isAdmin && !isStaff) return null;
  const ctx = await loadAcceptedContext(enquiryId);
  if ("reason" in ctx) return ctx.reason === "not_accepted" && (isSuper || isAdmin) ? emptyPanel(enquiryId, viewer, "The client must accept an issued ordinary quotation before this enquiry can be booked.") : null;
  const [current, settings] = await Promise.all([loadCurrentBooking(enquiryId), loadBookingSettings()]);
  const live = current && current.kind !== "cancelled" ? current : null;
  const segments = live?.segments ?? [];
  const conflicts = live && live.assignedProfileId ? (await previewConflicts({ assigneeId: live.assignedProfileId, segments, excludeEnquiryId: enquiryId }, env)) ?? [] : [];
  const full: PanelFull | null = settings ? assessDraft({ quotation: ctx.quotation, activities: ctx.activities, settings, entityEligible: ctx.entityEligible, hasExecutedAgreement: Boolean(ctx.executedAgreement), amountDueUsd: ctx.enquiry.amountDueUsd, verifiedPaidUsd: ctx.enquiry.verifiedPaidUsd,
    segments, escalators: [], clarification: live?.clarification ?? null, conflicts, resolutions: [], assigneeId: live?.assignedProfileId ?? null, today: todayUtc() }) : null;
  const projected = full ? projectPanel({ ...full, confirmation: live as unknown as Record<string, unknown> | null }, viewer, live?.assignedProfileId ?? null) : null;
  if (!projected) return null;                                                                       // staff who are not the assigned person see nothing
  const assignable = isSuper ? (await listOverridePool([])).map((p) => ({ profileId: p.profileId, label: p.memberNumber ? `${p.memberNumber} — ${p.name}` : p.name })) : [];
  return { level: projected.level, enquiry: { id: ctx.enquiry.id, reference: ctx.enquiry.reference }, quotation: isSuper ? ctx.quotation : undefined, current: projectBooking(current, projected.level), assessment: projected, settings: isSuper ? settings : null, assignable, canConfirm: isSuper && Boolean(settings),
    agreementReference: ctx.executedAgreement?.reference ?? null, entityBlockers: isSuper || isAdmin ? ctx.entityBlockers : [], notifications: isSuper ? await listBookingNotifications(ctx.enquiry.id) : [] };
}
function emptyPanel(enquiryId: string, v: Viewer, notReady: string): BookingPanelData {
  return { level: v.roles.includes("super_admin") ? "super_admin" : "admin", enquiry: { id: enquiryId, reference: "" }, notReady, current: null, assessment: null, settings: null, assignable: [], canConfirm: false, agreementReference: null, entityBlockers: [], notifications: [] };
}

// Settings history for the versioned-settings screen (Super Admin only; the caller checks).
export async function listSettingsVersions(): Promise<(BookingSettings & { note: string | null; createdAt: string })[]> {
  const { data } = await createAdminClient().from("booking_rule_settings").select("version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators, note, created_at").order("version", { ascending: false }).limit(50);
  return (data ?? []).map((r) => ({ version: r.version as number, status: r.status as "provisional" | "approved", thresholds: r.agreement_value_thresholds as Record<string, number>, alwaysCategories: r.agreement_always_categories as string[], escalators: r.agreement_escalators as string[], note: (r.note as string | null) ?? null, createdAt: r.created_at as string }));
}
