import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// --- fake Supabase admin client for the payments-module checks (no network) ---
type Row = Record<string, unknown>;
const state: { tables: Record<string, Row[]>; updates: { table: string; payload: Row }[] } = { tables: {}, updates: [] };
function fakeAdmin() {
  const make = (table: string) => {
    let rows = state.tables[table] ?? [];
    let mode: "select" | "update" = "select";
    let payload: Row = {};
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      not: () => q, in: () => q, neq: () => q, limit: () => q, order: () => q,
      update: (p: Row) => { mode = "update"; payload = p; return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(mode === "update" ? (state.updates.push({ table, payload }), { data: rows.map((r) => ({ id: r.id })), error: null }) : { data: rows, error: null }),
    };
    return q;
  };
  return { from: make };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeAdmin() }));
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ sendBookingConfirmedEmail: vi.fn() }));
vi.mock("@/lib/notifications/newBookingNotification", () => ({ sendNewBookingNotification: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(), logActivityAsSystem: vi.fn() }));
vi.mock("@/lib/payments/providerRegistry", () => ({}));
vi.mock("@/lib/payments/reconcilePendingPayment", () => ({}));
vi.mock("@/lib/payments/currency", () => ({ lockExchangeRate: vi.fn(), convertedAmountsMatch: vi.fn() }));
vi.mock("@/lib/shared/recordId", () => ({ generateRecordId: vi.fn() }));

import { bookingTermsApplicability, scopeStatesEveryService } from "./standardTerms";
import { describePaymentCondition, paymentBlocker, requiredPaymentUsd, validatePaymentCondition } from "./paymentCondition";
import { confirmationBlockers, validateCancellationReason, validateReviewNote, isPostCommitmentStatus, assessAgreement } from "./commitmentRules";
import { canRespondToOffer, canSendOffer, toCrewJobView, validateOfferInput } from "./crewOfferRules";
import { buildCrewEmail } from "./crewNotifications";
import { crewSupportSchema } from "./schema";
import { NO_QUOTATION, validateStatusChange } from "./rules";
import { snapshotGap, buildProjectSnapshot } from "./quotationSnapshot";
import { toClientQuotationView } from "./quotationRules";
import { STATUS_NOTIFICATIONS } from "./notificationConfig";
import { resolveAmountToCharge } from "@/lib/payments/checkoutService";
import { syncEntityPaymentStatus } from "@/lib/payments/gatewaySync";

beforeEach(() => { state.tables = {}; state.updates = []; });

describe("1. approved terms are referenced only where their own scope covers the service", () => {
  it("OS-LGL-004's Scope of Application says the terms apply to every Ordift service, so the reference is offered — with its citation", () => {
    const a = bookingTermsApplicability();
    expect(a.applies).toBe(true);
    if (a.applies) {
      expect(a.citation).toMatch(/OS-LGL-004 v1\.0, clause 3 \(Scope of Application\)/);
      expect(a.reference).toMatch(/\/legal\/booking/);
    }
  });
  it("if the scope wording did not cover every service, the reference would NOT be offered", () => {
    expect(scopeStatesEveryService("These Terms apply to every service offered by Ordift Studios, including future services")).toBe(true);
    expect(scopeStatesEveryService("These Terms apply only to wedding photography bookings.")).toBe(false);
    expect(scopeStatesEveryService("")).toBe(false);
  });
  it("it is never applied automatically — only inserted by an explicit click", () => {
    const editor = readFileSync("src/app/admin/crew-support/CrewQuotationEditor.tsx", "utf8");
    expect(editor).toMatch(/onClick=\{\(\) => setTermsText/);
    expect(readFileSync("src/lib/crewSupport/quotation.ts", "utf8")).not.toContain("approvedBookingTermsReference");
  });
});

describe("2. configurable deposits / payment conditions, enforced only when contractually required", () => {
  it("validates the condition: deposit needs 1–100%, none/full carry no percentage", () => {
    expect(validatePaymentCondition({ condition: "deposit", depositPercent: 50 })).toEqual({ ok: true, condition: "deposit", depositPercent: 50 });
    expect(validatePaymentCondition({ condition: "deposit", depositPercent: null }).ok).toBe(false);
    expect(validatePaymentCondition({ condition: "deposit", depositPercent: 0 }).ok).toBe(false);
    expect(validatePaymentCondition({ condition: "deposit", depositPercent: 101 }).ok).toBe(false);
    expect(validatePaymentCondition({ condition: "none", depositPercent: 30 })).toEqual({ ok: true, condition: "none", depositPercent: null });
    expect(validatePaymentCondition({ condition: "wire-me-money", depositPercent: null }).ok).toBe(false);
  });
  it("computes the required amount from the accepted USD total", () => {
    expect(requiredPaymentUsd("none", null, 1000)).toBe(0);
    expect(requiredPaymentUsd("deposit", 30, 1000)).toBe(300);
    expect(requiredPaymentUsd("deposit", 33.33, 999)).toBe(332.97);
    expect(requiredPaymentUsd("full", null, 1000)).toBe(1000);
  });
  it("NONE never blocks; a deposit/full requirement blocks until enough has been RECEIVED", () => {
    expect(paymentBlocker({ condition: "none", depositPercent: null, amountDueUsd: 1000, amountPaidUsd: 0 })).toBeNull();
    expect(paymentBlocker({ condition: "deposit", depositPercent: 30, amountDueUsd: 1000, amountPaidUsd: 0 })).toMatch(/30% deposit \(USD 300\.00\) must be received/);
    expect(paymentBlocker({ condition: "deposit", depositPercent: 30, amountDueUsd: 1000, amountPaidUsd: 300 })).toBeNull();
    expect(paymentBlocker({ condition: "deposit", depositPercent: 30, amountDueUsd: 1000, amountPaidUsd: 299.99 })).not.toBeNull();
    expect(paymentBlocker({ condition: "full", depositPercent: null, amountDueUsd: 1000, amountPaidUsd: 999 })).toMatch(/Full payment/);
    expect(paymentBlocker({ condition: "full", depositPercent: null, amountDueUsd: 1000, amountPaidUsd: 1000 })).toBeNull();
  });
  it("a refund that drops received money below the requirement re-blocks (amount_paid is net of refunds)", () => {
    expect(paymentBlocker({ condition: "deposit", depositPercent: 50, amountDueUsd: 1000, amountPaidUsd: 200 })).not.toBeNull();
  });
  it("the confirmation gate includes the payment blocker, and without one confirmation is not held up by payment", () => {
    const ok = { hasAcceptedQuotation: true, agreement: assessAgreement({ required: false, reason: null, hasExecutedAgreement: false, quotationTerms: "50% on acceptance; cancellation fee applies within 48 hours." }), slots: [{ slotId: "s", label: "Photographer 1", status: "assigned" as const, assigneeProfileId: "p", crewAccepted: true, engagement: { id: "e", agreedAmount: 100, currency: "GHS", status: "draft" }, firmConflicts: [] }], isTest: false };
    expect(confirmationBlockers({ ...ok, paymentBlocker: null })).toEqual([]);
    expect(confirmationBlockers({ ...ok, paymentBlocker: "A 30% deposit (USD 300.00) must be received before confirmation" })[0]).toMatch(/deposit/);
  });
  it("test records are not blocked by a payment they can never make; the panel says so", () => {
    expect(readFileSync("src/lib/crewSupport/commitmentData.ts", "utf8")).toContain("hasAcceptedQuotation && !request.is_test ? paymentBlocker(");
    expect(readFileSync("src/app/admin/crew-support/CommitmentPanel.tsx", "utf8")).toContain("QA/test record: not enforced, and no payment is created.");
  });
  it("is shown to the client in plain words, frozen with the issued quotation, and the 'payment requested' email is sent only when a payment is required", () => {
    expect(describePaymentCondition("deposit", 30, 1000)).toBe("A 30% deposit (USD 300.00) is required before your request is confirmed.");
    expect(describePaymentCondition("none", null, 1000)).toBeNull();
    expect(STATUS_NOTIFICATIONS.payment_pending).toBe("payment_requested");
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    expect(admin).toContain('accepted.payment_condition === "none") template = undefined');
    const row = { quotation_reference: "Q", status: "sent", currency: "USD", subtotal: 1, discount_total: 0, tax_total: 0, total: 1000, valid_until: null, payment_booking_terms: "t", issued_at: null, accepted_at: null, usd_total: 1000, fx_currency: null, fx_rate_to_usd: null, fx_locked_at: null, payment_condition: "deposit", deposit_percent: 30 };
    expect(toClientQuotationView(row as never, []).paymentConditionText).toMatch(/30% deposit/);
  });
  it("the condition lives on the quotation row (immutable once issued) — migration is additive with safe defaults", () => {
    const sql = readFileSync("supabase/migrations/0147_crew_support_payment_conditions_and_variations.sql", "utf8").replace(/--.*$/gm, "");
    expect(sql).toMatch(/payment_condition text not null default 'none'/);
    expect(sql).not.toMatch(/\b(truncate|delete\s+from|insert\s+into|update\s+public)\b/i);
  });
});

describe("3. an accepted quotation is never overwritten — variations require client acceptance", () => {
  const q = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
  const create = q.slice(q.indexOf("export async function createCrewSupportVariation"), q.indexOf("// ---------------------------------------------------------- client portal"));
  const apply = q.slice(q.indexOf("async function applyAcceptedVariation"), q.indexOf("export async function createCrewSupportVariation"));
  it("creating a variation inserts a NEW row and never touches the accepted one", () => {
    expect(create).toContain('.insert({');
    expect(create).toContain("is_variation: true");
    expect(create).toContain("supersedes_id: base.id");
    expect(create).not.toMatch(/\.from\("client_quotations"\)\.update\(/);
    expect(create).not.toMatch(/client_quotation_items"\)\.(update|delete)/);
  });
  it("the accepted original is superseded ONLY when the client accepts the variation, and the receivable re-points with it", () => {
    expect(apply).toContain('status: "superseded"');
    expect(apply).toContain('.eq("status", "accepted")');
    expect(apply).toContain("amount_due_quotation_id: quote.id");
    expect(apply).toContain("syncEntityPaymentStatus");
    expect(apply).toContain("Finance should review a credit or refund");
    const complete = q.slice(q.indexOf("export async function completeAcceptance"), q.indexOf("async function applyAcceptedVariation"));
    expect(complete).toContain("if (quote.isVariation) {");
  });
  it("the database allows one live original AND one live variation per request (migration 0147), so they can coexist", () => {
    const sql = readFileSync("supabase/migrations/0147_crew_support_payment_conditions_and_variations.sql", "utf8");
    expect(sql).toMatch(/is_variation = false and status in \('draft', 'ready', 'sent', 'accepted'\)/);
    expect(sql).toMatch(/is_variation = true and status in \('draft', 'ready', 'sent'\)/);
  });
  it("the client sees the variation as a proposed change while the accepted quotation stays in force", () => {
    const row = { quotation_reference: "ORD-QUO-2", status: "sent", currency: "USD", subtotal: 1, discount_total: 0, tax_total: 0, total: 1200, valid_until: null, payment_booking_terms: "t", issued_at: null, accepted_at: null, usd_total: 1200, fx_currency: null, fx_rate_to_usd: null, fx_locked_at: null, is_variation: true, replaces_reference: "ORD-QUO-1" };
    const v = toClientQuotationView(row as never, []);
    expect(v.isVariation).toBe(true);
    expect(v.replacesReference).toBe("ORD-QUO-1");
    expect(readFileSync("src/app/portal/(dashboard)/client/projects/[kind]/[id]/quotation/page.tsx", "utf8")).toContain("stays in force until you accept this one");
  });
  it("issuing a variation changes neither the request status nor the CRM stage", () => {
    const issue = q.slice(q.indexOf("export async function completeIssue"), q.indexOf("// ------------------------------------------------------------- acceptance"));
    expect(issue).toContain("if (!quote.isVariation && detail.request.status === \"quote_preparation\")");
    expect(issue).toContain("if (!quote.isVariation) await syncEnquiryStage");
  });
});

describe("4. post-confirmation cancellation: management only, justified, with financial review", () => {
  it("needs a real justification; the review outcome needs a note", () => {
    expect(validateCancellationReason("").ok).toBe(false);
    expect(validateCancellationReason("client withdrew").ok).toBe(true);
    expect(validateReviewNote("ok").ok).toBe(false);
    expect(isPostCommitmentStatus("confirmed") && isPostCommitmentStatus("in_production") && !isPostCommitmentStatus("quoted")).toBe(true);
  });
  it("the status dropdown cannot cancel a confirmed request", () => {
    for (const from of ["confirmed", "in_production"] as const) {
      const r = validateStatusChange(from, "cancelled", [], NO_QUOTATION);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/authorised management/);
    }
    expect(validateStatusChange("quoted", "cancelled", [], NO_QUOTATION).ok).toBe(true);
  });
  it("the action is gated to management and finance review to a finance approver; the writer records who/when/why and raises the review", () => {
    const actions = readFileSync("src/app/admin/crew-support/commitmentActions.ts", "utf8");
    expect(actions).toContain("isManagementUser(user)");
    const mgmt = readFileSync("src/lib/crewSupport/management.ts", "utf8");
    expect(mgmt).toMatch(/isSuperAdmin\(user\) \|\| \(await isExecutiveAdmin\(user\.id\)\)/);
    const c = readFileSync("src/lib/crewSupport/commitment.ts", "utf8");
    expect(c).toContain("FINANCE_CAPABILITIES.paymentObligationApprove");
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    expect(admin).toContain('cancellation_review_status: isPostCommitmentStatus(params.from) ? "pending" : "not_required"');
    expect(admin).toContain("cancellation_reason: params.reason");
  });
  it("cancelling changes no money: no payments/receivable/payable writes in the cancel or review code", () => {
    const c = readFileSync("src/lib/crewSupport/commitment.ts", "utf8");
    const cancel = c.slice(c.indexOf("export async function cancelConfirmedRequest"));
    expect(cancel).not.toMatch(/amount_due|amount_paid|from\("payments"\)|payment_obligations/);
  });
  it("0148 is additive", () => {
    const sql = readFileSync("supabase/migrations/0148_crew_support_cancellation_review.sql", "utf8").replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\b(drop|truncate|delete\s+from|insert\s+into|update\s+public)\b/i);
    expect(sql).toMatch(/cancellation_review_status text not null default 'not_required'/);
  });
});

describe("5. crew offers: only the crew member can accept or decline, never an administrator", () => {
  it("offer lifecycle gates", () => {
    expect(canSendOffer({ slotStatus: "unfilled", requestStatus: "availability_review" }).ok).toBe(true);
    expect(canSendOffer({ slotStatus: "declined", requestStatus: "quoted" }).ok).toBe(true);
    expect(canSendOffer({ slotStatus: "proposed", requestStatus: "availability_review" }).ok).toBe(false);
    expect(canSendOffer({ slotStatus: "assigned", requestStatus: "availability_review" }).ok).toBe(false);
    expect(canSendOffer({ slotStatus: "unfilled", requestStatus: "confirmed" }).ok).toBe(false);
    expect(canSendOffer({ slotStatus: "unfilled", requestStatus: "cancelled" }).ok).toBe(false);
  });
  it("only the offered person can respond, only while the offer is open", () => {
    const base = { userId: "u1", assigneeProfileId: "u1", slotStatus: "proposed", requestStatus: "quoted" };
    expect(canRespondToOffer(base).ok).toBe(true);
    expect(canRespondToOffer({ ...base, userId: "u2" }).ok).toBe(false); // someone else
    expect(canRespondToOffer({ ...base, assigneeProfileId: null }).ok).toBe(false);
    expect(canRespondToOffer({ ...base, slotStatus: "assigned" }).ok).toBe(false); // already accepted
    expect(canRespondToOffer({ ...base, slotStatus: "unfilled" }).ok).toBe(false); // withdrawn
    expect(canRespondToOffer({ ...base, requestStatus: "cancelled" }).ok).toBe(false);
    expect(canRespondToOffer({ ...base, requestStatus: "confirmed" }).ok).toBe(false);
  });
  it("offer input needs a positive amount and a currency", () => {
    expect(validateOfferInput({ amount: 0, currency: "GHS", message: "" }).ok).toBe(false);
    expect(validateOfferInput({ amount: 100, currency: "", message: "" }).ok).toBe(false);
    expect(validateOfferInput({ amount: 100, currency: "GHS", message: "x".repeat(501) }).ok).toBe(false);
    expect(validateOfferInput({ amount: 100, currency: "GHS", message: "Bring a second body" }).ok).toBe(true);
  });
  it("identity comes from the session, not the form; there is no admin path that accepts or declines for someone", () => {
    const portal = readFileSync("src/app/portal/(dashboard)/crew-offers/actions.ts", "utf8");
    expect(portal).toContain("userId: user.id");
    expect(portal).not.toMatch(/formData\.get\("(userId|profileId|assignee)/);
    for (const f of ["src/app/admin/crew-support/crewOfferActions.ts", "src/app/admin/crew-support/commitmentActions.ts", "src/app/admin/crew-support/actions.ts", "src/lib/crewSupport/admin.ts", "src/lib/crewSupport/commitmentEstablish.ts", "src/lib/crewSupport/commitment.ts"]) {
      const code = readFileSync(f, "utf8");
      expect(code).not.toMatch(/crew_accepted_at:\s*new Date|status:\s*"assigned"|crew_accepted_via:\s*"staff_recorded"/);
    }
    const offers = readFileSync("src/lib/crewSupport/crewOffers.ts", "utf8");
    const accept = offers.slice(offers.indexOf("export async function respondToCrewOffer"));
    expect(accept).toContain('crew_accepted_via: "portal"');
    expect((offers.match(/status: "assigned"/g) ?? []).length).toBe(1); // the single place a slot becomes Assigned
  });
  it("acceptance creates the engagement (pay agreed) quietly; a decline creates nothing; no payable at acceptance", () => {
    const offers = readFileSync("src/lib/crewSupport/crewOffers.ts", "utf8");
    expect(offers).toContain("suppressNotification: true");
    const decline = offers.slice(offers.indexOf('if (params.response === "decline")'), offers.indexOf("// Accept: the person must still be free"));
    expect(decline).not.toMatch(/createEngagement/);
    expect(offers).not.toContain("createEngagementPayable");
  });
  it("the offer email is thin: role and date plus a sign-in link — no pay, venue, client or project details", () => {
    const m = buildCrewEmail("crew_offer", { slotId: "s1", reference: "CSR-2026-000009", role: "Photographer", date: "2026-10-15" });
    expect(`${m.subject} ${m.text} ${m.html}`).toContain("/portal/crew-offers/s1");
    expect(m.text).not.toMatch(/\b(USD|GHS|QAR)\b|\$\d|\d+\.\d{2}|venue/i); // no amounts, no venue
    expect(m.text).toMatch(/Nothing is confirmed until you accept/);
  });
  it("crew emails use the same idempotent, test-suppressed pipeline", () => {
    const n = readFileSync("src/lib/crewSupport/crewNotifications.ts", "utf8");
    expect(n).toContain("runNotification(params.isTest");
    expect(n).toContain('error?.code === "23505"');
    const offers = readFileSync("src/lib/crewSupport/crewOffers.ts", "utf8");
    expect(offers).toContain("eventKey: `crew_offer:${params.slotId}:${now}`");
  });
  it("0149 only adds nullable columns", () => {
    const sql = readFileSync("supabase/migrations/0149_crew_support_assignment_offers.sql", "utf8").replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\b(drop|truncate|delete\s+from|insert\s+into|update\s+public|create\s+table)\b/i);
  });
});

describe("6. crew see only their assignment — never the client's workspace or money", () => {
  const slot = { id: "s1", status: "proposed", offer_amount: 300, offer_currency: "GHS", offer_message: "Bring a spare body", offered_at: "2026-10-08T10:00:00Z", crew_response_at: null, crew_response_note: null, crew_instructions: "Meet at the east gate at 09:30" };
  const request = { reference_number: "CSR-2026-000009", project_name: "Bright wedding", project_type: "Wedding", service_family: "photography", start_date: "2026-10-15", end_date: "2026-10-15", call_time: "10:00", finish_time: "18:00", location: "Doha", urgency: "standard", on_site_contact: "Ama 0555", status: "quoted", requester_name: "SECRET NAME", requester_email: "secret@client.com", requester_phone: "SECRET PHONE", budget_note: "SECRET BUDGET", amount_due: 1000 };
  const args = { request: request as never, role: "Photographer", responsibilities: "Ceremony", serviceLabel: "Creative Crew Support — Photography", equipment: "I will supply equipment", engagementId: "e1" };
  it("an unaccepted offer shows the job and the person's own pay, but no instructions, on-site contact or engagement link", () => {
    const v = toCrewJobView({ ...args, slot: slot as never });
    expect(v).toMatchObject({ state: "offered", role: "Photographer", location: "Doha", offer: { amount: 300, currency: "GHS" }, instructions: null, onSiteContact: null, engagementId: null });
  });
  it("after acceptance they also see staff instructions, the on-site contact and their engagement", () => {
    const v = toCrewJobView({ ...args, slot: { ...slot, status: "assigned" } as never });
    expect(v).toMatchObject({ state: "accepted", instructions: "Meet at the east gate at 09:30", onSiteContact: "Ama 0555", engagementId: "e1" });
  });
  it("the projection never contains the client's identity, contact, budget, quotation or amount due", () => {
    const json = JSON.stringify(toCrewJobView({ ...args, slot: { ...slot, status: "assigned" } as never }));
    expect(json).not.toMatch(/SECRET|secret@|requester|budget|amount_due|1000|quotation/i);
  });
  it("the crew pages read only through that projection with an explicit ownership check, and use no client-workspace routes", () => {
    const offers = readFileSync("src/lib/crewSupport/crewOffers.ts", "utf8");
    expect(offers).toContain("ctx.slot.assignee_profile_id !== userId");
    for (const f of ["src/app/portal/(dashboard)/crew-offers/page.tsx", "src/app/portal/(dashboard)/crew-offers/[slotId]/page.tsx", "src/components/portal/CrewJobDetails.tsx"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).not.toMatch(/portal\/client\/projects|payments|quotation|amount_due/i);
    }
  });
  it("an engagement page shows assignment details only for the engagement's own payee", () => {
    const offers = readFileSync("src/lib/crewSupport/crewOffers.ts", "utf8");
    expect(offers).toContain("e.payee_profile_id !== userId");
  });
});

describe("7. Production Operations and deliverables reuse the existing modules", () => {
  it("the Production board shows Crew Support jobs with the real dates, place and accepted crew", () => {
    const live = readFileSync("src/lib/production/liveOperations.ts", "utf8");
    expect(live).toContain("crew_support_requests");
    expect(live).toContain("crewSupport:");
    expect(readFileSync("src/app/admin/production/page.tsx", "utf8")).toContain("job.crewSupport");
  });
  it("the request page links each crew engagement to the existing payee/engagement admin and the existing media approval, and reads deliverables from the existing module", () => {
    const panel = readFileSync("src/app/admin/crew-support/ProductionPanel.tsx", "utf8");
    expect(panel).toContain("/admin/payables/payees/");
    expect(panel).toContain("/media");
    expect(readFileSync("src/app/admin/crew-support/[id]/page.tsx", "utf8")).toContain('getDeliverablesForEntity("enquiry"');
  });
});

describe("8. required information (equipment) persists from submission to quotation", () => {
  const base = { requesterType: "photographer", fullName: "Ama Mensah", email: "ama@example.com", phone: "+233241234567", serviceFamily: "photography", projectName: "Wedding", startDate: "2099-10-10", endDate: "2099-10-10", location: "Accra", requirements: [{ titleId: "11111111-1111-4111-8111-111111111111", quantity: 1 }], consent: true };
  it("a photography/videography request without the equipment answer is rejected with a field error", () => {
    const r = crewSupportSchema.safeParse({ ...base, serviceDetails: {} });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join(".") === "serviceDetails.equipment")).toBe(true);
    expect(crewSupportSchema.safeParse({ ...base, serviceDetails: { equipment: "requester_supplies" } }).success).toBe(true);
    expect(crewSupportSchema.safeParse({ ...base, serviceFamily: "graphic-design", serviceDetails: {} }).success).toBe(true); // not asked for that family
  });
  it("the answer survives into the quotation snapshot, and a legacy request without it blocks issuing until set", () => {
    const req = { reference_number: "R", project_name: "P", service_family: "photography", start_date: "2026-10-15", end_date: "2026-10-15", location: "Doha", urgency: "standard", service_details: { equipment: "crew_brings" } };
    const roles = [{ role_label: "Photographer", quantity: 1 }];
    expect(buildProjectSnapshot(req, roles, "x").equipment).toBe("Ordift crew brings their own");
    const legacy = buildProjectSnapshot({ ...req, service_details: {} }, roles, "x");
    expect(snapshotGap(legacy)).toMatch(/equipment responsibility/);
    expect(snapshotGap(buildProjectSnapshot(req, roles, "x"))).toBeNull();
  });
  it("the form marks it required and shows the server's field error", () => {
    const form = readFileSync("src/app/crew-support/CrewSupportForm.tsx", "utf8");
    expect(form).toContain("required={q.required}");
    expect(form).toContain("errors[`serviceDetails.${q.id}`]");
  });
  it("an administrator can set it on a legacy request, audited, and not after a quotation was issued", () => {
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    const fn = admin.slice(admin.indexOf("export async function setRequestEquipment"));
    expect(fn).toContain('"crew_support.equipment_set"');
    expect(fn).toContain('in("status", ["sent", "accepted"])');
  });
});

describe("9. payments / receivables: verified against the existing module with fakes — no real transaction", () => {
  it("a deposit is bounded by what's still owed; full/balance are computed server-side", () => {
    expect(resolveAmountToCharge("deposit", 1000, 0, 300)).toBe(300);
    expect(resolveAmountToCharge("deposit", 1000, 700, 400)).toBeNull(); // more than the 300 left
    expect(resolveAmountToCharge("deposit", 1000, 0, undefined)).toBeNull();
    expect(resolveAmountToCharge("balance", 1000, 300, 5)).toBe(700); // client-supplied amount ignored
    expect(resolveAmountToCharge("full", 1000, 1000, undefined)).toBeNull(); // nothing owed
  });
  it("amount_paid is the sum of COMPLETED payments in USD reference terms minus refunds; Paid only when it reaches amount_due", async () => {
    state.tables = {
      enquiries: [{ id: "enq1", amount_due: 1000, payment_status: "Pending", commercial_intent: "creative_crew_support" }],
      payments: [
        { entity_type: "enquiry", entity_id: "enq1", status: "completed", payment_type: "deposit", reference_amount_usd: 300 },
        { entity_type: "enquiry", entity_id: "enq1", status: "completed", payment_type: "balance", reference_amount_usd: 700 },
        { entity_type: "enquiry", entity_id: "enq1", status: "completed", payment_type: "refund", reference_amount_usd: 100 },
        { entity_type: "enquiry", entity_id: "enq1", status: "pending", payment_type: "full", reference_amount_usd: 999 }, // not completed — ignored
      ].map((p) => p),
    };
    await syncEntityPaymentStatus("enquiry", "enq1");
    const upd = state.updates.find((u) => u.table === "enquiries");
    expect(upd?.payload).toMatchObject({ amount_paid: 900, payment_status: "Pending" });
  });
  it("a deposit alone leaves the enquiry Pending and — for Crew Support — never flips it to Booked or emails 'Booking Confirmed'", async () => {
    state.tables = {
      enquiries: [{ id: "enq1", amount_due: 1000, payment_status: "Pending", commercial_intent: "creative_crew_support" }],
      payments: [{ entity_type: "enquiry", entity_id: "enq1", status: "completed", payment_type: "full", reference_amount_usd: 1000 }],
    };
    await syncEntityPaymentStatus("enquiry", "enq1");
    expect(state.updates.some((u) => u.table === "enquiries" && "crm_stage" in u.payload)).toBe(false); // no stage written
    const { sendBookingConfirmedEmail } = await import("@/lib/enquiry/lifecycleEmails");
    expect(sendBookingConfirmedEmail).not.toHaveBeenCalled();
  });
  it("manual transfers use the same recompute path, so verified manual payments count toward the deposit", () => {
    const actions = readFileSync("src/app/admin/payments/actions.ts", "utf8");
    expect(actions).toContain("syncEntityAfterBankTransferDecision");
    expect(actions).toMatch(/advanceStageOnFullPayment/);
  });
});

describe("10. QA isolation", () => {
  it("test records are suppressed in every outbound path the commitment layer adds", () => {
    expect(readFileSync("src/lib/crewSupport/crewNotifications.ts", "utf8")).toContain("runNotification(params.isTest");
    expect(readFileSync("src/lib/crewSupport/notifications.ts", "utf8")).toContain("runNotification(Boolean(request.is_test)");
    const est = readFileSync("src/lib/crewSupport/commitmentEstablish.ts", "utf8");
    expect(est).toContain("if (snapshot.isTest)");
  });
  it("no code path edits CSR-2026-000001/-000002/-000003 or ORD-QUO-2026-000003 by reference", () => {
    for (const f of ["crewOffers", "commitment", "commitmentEstablish", "quotation", "admin"]) expect(readFileSync(`src/lib/crewSupport/${f}.ts`, "utf8")).not.toMatch(/CSR-2026-00000[123]|ORD-QUO-2026-000003/);
    const migrations = readdirSync("supabase/migrations").filter((f) => /^01(44|45|46|47|48|49)_/.test(f));
    expect(migrations.length).toBe(6);
    for (const f of migrations) expect(readFileSync(`supabase/migrations/${f}`, "utf8")).not.toMatch(/CSR-2026-0000|ORD-QUO-2026-0000|update\s+public\./i);
  });
});
