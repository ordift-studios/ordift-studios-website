import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inclusiveDays, proposeQuoteLines, type GovernedRate } from "./quotePricing";
import { canMarkReady, toClientQuotationView, validateAcceptance, validateAndResolveLines, validateStaffAcceptance, type EditableLine } from "./quotationRules";
import { NO_QUOTATION, validateStatusChange } from "./rules";
import { ENQUIRY_STAGE_SYNC } from "./enquirySync";
import { buildClientEmail, isClientFacingTemplate, STATUS_NOTIFICATIONS, type ClientTemplateVars } from "./notificationConfig";
import { runNotification, type FlowDeps } from "./notificationFlow";
import { CREW_SUPPORT_STATUSES } from "./config";

const PHOTOGRAPHER = "title-photographer";
const req = (over = {}) => ({ id: "req-1", titleId: PHOTOGRAPHER, roleLabel: "Photographer", quantity: 2, ...over });
const line = (over: Partial<EditableLine> = {}): EditableLine => ({ requirementId: "req-1", serviceItem: "Photographer", description: "2 × Photographer, 1 day", quantity: 2, unitBasis: "full_day", sellingRate: 100, discountPercent: null, taxPercent: null, governedUnitPrice: 100, adjustmentReason: "", sourceReference: "ref", ...over });

describe("quote proposal — governed rates only, nothing invented", () => {
  it("with NO governed rates configured (today's Production state) every line is a manual placeholder priced at zero and marked 'no governed rate'", () => {
    const lines = proposeQuoteLines({ requirements: [req(), req({ id: "r2", titleId: null, roleLabel: "Drone spotter", quantity: 1 })], days: 1, rates: [], marketName: "Qatar / GCC", urgent: true, urgentUpliftPercent: null });
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l.sellingRate).toBe(0);
      expect(l.sourceType).toBe("manual");
      expect(l.noGovernedRate).toBe(true);
      expect(l.governedUnitPrice).toBeNull();
    }
  });

  it("uses a governed full-day rate × people × days, recording the governed price and source", () => {
    const rates: GovernedRate[] = [{ titleId: PHOTOGRAPHER, unitBasis: "full_day", priceUsd: 250 }];
    const [l] = proposeQuoteLines({ requirements: [req()], days: 3, rates, marketName: "Qatar / GCC", urgent: false, urgentUpliftPercent: null });
    expect(l).toMatchObject({ quantity: 6, sellingRate: 250, governedUnitPrice: 250, sourceType: "pricing", noGovernedRate: false });
    expect(l.sourceReference).toContain("Qatar / GCC");
  });

  it("adds an urgent uplift line only when urgent AND a governed modifier exists AND there are governed lines", () => {
    const rates: GovernedRate[] = [{ titleId: PHOTOGRAPHER, unitBasis: "full_day", priceUsd: 200 }];
    const urgent = proposeQuoteLines({ requirements: [req({ quantity: 1 })], days: 1, rates, marketName: "M", urgent: true, urgentUpliftPercent: 25 });
    expect(urgent.at(-1)).toMatchObject({ serviceItem: "Urgent request uplift", sellingRate: 50, sourceType: "pricing" });
    expect(proposeQuoteLines({ requirements: [req({ quantity: 1 })], days: 1, rates, marketName: "M", urgent: true, urgentUpliftPercent: null })).toHaveLength(1);
    expect(proposeQuoteLines({ requirements: [req()], days: 1, rates: [], marketName: "M", urgent: true, urgentUpliftPercent: 25 })).toHaveLength(1);
  });

  it("counts multi-day engagements inclusively", () => {
    expect(inclusiveDays("2026-10-08", "2026-10-18")).toBe(11);
    expect(inclusiveDays("2026-10-15", "2026-10-15")).toBe(1);
  });
});

describe("price-source tracking and overrides", () => {
  it("an unchanged governed price stays 'pricing'; a changed one is 'adjusted' and REQUIRES a reason, retaining the governed price", () => {
    const ok = validateAndResolveLines([line()]);
    expect(ok.ok && ok.lines[0].sourceType).toBe("pricing");
    expect(validateAndResolveLines([line({ sellingRate: 80 })]).ok).toBe(false);
    const adj = validateAndResolveLines([line({ sellingRate: 80, adjustmentReason: "Repeat-client courtesy" })]);
    expect(adj.ok && adj.lines[0]).toMatchObject({ sourceType: "adjusted", governedUnitPrice: 100, adjustmentReason: "Repeat-client courtesy" });
  });

  it("a line with no governed rate is a manual fallback flagged noGovernedRate", () => {
    const r = validateAndResolveLines([line({ governedUnitPrice: null, sellingRate: 400 })]);
    expect(r.ok && r.lines[0]).toMatchObject({ sourceType: "manual", noGovernedRate: true });
  });

  it("client-visible text can't mention internal costs, margins or payables", () => {
    expect(validateAndResolveLines([line({ description: "Crew pay $80, margin 20%" })]).ok).toBe(false);
    expect(validateAndResolveLines([line({ serviceItem: "Contractor cost recovery" })]).ok).toBe(false);
  });

  it("rejects empty quotes, zero quantity, negative prices and bad percentages", () => {
    expect(validateAndResolveLines([]).ok).toBe(false);
    expect(validateAndResolveLines([line({ quantity: 0 })]).ok).toBe(false);
    expect(validateAndResolveLines([line({ sellingRate: -1, governedUnitPrice: null })]).ok).toBe(false);
    expect(validateAndResolveLines([line({ discountPercent: 150 })]).ok).toBe(false);
  });

  it("a quotation can't be marked Ready with a zero total (unpriced manual lines) or when not a draft", () => {
    expect(canMarkReady({ status: "draft", total: 0, lineCount: 2, validUntil: "2026-11-01", today: "2026-10-08" }).ok).toBe(false);
    expect(canMarkReady({ status: "ready", total: 100, lineCount: 1, validUntil: "2026-11-01", today: "2026-10-08" }).ok).toBe(false);
    expect(canMarkReady({ status: "draft", total: 100, lineCount: 1, validUntil: "2026-11-01", today: "2026-10-08" }).ok).toBe(true);
  });
});

describe("status automation — no status manufactures a business event", () => {
  it("Quote preparation needs a linked quotation; Quote issued needs an ISSUED quotation; Agreement/Payment pending need an ACCEPTED one", () => {
    expect(validateStatusChange("availability_review", "quote_preparation", [], NO_QUOTATION).ok).toBe(false);
    expect(validateStatusChange("availability_review", "quote_preparation", [], { ...NO_QUOTATION, hasLiveQuotation: true }).ok).toBe(true);
    expect(validateStatusChange("quote_preparation", "quoted", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: false, hasAcceptedQuotation: false }).ok).toBe(false);
    expect(validateStatusChange("quote_preparation", "quoted", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: false }).ok).toBe(true);
    expect(validateStatusChange("quoted", "agreement_pending", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: false }).ok).toBe(false);
    expect(validateStatusChange("quoted", "agreement_pending", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: true, agreementRequired: true, agreementSatisfied: false }).ok).toBe(true);
    expect(validateStatusChange("agreement_pending", "payment_pending", [], NO_QUOTATION).ok).toBe(false);
  });

  it("quotation acceptance: only an open (sent), unexpired quotation can be accepted; a second acceptance is refused", () => {
    expect(validateAcceptance({ status: "sent", validUntil: null, today: "2026-10-08" }).ok).toBe(true);
    expect(validateAcceptance({ status: "sent", validUntil: "2026-10-01", today: "2026-10-08" }).ok).toBe(false);
    expect(validateAcceptance({ status: "draft", validUntil: null, today: "2026-10-08" }).ok).toBe(false);
    expect(validateAcceptance({ status: "accepted", validUntil: null, today: "2026-10-08" }).ok).toBe(false);
  });
});

describe("staff-recorded acceptance is controlled and auditable", () => {
  const base = { channel: "email", evidence: "Email from client dated 8 Oct: happy to proceed", acceptedByName: "Ama Mensah", receivedAt: "2026-10-08T09:00:00Z", now: new Date("2026-10-08T12:00:00Z"), issuedAt: "2026-10-07T10:00:00Z" };
  it("requires channel, accepting client identity, evidence note and a valid received time", () => {
    expect(validateStaffAcceptance(base).ok).toBe(true);
    expect(validateStaffAcceptance({ ...base, channel: "carrier-pigeon" }).ok).toBe(false);
    expect(validateStaffAcceptance({ ...base, evidence: "ok" }).ok).toBe(false);
    expect(validateStaffAcceptance({ ...base, acceptedByName: "" }).ok).toBe(false);
    expect(validateStaffAcceptance({ ...base, receivedAt: "not a date" }).ok).toBe(false);
  });
  it("can't be dated in the future or before the quotation was issued", () => {
    expect(validateStaffAcceptance({ ...base, receivedAt: "2026-10-09T12:00:00Z" }).ok).toBe(false);
    expect(validateStaffAcceptance({ ...base, receivedAt: "2026-10-01T09:00:00Z" }).ok).toBe(false);
  });
  it("the audit trail distinguishes direct client acceptance from staff-recorded acceptance", () => {
    const src = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    expect(src).toContain("Accepted directly by the client in the portal");
    expect(src).toContain("Acceptance recorded by staff on behalf of the client");
    expect(readFileSync("supabase/migrations/0142_crew_support_quotation_link.sql", "utf8")).toMatch(/client_quotations_staff_acceptance_check/);
  });
});

describe("client view never exposes internal data", () => {
  const row = { quotation_reference: "ORD-QUO-2026-000001", status: "sent", currency: "USD", subtotal: 500, discount_total: 0, tax_total: 0, total: 500, valid_until: "2026-11-01", payment_booking_terms: "50% deposit", issued_at: "2026-10-07T10:00:00Z", accepted_at: null, usd_total: 500, fx_currency: "QAR", fx_rate_to_usd: 3.64, fx_locked_at: "2026-10-07T10:00:00Z" };
  const items = [{ service_item: "Photographer", description: "1 × Photographer, 1 day", quantity: 1, unit_basis: "full_day", selling_rate: 500, discount_percent: null, tax_percent: null, line_total: 500 }];

  it("the projection contains only whitelisted client-safe fields (even if the database row carried internal columns)", () => {
    const poisoned = { ...row, commercial_notes: "internal", crew_cost: 200, margin: 300, created_by: "staff" } as never;
    const poisonedItems = [{ ...items[0], governed_unit_price: 400, adjustment_reason: "secret", no_governed_rate: true, source_reference: "internal", crew_pay: 100 }] as never;
    const view = JSON.stringify(toClientQuotationView(poisoned, poisonedItems));
    for (const forbidden of ["internal", "crew_cost", "margin", "secret", "governed", "adjustment", "crew_pay", "created_by", "source"]) expect(view.toLowerCase()).not.toContain(forbidden);
  });

  it("derives the local-currency equivalent from the SNAPSHOT rate, so it can't move with later FX changes", () => {
    const view = toClientQuotationView(row, items);
    expect(view.localEquivalent).toMatchObject({ currency: "QAR", amount: 1820, rate: 3.64 });
  });

  it("the portal page reads only the whitelist projection and imports no admin/cost module", () => {
    const page = readFileSync("src/app/portal/(dashboard)/client/projects/[kind]/[id]/quotation/page.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(page).toMatch(/getClientQuotationViewForEnquiry/);
    expect(page).not.toMatch(/crewSupport\/admin|engagements|payables|governed|adjustment|commercial_notes/);
    const lib = readFileSync("src/lib/crewSupport/quotation.ts", "utf8").replace(/\/\/.*$/gm, "");
    expect(lib).not.toMatch(/engagements|payment_obligations|payee/);
  });

  it("the quotation tables never gain a cost/margin column (migrations 0142/0143)", () => {
    for (const f of ["supabase/migrations/0142_crew_support_quotation_link.sql", "supabase/migrations/0143_crew_support_rates_and_notifications.sql"]) {
      const sql = readFileSync(f, "utf8").replace(/--.*$/gm, "");
      expect(sql).not.toMatch(/\b(crew_cost|crew_pay|contractor_cost|vendor_cost|margin|profit)\b/i);
      expect(sql).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/i);
      expect(sql).not.toMatch(/insert into public\.crew_support_rates|insert into public\.crew_support_rate_modifiers/i);
    }
  });
});

describe("enquiry synchronisation is explicit and one-way", () => {
  it("quote issued → Quotation sent; accepted is an explicit no-op; 'booked' is reachable ONLY from the confirmed event", () => {
    expect(ENQUIRY_STAGE_SYNC.quote_issued.to).toBe("quotation_sent");
    expect(ENQUIRY_STAGE_SYNC.quote_accepted.to).toBeNull();
    expect(ENQUIRY_STAGE_SYNC.confirmed.to).toBe("booked");
    for (const [event, rule] of Object.entries(ENQUIRY_STAGE_SYNC)) if (event !== "confirmed") expect(rule.to).not.toBe("booked");
  });
  it("never moves an enquiry backwards or out of a later stage (only from earlier/open stages)", () => {
    expect(ENQUIRY_STAGE_SYNC.quote_issued.from).not.toContain("booked");
    expect(ENQUIRY_STAGE_SYNC.declined.from).not.toContain("booked");
  });
  it("the legacy manual amount-due action refuses Crew Support enquiries but is otherwise unchanged; generic quotation tools refuse crew-managed quotations", () => {
    const actions = readFileSync("src/app/admin/enquiries/actions.ts", "utf8");
    expect(actions).toMatch(/commercial_intent === "creative_crew_support"/);
    expect(actions).toMatch(/PRE_QUOTATION_STAGES/);
    const generic = readFileSync("src/lib/commercial/clientQuotations.ts", "utf8");
    expect(generic.match(/crewManagedRefusal\(/g)?.length).toBeGreaterThanOrEqual(6);
  });
  it("amount_due for Crew Support is written only from the accepted quotation's USD total", () => {
    const src = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    expect(src.match(/amount_due: quote\.usdTotal/g)?.length).toBe(1);
    expect(src).toMatch(/quote\.status !== "accepted"/);
  });
});

describe("client notifications", () => {
  const vars: ClientTemplateVars = { firstName: "Ama", reference: "CSR-2026-000009", projectName: "Mensah wedding", serviceLabel: "Creative Crew Support — Photography", enquiryId: "enq-1", quotationReference: "ORD-QUO-2026-000001", totalText: "USD 500.00", validUntil: "2026-11-01" };

  it("only meaningful client-facing transitions map to a template; internal states (quote preparation, slots, notes) never do", () => {
    expect(Object.keys(STATUS_NOTIFICATIONS).sort()).toEqual(["availability_review", "cancelled", "confirmed", "declined", "under_review"]);
    expect(STATUS_NOTIFICATIONS.quote_preparation).toBeUndefined();
    for (const s of CREW_SUPPORT_STATUSES) if (STATUS_NOTIFICATIONS[s]) expect(isClientFacingTemplate(STATUS_NOTIFICATIONS[s]!)).toBe(true);
  });

  it("every email carries the reference and project, and never leaks cost/margin/internal wording", () => {
    for (const t of ["under_review", "availability_review", "quote_issued", "quote_accepted", "confirmed", "declined", "cancelled"] as const) {
      const mail = buildClientEmail(t, vars);
      const blob = `${mail.subject} ${mail.text} ${mail.html.replace(/<[^>]+>/g, " ")}`;
      expect(blob).toContain("CSR-2026-000009");
      expect(mail.text).toContain("Mensah wedding");
      expect(blob).not.toMatch(/crew (pay|cost)|margin|profit|payable|contractor rate|internal note|capabilit/i);
    }
  });

  it("the quotation email links to the secure portal quotation page; acceptance and status emails never claim a booking or assigned crew", () => {
    expect(buildClientEmail("quote_issued", vars).text).toMatch(/\/portal\/client\/projects\/enquiry\/enq-1\/quotation/);
    for (const t of ["under_review", "availability_review", "quote_issued", "quote_accepted"] as const) {
      const text = buildClientEmail(t, vars).text;
      expect(text).not.toMatch(/booking (is )?confirmed|crew (has|have) been assigned|you are booked/i);
    }
    expect(buildClientEmail("quote_accepted", vars).text).toMatch(/not yet a booking confirmation/);
  });

  function deps(over: Partial<FlowDeps> = {}) {
    const record = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ ok: true, mode: "sent", attempts: 1 });
    const d: FlowDeps = { claim: vi.fn().mockResolvedValue("claimed"), record, send, logTestSuppressed: vi.fn(), ...over };
    return { d, record, send };
  }

  it("is idempotent: a repeated event (refresh, re-save, retry) is recognised as already recorded and never sends again", async () => {
    const { d, send, record } = deps({ claim: vi.fn().mockResolvedValue("duplicate") });
    expect(await runNotification(false, d)).toBe("already_recorded");
    expect(send).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("TEST/QA records are recorded as suppressed and NEVER delivered externally", async () => {
    const { d, send, record } = deps();
    expect(await runNotification(true, d)).toBe("suppressed_test");
    expect(send).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith("suppressed_test", {});
  });

  it("a successful send is recorded; a failed or throwing send is recorded as failed and never thrown (can't corrupt the status change)", async () => {
    const ok = deps();
    expect(await runNotification(false, ok.d)).toBe("sent");
    const bad = deps({ send: vi.fn().mockResolvedValue({ ok: false, error: "smtp down", attempts: 3 }) });
    expect(await runNotification(false, bad.d)).toBe("failed");
    expect(bad.record).toHaveBeenCalledWith("failed", { attempts: 3, error: "smtp down" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = deps({ send: vi.fn().mockRejectedValue(new Error("network")) });
    expect(await runNotification(false, boom.d)).toBe("failed");
    spy.mockRestore();
  });

  it("claim happens before any send, and a claim error sends nothing", async () => {
    const order: string[] = [];
    const { d } = deps({ claim: vi.fn(async () => (order.push("claim"), "claimed" as const)), send: vi.fn(async () => (order.push("send"), { ok: true as const, mode: "sent" as const, attempts: 1 })) });
    await runNotification(false, d);
    expect(order).toEqual(["claim", "send"]);
    const noSend = deps({ claim: vi.fn().mockResolvedValue("error") });
    expect(await runNotification(false, noSend.d)).toBe("skipped");
    expect(noSend.send).not.toHaveBeenCalled();
  });

  it("status changes keep side effects non-fatal: notification/sync run after the committed status inside try/catch", () => {
    const src = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    const commit = src.indexOf("export async function commitCrewSupportStatus");
    const after = src.slice(commit);
    expect(after.indexOf("crew_support.status_changed")).toBeLessThan(after.indexOf("notifyCrewSupportEvent"));
    expect(after).toMatch(/catch \(sideEffectError\)/);
  });
});

describe("RBAC and audit", () => {
  it("every quotation/notification admin action authorizes via canManageCrewSupport before doing anything", () => {
    const src = readFileSync("src/app/admin/crew-support/quotationActions.ts", "utf8");
    expect(src).toMatch(/canManageCrewSupport\(user\)/);
    expect(src.match(/await authorize\(\)/g)?.length).toBeGreaterThanOrEqual(5);
  });
  it("rate editing is gated by the existing pricing-administer capability", () => {
    expect(readFileSync("src/lib/crewSupport/rates.ts", "utf8").match(/FINANCE_CAPABILITIES\.pricingAdminister/g)?.length).toBe(2);
  });
  it("client acceptance verifies ownership server-side and never trusts the posted quotation id alone", () => {
    const action = readFileSync("src/app/portal/(dashboard)/client/projects/[kind]/[id]/quotation/actions.ts", "utf8");
    expect(action).toMatch(/getClientQuotationIdForEnquiry\(enquiryId, user\.id\)/);
    expect(readFileSync("src/lib/crewSupport/quotation.ts", "utf8")).toMatch(/enquiry\.user_id !== params\.userId/);
  });
  it("important quotation actions are audit-logged (prepare, save with overrides, ready, issue, accept, discard)", () => {
    const src = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    for (const action of ["quotation_prepared", "quotation_saved", "quotation_ready", "quotation_issued", "quotation_accepted", "quotation_discarded"]) expect(src).toContain(`crew_support.${action}`);
    expect(src).toMatch(/overrides: adjusted/);
  });
  it("test records stay flagged on their quotations", () => {
    expect(readFileSync("src/lib/crewSupport/quotation.ts", "utf8")).toMatch(/is_test: Boolean\(r\.is_test\)/);
  });
});
