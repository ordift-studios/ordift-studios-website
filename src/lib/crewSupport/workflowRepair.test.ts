import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildProjectSnapshot, snapshotGap, snapshotScheduleText, isProjectSnapshot } from "./quotationSnapshot";
import { canMarkReady, toClientQuotationView, validateAndResolveLines, type EditableLine } from "./quotationRules";
import { completionBlockers, validateOverrideReason, type SlotCommitment } from "./commitmentRules";
import { allowedStatusTransitions, CREW_SUPPORT_STATUSES, STATUS_LABELS } from "./config";
import { NO_QUOTATION, validateSlotChange, validateStatusChange } from "./rules";
import { ENQUIRY_STAGE_SYNC } from "./enquirySync";
import { buildClientEmail, STATUS_NOTIFICATIONS } from "./notificationConfig";
import { approvedBookingTermsReference } from "./standardTerms";

const request = { reference_number: "CSR-2026-000003", project_name: "Bright wedding", project_type: "Wedding", service_family: "photography", start_date: "2026-10-15", end_date: "2026-10-15", call_time: "10:00", finish_time: "18:00", location: "Doha", on_site_contact: "Ama", urgency: "standard", budget_note: "SECRET BUDGET", requester_notes: "SECRET NOTE", service_details: { equipment: "requester_supplies" } };
const reqs = [{ role_label: "Photographer", custom_role: null, quantity: 1, responsibilities: "Ceremony and portraits" }];
const terms = "50% deposit on acceptance, balance on the day. Cancellation within 48 hours incurs a 50% fee.";
const ready = { status: "draft", total: 1000, lineCount: 1, validUntil: "2026-10-22", today: "2026-10-08", terms, eventGap: null };
const line = (over: Partial<EditableLine> = {}): EditableLine => ({ requirementId: "r", serviceItem: "Photographer", description: "1 × Photographer, 1 day", quantity: 1, unitBasis: "full_day", sellingRate: 1000, discountPercent: null, taxPercent: null, governedUnitPrice: null, adjustmentReason: "", sourceReference: null, ...over });

describe("quotation event details are populated from the request and frozen", () => {
  const snap = buildProjectSnapshot(request, reqs, "Creative Crew Support — Photography");
  it("carries date, schedule, location, roles and equipment responsibility, from the request", () => {
    expect(snap).toMatchObject({ projectName: "Bright wedding", location: "Doha", callTime: "10:00", finishTime: "18:00", equipment: "I will supply equipment" });
    expect(snapshotScheduleText(snap)).toBe("2026-10-15, 10:00 → 18:00");
    expect(snap.roles).toEqual([{ role: "Photographer", quantity: 1, responsibilities: "Ceremony and portraits" }]);
  });
  it("never includes the requester's budget/notes or anything internal", () => {
    expect(JSON.stringify(snap)).not.toMatch(/SECRET|budget|margin|cost/i);
  });
  it("an unspecified equipment answer stays unspecified (printed as 'To be confirmed'), never guessed", () => {
    expect(buildProjectSnapshot({ ...request, service_details: {} }, reqs, "x").equipment).toBeNull();
  });
  it("incomplete event information blocks issuing", () => {
    expect(snapshotGap(snap)).toBeNull();
    expect(snapshotGap({ ...snap, location: " " })).toMatch(/location/);
    expect(snapshotGap({ ...snap, roles: [] })).toMatch(/roles/);
    expect(canMarkReady({ ...ready, eventGap: "the event location is missing" }).ok).toBe(false);
  });
  it("the snapshot is frozen at issue and the printable/portal views render it", () => {
    const q = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    expect(q).toContain("project_snapshot: projectSnapshot");
    expect(readFileSync("src/app/admin/pricing/quotations/[id]/pdf/page.tsx", "utf8")).toContain("crew.project");
    expect(readFileSync("src/app/portal/(dashboard)/client/projects/[kind]/[id]/quotation/page.tsx", "utf8")).toContain("q.project");
    expect(readFileSync("supabase/migrations/0146_crew_support_lifecycle_and_quotation_snapshot.sql", "utf8")).toMatch(/add column project_snapshot jsonb/);
  });
  it("the client view exposes the snapshot only through the whitelist projection", () => {
    const view = toClientQuotationView({ quotation_reference: "ORD-QUO-1", status: "sent", currency: "USD", subtotal: 1, discount_total: 0, tax_total: 0, total: 1, valid_until: "2026-10-22", payment_booking_terms: terms, issued_at: "x", accepted_at: null, usd_total: 1, fx_currency: null, fx_rate_to_usd: null, fx_locked_at: null, project_snapshot: snap, commercial_notes: "INTERNAL", crew_cost: 5 } as never, []);
    expect(view.project).toEqual(snap);
    expect(JSON.stringify(view)).not.toMatch(/INTERNAL|crew_cost|commercial_notes/);
    expect(isProjectSnapshot({ nope: 1 })).toBe(false);
  });
});

describe("a quotation cannot be issued without terms", () => {
  it("terms, event info and validity are all required", () => {
    expect(canMarkReady(ready).ok).toBe(true);
    expect(canMarkReady({ ...ready, terms: null }).ok).toBe(false);
    expect(canMarkReady({ ...ready, terms: "   " }).ok).toBe(false);
    expect(canMarkReady({ ...ready, validUntil: null }).ok).toBe(false);
  });
  it("the approved Booking Terms are offered as an explicit reference only — taken from the approved registry document, never restated", () => {
    const ref = approvedBookingTermsReference();
    expect(ref).toMatch(/OS-LGL-004/);
    expect(ref).toMatch(/version 1\.0/);
    expect(ref).toMatch(/\/legal\/booking/);
    expect(ref!.length).toBeLessThan(400);
    const editor = readFileSync("src/app/admin/crew-support/CrewQuotationEditor.tsx", "utf8");
    expect(editor).toContain("termsReference");
    expect(editor).toMatch(/onClick=\{\(\) => setTermsText/); // inserted only by an explicit click
  });
});

describe("manual pricing is intentional and attributable", () => {
  it("a priced line with no governed rate needs a recorded justification; the justification is kept", () => {
    expect(validateAndResolveLines([line()]).ok).toBe(false);
    const r = validateAndResolveLines([line({ adjustmentReason: "Agreed by phone with the client" })]);
    expect(r.ok && r.lines[0]).toMatchObject({ sourceType: "manual", noGovernedRate: true, adjustmentReason: "Agreed by phone with the client" });
  });
  it("a zero-priced note line needs none; a governed rate is untouched", () => {
    expect(validateAndResolveLines([line({ sellingRate: 0 })]).ok).toBe(true);
    expect(validateAndResolveLines([line({ governedUnitPrice: 1000 })]).ok).toBe(true);
  });
});

describe("the agreement control validates before it asks for confirmation", () => {
  it("ConfirmSubmitButton checks form validity first and skips the dialog when invalid", () => {
    const src = readFileSync("src/components/admin/ConfirmSubmitButton.tsx", "utf8");
    expect(src.indexOf("checkValidity()")).toBeGreaterThan(-1);
    expect(src.indexOf("checkValidity()")).toBeLessThan(src.indexOf("window.confirm"));
    expect(src).toContain("reportValidity()");
  });
  it("the reason field is required with a minimum length, and the server still enforces it", () => {
    const panel = readFileSync("src/app/admin/crew-support/CommitmentPanel.tsx", "utf8");
    expect(panel).toMatch(/name="reason" required minLength=\{5\}/);
    expect(readFileSync("src/lib/crewSupport/commitment.ts", "utf8")).toContain("validateAgreementRequirementChange");
  });
});

describe("authorised assignment override needs a justification", () => {
  it("rejects an empty or token justification", () => {
    expect(validateOverrideReason("").ok).toBe(false);
    expect(validateOverrideReason("ok").ok).toBe(false);
    expect(validateOverrideReason("Founder shoots this personally; capability to be added").ok).toBe(true);
  });
  it("is recorded on the slot with actor and time, limited to genuine workforce identities, and audited", () => {
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    expect(admin).toContain("assignment_override_reason: override");
    expect(admin).toContain("isWorkforceProfile(assignee)");
    expect(admin).toContain("overrideReason: override");
    const pool = readFileSync("src/lib/crewSupport/candidates.ts", "utf8");
    expect(pool).toContain('from("staff_details")');
    expect(pool.replace(/\/\/.*$/gm, "")).not.toMatch(/attendance_records/);
    expect(readFileSync("supabase/migrations/0146_crew_support_lifecycle_and_quotation_snapshot.sql", "utf8")).toMatch(/crew_support_slots_override_check/);
  });
});

describe("lifecycle continues past Confirmed", () => {
  it("Confirmed → In production → Completed, with cancel allowed until completion", () => {
    expect(allowedStatusTransitions("confirmed")).toEqual(["in_production", "cancelled"]);
    expect(allowedStatusTransitions("in_production")).toEqual(["completed", "cancelled"]);
    expect(allowedStatusTransitions("completed")).toEqual([]);
    for (const s of CREW_SUPPORT_STATUSES) expect(STATUS_LABELS[s]).toBeTruthy();
  });
  it("Completed requires every crew engagement to be finished; test records have no engagements to wait for", () => {
    const slot = (status: string | null): SlotCommitment => ({ slotId: "s", label: "Photographer 1 — Kelvin", status: "assigned", assigneeProfileId: "p", crewAccepted: true, engagement: status ? { id: "e", agreedAmount: 300, currency: "GHS", status } : null, firmConflicts: [] });
    expect(completionBlockers({ slots: [slot("engagement_active")], isTest: false })[0]).toMatch(/engagement active/);
    expect(completionBlockers({ slots: [slot("completed")], isTest: false })).toEqual([]);
    expect(completionBlockers({ slots: [slot(null)], isTest: false })[0]).toMatch(/no engagement/);
    expect(completionBlockers({ slots: [slot("engagement_active")], isTest: true })).toEqual([]);
    expect(validateStatusChange("in_production", "completed", [], { ...NO_QUOTATION, completionBlockers: ["x"] }).ok).toBe(false);
    expect(validateStatusChange("in_production", "completed", [], NO_QUOTATION).ok).toBe(true);
  });
  it("crew can't be edited once confirmed or in production", () => {
    for (const s of ["confirmed", "in_production", "completed"]) expect(validateSlotChange({ requestStatus: s as never, status: "released", assigneeProfileId: null }).ok).toBe(false);
  });
  it("CRM follows: in production → In progress, completed → Completed, cancelled also closes a booked enquiry — never backwards", () => {
    expect(ENQUIRY_STAGE_SYNC.in_production).toEqual({ to: "in_progress", from: ["booked"] });
    expect(ENQUIRY_STAGE_SYNC.completed.to).toBe("completed");
    expect(ENQUIRY_STAGE_SYNC.completed.from).not.toContain("completed");
    expect(ENQUIRY_STAGE_SYNC.cancelled.from).toContain("booked");
    expect(ENQUIRY_STAGE_SYNC.cancelled.from).toContain("in_progress");
  });
  it("0146 widens the status check without removing any existing status", () => {
    const sql = readFileSync("supabase/migrations/0146_crew_support_lifecycle_and_quotation_snapshot.sql", "utf8").replace(/--.*$/gm, "");
    for (const s of ["received", "under_review", "availability_review", "quote_preparation", "quoted", "agreement_pending", "payment_pending", "confirmed", "declined", "cancelled", "in_production", "completed"]) expect(sql).toContain(`'${s}'`);
    expect(sql).not.toMatch(/\b(truncate|delete\s+from|insert\s+into|update\s+public)\b/i);
  });
});

describe("quotation versions are preserved, never silently edited", () => {
  const src = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
  const revise = src.slice(src.indexOf("export async function reviseCrewSupportQuotation"), src.indexOf("export async function returnQuotationToDraft"));
  it("revision supersedes the issued row, inserts a new draft with version + 1 and supersedes_id, and restores the issued one if anything fails", () => {
    expect(revise).toContain('status: "superseded"');
    expect(revise).toContain("version: Number(original.version) + 1, supersedes_id: quote.id");
    expect(revise).toContain('status: "sent", updated_at');
    expect(revise).toContain("quote.status === \"accepted\"");
  });
  it("an issued quotation can't be pulled back by hand, only revised", () => {
    expect(validateStatusChange("quoted", "quote_preparation", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true }).ok).toBe(false);
    expect(validateStatusChange("quoted", "quote_preparation", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: false }).ok).toBe(true);
  });
});

describe("cancel/decline unwinds safely and never touches the receivable", () => {
  const src = readFileSync("src/lib/crewSupport/commitmentEstablish.ts", "utf8");
  const unwind = src.slice(src.indexOf("export async function unwindCommitments"));
  it("cancels only payable-free engagements, flags the rest for Finance, removes only this request's project access", () => {
    expect(unwind).toContain("a crew payable exists");
    expect(unwind).toContain('status: "cancelled"');
    expect(unwind).toContain('startsWith(`Crew Support ${snapshot.reference}`)');
    expect(unwind).toContain("receivableUntouched: true");
    expect(unwind).not.toMatch(/\.from\("(enquiries|payments|payment_obligations|client_quotations)"\)/);
  });
  it("is wired into the single status writer for cancelled/declined, and test records short-circuit", () => {
    const admin = readFileSync("src/lib/crewSupport/admin.ts", "utf8");
    expect(admin).toContain('params.to === "cancelled" || params.to === "declined"');
    expect(unwind).toContain("if (snapshot.isTest) return");
  });
});

describe("client notifications for the remaining commercial events", () => {
  it("agreement-required and payment-requested are sent once on their status, client-safe, with no booking promise", () => {
    expect(STATUS_NOTIFICATIONS.agreement_pending).toBe("agreement_required");
    expect(STATUS_NOTIFICATIONS.payment_pending).toBe("payment_requested");
    expect(STATUS_NOTIFICATIONS.quote_preparation).toBeUndefined(); // internal edits never email
    expect(STATUS_NOTIFICATIONS.in_production).toBeUndefined();
    const vars = { firstName: "Ama", reference: "CSR-2026-000003", projectName: "Bright wedding", serviceLabel: "Creative Crew Support — Photography", enquiryId: "e1" };
    for (const t of ["agreement_required", "payment_requested"] as const) {
      const m = buildClientEmail(t, vars);
      expect(m.text).toContain("CSR-2026-000003");
      expect(`${m.subject} ${m.text}`).not.toMatch(/margin|payable|crew (pay|cost)|internal/i);
      expect(m.text).toMatch(/not a booking confirmation/);
    }
  });
});
