// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Staff side: the invitation's link and code are shown once after creation; a refusal keeps what staff chose; a second press makes one invitation. The server action is replaced.
const h = vi.hoisted(() => ({ create: vi.fn(), revoke: vi.fn(), release: vi.fn() }));
vi.mock("./portalAccessActions", () => ({ createInvitationAction: (...a: unknown[]) => h.create(...a), revokeInvitationAction: (...a: unknown[]) => h.revoke(...a), releaseOwnershipAction: (...a: unknown[]) => h.release(...a) }));
import { CreateInvitationForm, ReleaseOwnershipForm } from "./PortalAccessForms";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
beforeEach(() => { h.create.mockReset(); h.revoke.mockReset(); h.release.mockReset(); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
const mount = (el: ReturnType<typeof createElement>) => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(el)); };
const settle = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ok = { ok: true, link: "https://lab.example.test/portal/claim/TOKEN", code: "482915", expiresAt: "2026-11-12T10:00:00.000Z", advice: "Send the link in the chat. Give the code in a separate message.", reasons: ["The email address on this record is marked as a SHARED mailbox."], level: "elevated", invitationText: "Hello Ama ...", codeText: "Your code is 482915" };

describe("CreateInvitationForm", () => {
  it("shows the link, the code, the delivery advice and the extra-care reasons once the invitation exists", async () => {
    h.create.mockResolvedValue(ok); mount(createElement(CreateInvitationForm, { enquiryId: "e1", defaultChannel: "telephone", hasOpen: false }));
    expect((host!.querySelector("select[name=channel]") as HTMLSelectElement).value).toBe("telephone");
    await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(host!.querySelector("[data-testid=claim-link]")?.textContent).toBe(ok.link); expect(host!.querySelector("[data-testid=claim-code]")?.textContent).toBe("482915");
    expect(host!.textContent).toMatch(/cannot be shown again/); expect(host!.textContent).toMatch(/SHARED mailbox/); expect(host!.textContent).toMatch(/separate message/);
  });
  it("a refusal shows the reason and keeps the chosen channel, note and days", async () => {
    h.create.mockResolvedValue({ ok: false, error: "An invitation for this project is already open." }); mount(createElement(CreateInvitationForm, { enquiryId: "e1", defaultChannel: "whatsapp", hasOpen: false }));
    const f = host!.querySelector("form")!; (f.querySelector("select[name=channel]") as HTMLSelectElement).value = "email"; const note = f.querySelector("input[name=note]") as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(note, "spoke by phone");
    await act(async () => { f.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(host!.textContent).toMatch(/already open/); expect((f.querySelector("select[name=channel]") as HTMLSelectElement).value).toBe("email"); expect(note.value).toBe("spoke by phone"); expect(host!.querySelector("[data-testid=claim-code]")).toBeNull();
  });
  it("two presses at once make one invitation", async () => {
    let done!: (v: unknown) => void; h.create.mockImplementation(() => new Promise((r) => { done = r; })); mount(createElement(CreateInvitationForm, { enquiryId: "e1", defaultChannel: "whatsapp", hasOpen: false }));
    const f = host!.querySelector("form")!; await act(async () => { f.requestSubmit(); f.requestSubmit(); await Promise.resolve(); }); await act(async () => { done(ok); await Promise.resolve(); }); await settle();
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});

describe("ReleaseOwnershipForm", () => {
  it("keeps the written reason after a refusal and needs the confirmation box", async () => {
    h.release.mockResolvedValue({ ok: false, error: "A payment has been made on this project." }); mount(createElement(ReleaseOwnershipForm, { enquiryId: "e1" }));
    const t = host!.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, "Wrong person claimed this project.");
    await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(host!.textContent).toMatch(/payment has been made/); expect(t.value).toBe("Wrong person claimed this project.");
  });
  it("keeps the one-time link and code on screen after the page refresh turns the invitation into an open one (the form is re-rendered with hasOpen)", async () => {
    h.create.mockResolvedValue(ok); const Wrap = (props: { open: boolean }) => createElement(CreateInvitationForm, { enquiryId: "e1", defaultChannel: "whatsapp", hasOpen: props.open });
    mount(createElement(Wrap, { open: false })); await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    act(() => root!.render(createElement(Wrap, { open: true })));
    expect(host!.querySelector("[data-testid=claim-code]")?.textContent).toBe("482915"); expect(host!.querySelector("form")!.hidden).toBe(true);
  });
  it("with an open invitation and nothing just created, says one is open and hides the create fields", () => {
    mount(createElement(CreateInvitationForm, { enquiryId: "e1", defaultChannel: "whatsapp", hasOpen: true })); expect(host!.textContent).toMatch(/An invitation is open/); expect(host!.querySelector("form")!.hidden).toBe(true);
  });
});
