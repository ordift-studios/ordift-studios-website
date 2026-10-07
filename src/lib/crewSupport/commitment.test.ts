import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accessExpiryFor, assessAgreement, clearsCrewAcceptance, COLLABORATOR_ACCESS_GRACE_DAYS, confirmationBlockers, statusAfterCommercialAcceptance, validateAgreementRequirementChange, validateCrewAcceptanceInput, type SlotCommitment } from "./commitmentRules";
import { classifyConflicts, firmConflicts } from "./conflicts";
import { NO_QUOTATION, validateSlotChange, validateStatusChange } from "./rules";
import { allowedStatusTransitions } from "./config";
import { ENQUIRY_STAGE_SYNC } from "./enquirySync";

const terms = "50% deposit on acceptance, balance on delivery. Cancellation within 48 hours incurs a 50% fee.";
const slot = (over: Partial<SlotCommitment> = {}): SlotCommitment => ({ slotId: "s1", label: "Photographer 1 — Kelvin", status: "assigned", assigneeProfileId: "p1", crewAccepted: true, engagement: { id: "e1", agreedAmount: 300, currency: "GHS", status: "draft" }, firmConflicts: [], ...over });
const ok = { hasAcceptedQuotation: true, agreement: assessAgreement({ required: false, reason: null, hasExecutedAgreement: false, quotationTerms: terms }), slots: [slot()], isTest: false };

describe("conditional agreement (accepted quotation + terms, or a real agreement when required)", () => {
  it("standard job: an accepted quotation WITH terms satisfies the contract — no separate agreement", () => {
    expect(assessAgreement({ required: false, reason: null, hasExecutedAgreement: false, quotationTerms: terms })).toEqual({ satisfied: true, basis: "quotation_terms" });
    expect(statusAfterCommercialAcceptance(assessAgreement({ required: false, reason: null, hasExecutedAgreement: false, quotationTerms: terms }))).toBe("payment_pending");
  });
  it("standard job but the quotation has no terms: not satisfied, with a clear reason", () => {
    const a = assessAgreement({ required: false, reason: null, hasExecutedAgreement: false, quotationTerms: "  " });
    expect(a.satisfied).toBe(false);
    expect(statusAfterCommercialAcceptance(a)).toBe("agreement_pending");
  });
  it("agreement required: an accepted quotation + terms is NOT enough; confirmation cannot bypass it", () => {
    const a = assessAgreement({ required: true, reason: "bespoke licensing", hasExecutedAgreement: false, quotationTerms: terms });
    expect(a.satisfied).toBe(false);
    expect(statusAfterCommercialAcceptance(a)).toBe("agreement_pending");
    expect(confirmationBlockers({ ...ok, agreement: a }).join(" ")).toMatch(/separate agreement is required/);
  });
  it("agreement required and fully executed: satisfied", () => {
    expect(assessAgreement({ required: true, reason: "IP", hasExecutedAgreement: true, quotationTerms: null })).toEqual({ satisfied: true, basis: "agreement_executed" });
  });
  it("requiring an agreement needs a reason and can't change once confirmed/closed", () => {
    expect(validateAgreementRequirementChange({ required: true, reason: "", requestStatus: "quoted" }).ok).toBe(false);
    expect(validateAgreementRequirementChange({ required: true, reason: "bespoke IP terms", requestStatus: "quoted" }).ok).toBe(true);
    expect(validateAgreementRequirementChange({ required: false, reason: "", requestStatus: "quoted" }).ok).toBe(true);
    expect(validateAgreementRequirementChange({ required: true, reason: "bespoke IP terms", requestStatus: "confirmed" }).ok).toBe(false);
  });
  it("status guards follow the same facts: payment_pending needs a satisfied basis; agreement_pending only while one is outstanding", () => {
    const accepted = { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: true };
    expect(validateStatusChange("quoted", "payment_pending", [], { ...accepted, agreementSatisfied: true }).ok).toBe(true);
    expect(validateStatusChange("quoted", "payment_pending", [], { ...accepted, agreementRequired: true, agreementSatisfied: false }).ok).toBe(false);
    expect(validateStatusChange("quoted", "agreement_pending", [], { ...accepted, agreementRequired: false, agreementSatisfied: true }).ok).toBe(false);
    expect(validateStatusChange("quoted", "agreement_pending", [], { ...accepted, agreementRequired: true, agreementSatisfied: false }).ok).toBe(true);
    expect(allowedStatusTransitions("quoted")).toContain("payment_pending");
    expect(allowedStatusTransitions("payment_pending")).toContain("agreement_pending");
  });
  it("uses the EXISTING agreements context link and 'fully executed' statuses — no second agreement system", () => {
    const src = readFileSync("src/lib/crewSupport/commitmentData.ts", "utf8");
    expect(src).toContain('.from("agreements")');
    expect(src).toContain('primary_context_type", "crew_support_request"');
    expect(src).toContain('"fully_executed", "active", "completed"');
    expect(readFileSync("supabase/migrations/0145_crew_support_commitments.sql", "utf8")).not.toMatch(/create table/i);
  });
});

describe("crew acceptance is distinct from staff assignment", () => {
  it("an assigned-but-not-accepted slot blocks confirmation", () => {
    const blockers = confirmationBlockers({ ...ok, slots: [slot({ crewAccepted: false })] });
    expect(blockers.join(" ")).toMatch(/hasn't accepted/);
  });
  it("acceptance is cleared when the person or status changes, kept when nothing material changes", () => {
    expect(clearsCrewAcceptance({ previousAssigneeId: "p1", previousStatus: "assigned", nextAssigneeId: "p2", nextStatus: "assigned" })).toBe(true);
    expect(clearsCrewAcceptance({ previousAssigneeId: "p1", previousStatus: "assigned", nextAssigneeId: "p1", nextStatus: "released" })).toBe(true);
    expect(clearsCrewAcceptance({ previousAssigneeId: "p1", previousStatus: "assigned", nextAssigneeId: "p1", nextStatus: "assigned" })).toBe(false);
  });
  it("recording acceptance needs a positive amount, a currency and a note — and the crew currency is independent of the quotation's", () => {
    expect(validateCrewAcceptanceInput({ amount: 0, currency: "GHS", note: "WhatsApp 8 Oct" }).ok).toBe(false);
    expect(validateCrewAcceptanceInput({ amount: 300, currency: "", note: "WhatsApp 8 Oct" }).ok).toBe(false);
    expect(validateCrewAcceptanceInput({ amount: 300, currency: "GHS", note: "ok" }).ok).toBe(false);
    expect(validateCrewAcceptanceInput({ amount: 300, currency: "GHS", note: "Confirmed by WhatsApp on 8 Oct" }).ok).toBe(true);
  });
});

describe("confirmation gate", () => {
  it("passes only with accepted quotation, agreement basis, accepted crew, known compensation, no firm conflict", () => {
    expect(confirmationBlockers(ok)).toEqual([]);
  });
  it("blocks without an accepted quotation", () => {
    expect(confirmationBlockers({ ...ok, hasAcceptedQuotation: false })[0]).toMatch(/accept the quotation/);
  });
  it("blocks when compensation isn't recorded (real records) but not for QA/test records (which never create engagements)", () => {
    const noComp = [slot({ engagement: null })];
    expect(confirmationBlockers({ ...ok, slots: noComp }).join(" ")).toMatch(/compensation/);
    expect(confirmationBlockers({ ...ok, slots: noComp, isTest: true })).toEqual([]);
  });
  it("a cancelled engagement doesn't count as agreed compensation", () => {
    expect(confirmationBlockers({ ...ok, slots: [slot({ engagement: { id: "e", agreedAmount: 300, currency: "GHS", status: "cancelled" } })] }).join(" ")).toMatch(/compensation/);
  });
  it("blocks a firm double-booking and names it", () => {
    expect(confirmationBlockers({ ...ok, slots: [slot({ firmConflicts: ["CSR-2026-000009 (2026-10-15) — confirmed"] })] }).join(" ")).toMatch(/double-booking/);
  });
  it("open (unfilled/proposed) slots still block", () => {
    expect(confirmationBlockers({ ...ok, slots: [slot(), slot({ slotId: "s2", status: "proposed", crewAccepted: false })] }).join(" ")).toMatch(/open crew slot/);
  });
  it("validateStatusChange surfaces the first blocker for confirmed", () => {
    const r = validateStatusChange("payment_pending", "confirmed", [{ status: "assigned", assigneeProfileId: "p1" }], { ...NO_QUOTATION, hasAcceptedQuotation: true, confirmationBlockers: ["Kelvin hasn't accepted"] });
    expect(r.ok).toBe(false);
    expect(validateStatusChange("payment_pending", "confirmed", [{ status: "assigned", assigneeProfileId: "p1" }], { ...NO_QUOTATION, hasAcceptedQuotation: true, agreementSatisfied: true }).ok).toBe(true);
  });
  it("a confirmed request's crew can't be edited (engagements/payables now exist)", () => {
    expect(validateSlotChange({ requestStatus: "confirmed", status: "released", assigneeProfileId: null }).ok).toBe(false);
  });
});

describe("double-booking uses ONE definition of conflict", () => {
  const range = { start: "2026-10-15", end: "2026-10-15" };
  const req = (over = {}) => ({ id: "other", status: "confirmed", start_date: "2026-10-15", end_date: "2026-10-15", reference_number: "CSR-2026-000009", is_test: false, ...over });
  it("a slot on another CONFIRMED request and approved leave are firm; an unconfirmed slot is only a warning", () => {
    const c = classifyConflicts({ slots: [{ assignee_profile_id: "p1", request: req() }, { assignee_profile_id: "p2", request: req({ status: "availability_review" }) }], leave: [{ profile_id: "p3", start_date: "2026-10-14", end_date: "2026-10-16" }], range, excludeRequestId: "mine", currentIsTest: false });
    expect(firmConflicts(c.get("p1") ?? [])).toHaveLength(1);
    expect(c.get("p2")).toHaveLength(1);
    expect(firmConflicts(c.get("p2") ?? [])).toHaveLength(0);
    expect(firmConflicts(c.get("p3") ?? [])).toHaveLength(1);
  });
  it("ignores this request, declined/cancelled requests, non-overlapping dates, and QA records when the current one is real", () => {
    const c = classifyConflicts({
      slots: [
        { assignee_profile_id: "p1", request: req({ id: "mine" }) },
        { assignee_profile_id: "p1", request: req({ status: "declined" }) },
        { assignee_profile_id: "p1", request: req({ start_date: "2026-11-01", end_date: "2026-11-02" }) },
        { assignee_profile_id: "p1", request: req({ is_test: true }) },
      ],
      leave: [], range, excludeRequestId: "mine", currentIsTest: false,
    });
    expect(c.get("p1") ?? []).toHaveLength(0);
  });
  it("Availability Review ranking and the confirmation snapshot both load conflicts through conflicts.ts, never attendance", () => {
    expect(readFileSync("src/lib/crewSupport/candidates.ts", "utf8")).toContain("loadConflicts(");
    expect(readFileSync("src/lib/crewSupport/commitmentData.ts", "utf8")).toContain("loadConflicts(");
    for (const f of ["conflicts", "commitmentData", "commitmentEstablish"]) expect(readFileSync(`src/lib/crewSupport/${f}.ts`, "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/attendance_records/);
  });
});

describe("commitments reuse existing infrastructure and only arise at confirmation", () => {
  const src = readFileSync("src/lib/crewSupport/commitmentEstablish.ts", "utf8");
  it("compensation, engagement and payable go through payables/engagements.ts (no Crew Support payout table)", () => {
    expect(src).toContain("createEngagement(");
    expect(src).toContain("createEngagementPayable(");
    expect(src).toContain("assignUserToProject(");
    expect(src).not.toMatch(/from\("payment_obligations"\)|from\("payable_items"\)|insert\(/);
    expect(src).not.toMatch(/client_quotations|usd_total|selling_rate/); // the client's price is never read here
  });
  it("a payable is created only inside establishCommitments (confirmed), never when recording acceptance", () => {
    const record = src.slice(src.indexOf("export async function recordCrewAcceptance"), src.indexOf("export async function cancelSlotEngagement"));
    expect(record).not.toContain("createEngagementPayable");
    const establish = src.slice(src.indexOf("export async function establishCommitments"));
    expect(establish).toContain('snapshot.status !== "confirmed"');
    expect(establish).toContain("payment_obligation_id");
  });
  it("engagement creation is idempotent by slot (existing-engagement check + DB unique index)", () => {
    expect(src).toContain('.eq("entity_type", SLOT_ENTITY).eq("entity_id", params.slotId).neq("status", "cancelled")');
    expect(readFileSync("supabase/migrations/0145_crew_support_commitments.sql", "utf8")).toMatch(/create unique index engagements_one_live_per_crew_slot[\s\S]*entity_type = 'crew_support_slot'/);
  });
  it("test records create no engagement, assignment, payable or crew email", () => {
    expect(src).toContain("if (!isTest) {");
    expect(src).toContain("if (snapshot.isTest)");
    expect(src.indexOf("commitments_suppressed_test")).toBeLessThan(src.indexOf("createEngagementPayable({"));
  });
  it("project access expires a fixed window after the job's last day", () => {
    expect(COLLABORATOR_ACCESS_GRACE_DAYS).toBe(7);
    expect(accessExpiryFor("2026-10-15")).toBe("2026-10-22T00:00:00.000Z");
  });
  it("confirmation books the enquiry (CRM) and a payment alone never does", () => {
    expect(ENQUIRY_STAGE_SYNC.confirmed.to).toBe("booked");
    const guard = readFileSync("src/lib/payments/crmStageSync.ts", "utf8");
    expect(guard).toContain('intent?.commercial_intent === "creative_crew_support"');
    expect(guard.indexOf('creative_crew_support')).toBeLessThan(guard.indexOf('.update({ crm_stage: "booked" })'));
  });
  it("an Availability Review proposal never creates an engagement or payable (slot saves don't call the finance layer except to CANCEL a draft)", () => {
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    const slotFn = admin.slice(admin.indexOf("export async function setCrewSupportSlot"), admin.indexOf("async function isEligibleAssignee"));
    expect(slotFn).not.toMatch(/createEngagement|createEngagementPayable/);
  });
});
