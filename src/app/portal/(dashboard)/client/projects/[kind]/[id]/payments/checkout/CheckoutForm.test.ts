// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Behaviour of the client checkout flow: what it keeps after a refusal, what it never keeps, and that nothing is sent twice. Synthetic data only; no network, no payment provider.
const h = vi.hoisted(() => ({ gateway: vi.fn(), push: vi.fn() }));
vi.mock("../actions", () => ({ startGatewayCheckoutAction: (...a: unknown[]) => h.gateway(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
import CheckoutForm from "./CheckoutForm";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.restoreAllMocks(); });

const bank = { bankName: "Synthetic Bank", accountName: "Synthetic Account", accountNumber: "000111222", swiftCode: null, currencyCode: "GHS" };
function mount() {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => root!.render(createElement(CheckoutForm, { kind: "enquiry", id: "e1", balanceUsd: 500, hasExistingPayment: false, currencyCode: "GHS", rateToUsd: 15, bankAccount: bank as never, initialError: null })));
}
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const button = (label: RegExp) => Array.from(host!.querySelectorAll("button")).find((b) => label.test(b.textContent ?? "")) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); }); };
const setValue = async (el: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
const radio = (name: string, i: number) => host!.querySelectorAll(`input[name=${name}]`)[i] as HTMLInputElement;
const text = () => host!.textContent ?? "";
async function chooseCustom(method: 0 | 1, amount: string) {
  await click(radio("amountMode", 1)); await setValue(host!.querySelector("input[type=number]") as HTMLInputElement, amount); await click(radio("method", method)); await click(button(/^Continue$/));
}

describe("the checkout flow never asks for card details or passwords", () => {
  it("has no card, security-code, password or one-time-code field on any step", async () => {
    mount(); const bad = () => host!.querySelectorAll('input[type=password], input[autocomplete^="cc-"], input[autocomplete=one-time-code], input[name*=card i], input[name*=cvv i], input[name*=cvc i]').length;
    expect(bad()).toBe(0); await chooseCustom(1, "100"); expect(bad()).toBe(0); await click(button(/I've Sent This Payment/));
  });
});

describe("a card or Mobile Money refusal keeps what the client chose", () => {
  beforeEach(() => { h.gateway.mockReset(); });
  it("returns to the confirm step with the message, and the amount and method are still there after Back", async () => {
    h.gateway.mockResolvedValue({ error: "rate-limited" });
    mount(); await chooseCustom(0, "123.45");
    await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(text()).toMatch(/Too many attempts/); expect(text()).toMatch(/\$123\.45 USD/);                            // still on the confirm step, same amount
    await click(button(/^Back$/)); expect(text()).not.toMatch(/Too many attempts/);                                 // leaving the step clears the message
    expect(radio("amountMode", 1).checked).toBe(true); expect((host!.querySelector("input[type=number]") as HTMLInputElement).value).toBe("123.45"); expect(radio("method", 0).checked).toBe(true);
  });
  it("shows a plain message for an unknown refusal code and never the raw code", async () => {
    h.gateway.mockResolvedValue({ error: "some-internal-code" });
    mount(); await chooseCustom(0, "50"); await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(text()).toMatch(/Something went wrong/); expect(text()).not.toMatch(/some-internal-code/);
  });
  it("sends ONE checkout request when the confirm form is submitted twice quickly (the second is ignored while the first is pending)", async () => {
    let done!: (v: unknown) => void; h.gateway.mockImplementation(() => new Promise((r) => { done = r; }));
    mount(); await chooseCustom(0, "75");
    const form = host!.querySelector("form")!;
    await act(async () => { form.requestSubmit(); await Promise.resolve(); });
    await act(async () => { form.requestSubmit(); await Promise.resolve(); });
    expect(button(/Please wait/).disabled).toBe(true);
    await act(async () => { done({ error: "gateway-init-failed" }); await Promise.resolve(); }); await settle();
    expect(h.gateway).toHaveBeenCalledTimes(1);
  });
});

describe("bank transfer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const json = (o: unknown) => Promise.resolve({ json: async () => o } as Response);

  it("starts ONE bank-transfer instruction on a double click, then reuses nothing twice", async () => {
    let finish!: (v: Response) => void; fetchMock.mockImplementation(() => new Promise<Response>((r) => { finish = r; }));
    mount(); await chooseCustom(1, "100");
    const go = button(/I've Sent This Payment/);
    await act(async () => { go.click(); go.click(); await Promise.resolve(); });
    await act(async () => { finish({ json: async () => ({ ok: true, paymentId: "p1" }) } as Response); await Promise.resolve(); }); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(text()).toMatch(/Upload Proof of Payment/);
  });

  it("a refused start keeps the amount and method and lets the client try again", async () => {
    fetchMock.mockImplementationOnce(() => json({ ok: false, error: "rate-limited" })).mockImplementationOnce(() => json({ ok: true, paymentId: "p1" }));
    mount(); await chooseCustom(1, "100");
    await click(button(/I've Sent This Payment/)); await settle(); expect(text()).toMatch(/Too many attempts/); expect(text()).toMatch(/\$100\.00 USD/);
    await click(button(/I've Sent This Payment/)); await settle(); expect(text()).toMatch(/Upload Proof of Payment/); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  async function toUpload() {
    fetchMock.mockImplementationOnce(() => json({ ok: true, paymentId: "p1" }));
    mount(); await chooseCustom(1, "100"); await click(button(/I've Sent This Payment/)); await settle();
  }
  const attach = async () => { const input = host!.querySelector("#proof-file") as HTMLInputElement; const file = new File(["x"], "receipt.png", { type: "image/png" }); Object.defineProperty(input, "files", { value: [file], configurable: true }); await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); }); return file; };

  it("a card number typed into the note is refused in the browser: nothing is uploaded, the note is cleared and the digits are not echoed", async () => {
    await toUpload(); await attach(); const note = host!.querySelector("#reference-note") as HTMLInputElement;
    await setValue(note, "card 4111 1111 1111 1111"); await click(button(/Submit Proof of Payment/));
    expect(fetchMock).toHaveBeenCalledTimes(1);                                                                       // only the earlier start request: no upload was sent
    expect(note.value).toBe(""); expect(text()).toMatch(/do not type a card number/i); expect(host!.innerHTML).not.toMatch(/4111/);
  });

  it("an upload the server refuses keeps the file choice and the note, and a retry can succeed; the proof goes up once per attempt", async () => {
    await toUpload(); await attach(); const note = host!.querySelector("#reference-note") as HTMLInputElement; await setValue(note, "TRX-0042");
    fetchMock.mockImplementationOnce(() => json({ ok: false, error: "upload-failed" })).mockImplementationOnce(() => json({ ok: true, paymentId: "p1" }));
    await click(button(/Submit Proof of Payment/)); await settle();
    expect(text()).toMatch(/couldn't upload your proof/); expect(note.value).toBe("TRX-0042"); expect(button(/Submit Proof of Payment/).disabled).toBe(false);
    await click(button(/Submit Proof of Payment/)); await settle(); expect(text()).toMatch(/Pending Verification/);
    const posts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST"); expect(posts).toHaveLength(2);
  });

  it("a double click on Submit uploads once", async () => {
    await toUpload(); await attach(); let finish!: (v: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { finish = r; }));
    const go = button(/Submit Proof of Payment/); await act(async () => { go.click(); go.click(); await Promise.resolve(); });
    await act(async () => { finish({ json: async () => ({ ok: true, paymentId: "p1" }) } as Response); await Promise.resolve(); }); await settle();
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(1); expect(text()).toMatch(/Pending Verification/);
  });

  it("a server refusal of a card number in the note is shown plainly and clears the note", async () => {
    await toUpload(); await attach(); const note = host!.querySelector("#reference-note") as HTMLInputElement; await setValue(note, "TRX 0042");
    fetchMock.mockImplementationOnce(() => json({ ok: false, error: "sensitive-data-in-note" }));
    await click(button(/Submit Proof of Payment/)); await settle(); expect(note.value).toBe(""); expect(text()).toMatch(/do not type a card number/i);
  });
});
