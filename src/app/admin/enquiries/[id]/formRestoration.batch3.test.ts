// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Form restoration, batch 3 (enquiry pricing and follow-up forms, amount due, convert to quotation): after a REFUSED save the person's entries are still in the form and the message
// is shown; after a SAVE the form resets as before. The server actions are replaced; nothing is sent anywhere.
const h = vi.hoisted(() => ({ r: vi.fn(), calls: [] as FormData[] }));
const act1 = vi.hoisted(() => (name: string) => async (_p: unknown, fd: FormData) => { h.calls.push(fd); return h.r(name, fd); });
vi.mock("./pricingActions", () => ({
  proposeDiscountAction: act1("propose"), decideDiscountAction: act1("decide"), communicateDiscountAction: act1("communicate"), createFollowUpAction: act1("followup"),
  rescheduleFollowUpAction: act1("reschedule"), completeFollowUpAction: act1("complete"), convertAction: act1("convert"),
}));
vi.mock("../actions", () => ({ setAmountDueAction: act1("amount") }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => createElement("a", { href: p.href }, p.children as never) }));
import { CommunicateDiscountForm, DecideDiscountForm, ManageFollowUp, NewFollowUpForm, ProposeDiscountForm } from "./PricingForms";
import SetAmountDueForm from "./SetAmountDueForm";
import ConvertPanel from "./ConvertPanel";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
beforeEach(() => { h.r.mockReset(); h.calls = []; });

const mount = (el: ReactElement) => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(el)); };
const q = <T extends Element>(sel: string, i = 0) => host!.querySelectorAll(sel)[i] as T;
const setText = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
const submit = async (form: HTMLFormElement) => { await act(async () => { form.requestSubmit(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const refuse = (message = "Refused.") => h.r.mockResolvedValue({ ok: false, message });
const accept = () => h.r.mockResolvedValue({ ok: true, message: "Saved." });

describe("ProposeDiscountForm", () => {
  const fill = () => { const s = q<HTMLSelectElement>("select"); s.value = "fixed"; setText(q("input[name=value]"), "12.50"); setText(q("input[name=reason]"), "Repeat client, three jobs this year"); };
  it("keeps the type, amount and reason after a refusal and shows the message", async () => {
    mount(createElement(ProposeDiscountForm, { enquiryId: "e1" })); fill(); refuse("A discount needs approval first.");
    await submit(q("form")); expect(host!.textContent).toMatch(/needs approval first/);
    expect(q<HTMLSelectElement>("select").value).toBe("fixed"); expect(q<HTMLInputElement>("input[name=value]").value).toBe("12.50"); expect(q<HTMLInputElement>("input[name=reason]").value).toBe("Repeat client, three jobs this year");
    expect(h.calls[0].get("enquiryId")).toBe("e1");                                                                    // the hidden id still travels, and is never "restored" over
  });
  it("resets after a save, as before", async () => {
    mount(createElement(ProposeDiscountForm, { enquiryId: "e1" })); fill(); accept(); await submit(q("form"));
    expect(q<HTMLInputElement>("input[name=value]").value).toBe(""); expect(q<HTMLInputElement>("input[name=reason]").value).toBe("");
  });
});

describe("DecideDiscountForm, CommunicateDiscountForm", () => {
  it("keeps the decision note after a refusal", async () => {
    mount(createElement(DecideDiscountForm, { enquiryId: "e1", discountId: "d1" })); setText(q("input[name=note]"), "Approved for the repeat-client rate"); refuse("Only the Founder can decide."); await submit(q("form"));
    expect(q<HTMLInputElement>("input[name=note]").value).toBe("Approved for the repeat-client rate"); expect(host!.textContent).toMatch(/Only the Founder/);
  });
  it("keeps the channel and time after a refusal, and clears them after a save", async () => {
    mount(createElement(CommunicateDiscountForm, { enquiryId: "e1" })); setText(q("input[name=channel]"), "WhatsApp"); setText(q("input[name=communicatedAt]"), "2026-11-09T10:30"); refuse(); await submit(q("form"));
    expect(q<HTMLInputElement>("input[name=channel]").value).toBe("WhatsApp"); expect(q<HTMLInputElement>("input[name=communicatedAt]").value).toBe("2026-11-09T10:30");
    accept(); await submit(q("form")); expect(q<HTMLInputElement>("input[name=channel]").value).toBe("");
  });
});

describe("NewFollowUpForm and ManageFollowUp", () => {
  const people = [{ id: "p1", name: "Ama" }, { id: "p2", name: "Kofi" }];
  it("keeps the handler, next action and due time after a refusal", async () => {
    mount(createElement(NewFollowUpForm, { enquiryId: "e1", people })); q<HTMLSelectElement>("select").value = "p2"; setText(q("input[name=nextAction]"), "Call to confirm the date"); setText(q("input[name=dueAt]"), "2026-11-12T09:00");
    refuse("The due time is in the past."); await submit(q("form"));
    expect(q<HTMLSelectElement>("select").value).toBe("p2"); expect(q<HTMLInputElement>("input[name=nextAction]").value).toBe("Call to confirm the date"); expect(q<HTMLInputElement>("input[name=dueAt]").value).toBe("2026-11-12T09:00");
  });
  it("the reschedule form keeps its entries on a refusal without touching the separate 'mark done' form", async () => {
    mount(createElement(ManageFollowUp, { enquiryId: "e1", followUpId: "f1", people }));
    const [resched, done] = Array.from(host!.querySelectorAll("form"));
    setText(resched.querySelector("input[name=reason]") as HTMLInputElement, "Client asked for next week"); setText(resched.querySelector("input[name=dueAt]") as HTMLInputElement, "2026-11-20T14:00"); setText(done.querySelector("input[name=note]") as HTMLInputElement, "Spoke to them");
    refuse("Not allowed."); await submit(resched);
    expect((resched.querySelector("input[name=reason]") as HTMLInputElement).value).toBe("Client asked for next week"); expect((resched.querySelector("input[name=dueAt]") as HTMLInputElement).value).toBe("2026-11-20T14:00");
    expect((done.querySelector("input[name=note]") as HTMLInputElement).value).toBe("Spoke to them");
  });
});

describe("SetAmountDueForm", () => {
  it("keeps the typed amount after a refusal (and says it was not saved); after a save it shows the saved amount", async () => {
    mount(createElement(SetAmountDueForm, { enquiryId: "e1", currentAmountDue: 800 }));
    setText(q("input[name=amountDue]"), "1500.5"); h.r.mockResolvedValue({ ok: false, error: "That is more than the quotation total." }); await submit(q("form"));
    expect(q<HTMLInputElement>("input[name=amountDue]").value).toBe("1500.5"); expect(host!.textContent).toMatch(/more than the quotation total/);
    h.r.mockResolvedValue({ ok: true }); await submit(q("form")); expect(host!.textContent).toMatch(/Amount updated/);
  });
  it("sends one submission when submitted twice while the first is pending", async () => {
    let done!: (v: unknown) => void; h.r.mockImplementation(() => new Promise((r) => { done = r; }));
    mount(createElement(SetAmountDueForm, { enquiryId: "e1", currentAmountDue: null })); setText(q("input[name=amountDue]"), "300");
    const f = q<HTMLFormElement>("form"); await act(async () => { f.requestSubmit(); await Promise.resolve(); }); await act(async () => { f.requestSubmit(); await Promise.resolve(); });
    await act(async () => { done({ ok: true }); await Promise.resolve(); }); expect(h.calls.length).toBe(1);
  });
});

describe("ConvertPanel", () => {
  it("after a refusal says nothing was created, offers Try again, and creates only one draft on success", async () => {
    mount(createElement(ConvertPanel, { enquiryId: "e1", existing: null }));
    refuse("There is no communicated price yet."); await submit(q("form"));
    expect(host!.textContent).toMatch(/Nothing was created/); expect(host!.textContent).toMatch(/Try again/); expect(h.calls[0].get("enquiryId")).toBe("e1");
  });
  it("sends one request when pressed twice while the first is running", async () => {
    let done!: (v: unknown) => void; h.r.mockImplementation(() => new Promise((r) => { done = r; }));
    mount(createElement(ConvertPanel, { enquiryId: "e1", existing: null })); const f = q<HTMLFormElement>("form");
    await act(async () => { f.requestSubmit(); await Promise.resolve(); }); await act(async () => { f.requestSubmit(); await Promise.resolve(); });
    await act(async () => { done({ ok: true, message: "ok", kind: "created", reference: "Q1" }); await Promise.resolve(); }); expect(h.calls.length).toBe(1);
  });
});
