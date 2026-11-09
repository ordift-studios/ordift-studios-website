// @vitest-environment jsdom
// FORM RESTORATION, PHASE 2: for each of the ten forms converted in this phase, a real (jsdom) submission is driven twice with the server action mocked - once REFUSED, once SUCCESSFUL.
// A refusal must leave everything the person typed in place; a success must keep React's normal reset (where the form is uncontrolled). Passwords are never restored (covered in the hook's own test).
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  propose: vi.fn(), communicate: vi.fn(), createFollowUp: vi.fn(), reschedule: vi.fn(), decide: vi.fn(), complete: vi.fn(),
  setAmount: vi.fn(), tier: vi.fn(), entity: vi.fn(), issue: vi.fn(), accept: vi.fn(), delivery: vi.fn(), status: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn(), workshop: vi.fn(),
}));
vi.mock("@/app/admin/enquiries/[id]/pricingActions", () => ({ proposeDiscountAction: m.propose, communicateDiscountAction: m.communicate, createFollowUpAction: m.createFollowUp, rescheduleFollowUpAction: m.reschedule, decideDiscountAction: m.decide, completeFollowUpAction: m.complete, convertAction: vi.fn() }));
vi.mock("@/app/admin/enquiries/actions", () => ({ setAmountDueAction: m.setAmount, updateStageAction: vi.fn() }));
vi.mock("@/app/admin/pricing/actions", () => ({ createWeddingEventTierRateVersionAction: m.tier }));
vi.mock("@/app/admin/organization/legal-entities/[entityId]/actions", () => ({ chooseContractingEntityAction: m.entity }));
vi.mock("@/app/admin/pricing/quotations/actions", () => ({ issueQuotationAction: m.issue, recordQuotationAcceptanceAction: m.accept, recordQuotationDeliveryAction: m.delivery, updateQuotationStatusAction: m.status }));
vi.mock("@/app/admin/workshops/actions", () => ({ createSessionAction: m.createSession, deleteSessionAction: m.deleteSession }));

import { ProposeDiscountForm, CommunicateDiscountForm, NewFollowUpForm, ManageFollowUp } from "@/app/admin/enquiries/[id]/PricingForms";
import SetAmountDueForm from "@/app/admin/enquiries/[id]/SetAmountDueForm";
import TierRateEditForm from "@/app/admin/pricing/TierRateEditForm";
import ContractingEntityPanel from "@/app/admin/crew-support/ContractingEntityPanel";
import { QuotationStatusActions } from "@/app/admin/pricing/quotations/[id]/QuotationStatusActions";
import WorkshopForm from "@/app/admin/workshops/WorkshopForm";
import { CreateSessionForm } from "@/app/admin/workshops/WorkshopScheduleForms";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); });

const mount = (C: ComponentType<never>, props: object) => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(C as ComponentType<object>, props))); };
// a key "@dt:<name>" means the (unnamed) datetime-local input in the same form as the field <name>; the value "@first" means the first real option of a select
type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const field = (name: string, scope: ParentNode = document): FieldEl => name.startsWith("@dt:") ? field(name.slice(4), scope).form!.querySelector<HTMLInputElement>("input[type=datetime-local]")! : scope.querySelector<FieldEl>(`[name="${name}"]`)!;
const type = (name: string, value: string, scope: ParentNode = document) => {
  const el = field(name, scope); if (value === "@first") value = [...(el as HTMLSelectElement).options].find((o) => o.value && !o.disabled)!.value;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
};
const submitForm = async (anyFieldName: string) => { const form = field(anyFieldName).form!; await act(async () => { form.requestSubmit(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const REFUSED = { ok: false, error: "Refused for the test.", message: "Refused for the test." };
const OK = { ok: true, message: "Saved for the test." };

type Scenario = { name: string; fn: keyof typeof m; component: ComponentType<never>; props: object; fill: Record<string, string>; probe: string; clearsOnSuccess: boolean };
const SCENARIOS: Scenario[] = [
  { name: "Enquiry: propose a discount", fn: "propose", component: ProposeDiscountForm as ComponentType<never>, props: { enquiryId: "e1" }, fill: { value: "12.5", reason: "Repeat client, agreed by phone on 7 Nov" }, probe: "reason", clearsOnSuccess: true },
  { name: "Enquiry: save the discounted price as communicated", fn: "communicate", component: CommunicateDiscountForm as ComponentType<never>, props: { enquiryId: "e1" }, fill: { channel: "WhatsApp message to the client" }, probe: "channel", clearsOnSuccess: true },
  { name: "Enquiry: set a follow-up", fn: "createFollowUp", component: NewFollowUpForm as ComponentType<never>, props: { enquiryId: "e1", people: [{ id: "p1", name: "Kofi" }] }, fill: { nextAction: "Call to confirm the date and location", dueAt: "2026-12-01T10:00" }, probe: "nextAction", clearsOnSuccess: true },
  { name: "Enquiry: reschedule or hand over a follow-up", fn: "reschedule", component: ManageFollowUp as ComponentType<never>, props: { enquiryId: "e1", followUpId: "f1", people: [{ id: "p1", name: "Kofi" }] }, fill: { reason: "Client asked to speak after the weekend", dueAt: "2026-12-03T09:30" }, probe: "reason", clearsOnSuccess: true },
  { name: "Payment: set the amount due", fn: "setAmount", component: SetAmountDueForm as ComponentType<never>, props: { enquiryId: "e1", currentAmountDue: null }, fill: { amountDue: "749.50" }, probe: "amountDue", clearsOnSuccess: false },
  { name: "Admin pricing: new tier rate version", fn: "tier", component: TierRateEditForm as ComponentType<never>, props: { marketSlug: "qa", category: "wedding", serviceMode: "full", tierSlug: "gold", currentPriceUsd: undefined }, fill: { priceUsd: "1250.00" }, probe: "priceUsd", clearsOnSuccess: true },
  { name: "Admin: choose the contracting entity", fn: "entity", component: ContractingEntityPanel as ComponentType<never>, props: { requestId: "r1", current: null, options: [{ entityId: "ent1", name: "Entity One", eligible: true, blockers: [] }], suggestionId: null, historical: false }, fill: { entityId: "ent1", basis: "Licensed for the quoted activity in Qatar" }, probe: "basis", clearsOnSuccess: true },
  { name: "Quotation: record delivery to the client", fn: "delivery", component: QuotationStatusActions as ComponentType<never>, props: { quotationId: "q1", status: "sent", defaultValidUntil: "2026-12-10", currentValidUntil: "2026-12-10", isSuperAdmin: false, blockers: [], expired: false, today: "2026-11-10", deliveredText: null, documentFingerprint: null, documentHref: null, availability: null }, fill: { channel: "@first", "@dt:recipient": "2026-11-09T10:00", recipient: "client@example.test", evidence: "Sent by WhatsApp on 9 Nov, screenshot saved in the project folder" }, probe: "evidence", clearsOnSuccess: true },
  { name: "Admin: create or edit a workshop", fn: "workshop", component: WorkshopForm as ComponentType<never>, props: { action: m.workshop, workshop: null, internalNotes: undefined, venues: [], submitLabel: "Create", processingLabel: "Creating…" }, fill: { title: "Studio Lighting Masterclass", shortDescription: "A hands-on introduction to lighting for portraits.", description: "Three hours covering key light, fill and background separation with live models." }, probe: "description", clearsOnSuccess: true },
  { name: "Admin: add a workshop session", fn: "createSession", component: CreateSessionForm as ComponentType<never>, props: { workshopId: "w1", people: [] }, fill: { sessionDate: "2027-01-15", startTime: "10:00", title: "Lighting Principles" }, probe: "title", clearsOnSuccess: true },
];

describe("Phase 2: ten operational forms keep what the person typed when the server refuses, and reset normally on success", () => {
  for (const s of SCENARIOS) {
    it(`${s.name}: REFUSED keeps every typed value`, async () => {
      m[s.fn].mockResolvedValue(REFUSED); mount(s.component, s.props);
      for (const [k, v] of Object.entries(s.fill)) type(k, v);
      await submitForm(s.probe);
      expect(m[s.fn]).toHaveBeenCalledTimes(1);
      for (const [k, v] of Object.entries(s.fill)) { if (v === "@first") expect(field(k).value, `${s.name}: ${k}`).not.toBe(""); else expect(field(k).value, `${s.name}: ${k}`).toBe(v); }
    });
    it(`${s.name}: SUCCESS is accepted${s.clearsOnSuccess ? " and the fields reset as before" : ""}`, async () => {
      m[s.fn].mockResolvedValue(OK); mount(s.component, s.props);
      for (const [k, v] of Object.entries(s.fill)) type(k, v);
      await submitForm(s.probe);
      expect(m[s.fn]).toHaveBeenCalledTimes(1);
      if (s.clearsOnSuccess) expect(field(s.probe).value, `${s.name}: reset after success`).toBe((field(s.probe) as HTMLInputElement).defaultValue ?? "");
    });
  }
  it("the server action receives exactly what was typed (the restore never alters the submission)", async () => {
    m.propose.mockResolvedValue(REFUSED); mount(ProposeDiscountForm as ComponentType<never>, { enquiryId: "e1" });
    type("value", "12.5"); type("reason", "Repeat client, agreed by phone on 7 Nov"); await submitForm("reason");
    const fd = m.propose.mock.calls[0][1] as FormData; expect(fd.get("value")).toBe("12.5"); expect(fd.get("reason")).toBe("Repeat client, agreed by phone on 7 Nov"); expect(fd.get("enquiryId")).toBe("e1");
  });
});
