// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The shared proof-upload form (the Qatar checkout and the payment status page): one upload at a time, and no card number is ever sent or kept. Synthetic data; no network.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { ProofUploadForm } from "./BankTransferPanels";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const mount = (onSubmitted = vi.fn()) => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(ProofUploadForm, { paymentId: "p1", onSubmitted }))); return onSubmitted; };
const el = (id: string) => document.getElementById(id) as HTMLInputElement;
const setValue = async (e: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }); };
const attach = async () => { const input = el("proof-file"); Object.defineProperty(input, "files", { value: [new File(["x"], "r.png", { type: "image/png" })], configurable: true }); await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); }); };
const submitBtn = () => Array.from(host!.querySelectorAll("button")).find((b) => /proof of payment/i.test(b.textContent ?? "")) as HTMLButtonElement;
const posts = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === "POST").length;

describe("ProofUploadForm", () => {
  it("uploads once when the button is pressed twice in the same instant", async () => {
    let finish!: (v: Response) => void; fetchMock.mockImplementation(() => new Promise<Response>((r) => { finish = r; }));
    const done = mount(); await attach(); const b = submitBtn();
    await act(async () => { b.click(); b.click(); await Promise.resolve(); });
    await act(async () => { finish({ ok: true, json: async () => ({ ok: true }) } as Response); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(posts()).toBe(1); expect(done).toHaveBeenCalledTimes(1);
  });
  it("refuses a card number in the note or the bank reference: nothing is sent, the field is cleared and the digits are not shown again", async () => {
    mount(); await attach(); await setValue(el("proof-note"), "card 4111 1111 1111 1111"); await act(async () => { submitBtn().click(); await Promise.resolve(); });
    expect(posts()).toBe(0); expect(el("proof-note").value).toBe(""); expect(host!.textContent).toMatch(/do not type a card number/i); expect(host!.innerHTML).not.toMatch(/4111/);
    await setValue(el("bank-ref"), "4111111111111111"); await act(async () => { submitBtn().click(); await Promise.resolve(); }); expect(posts()).toBe(0); expect(el("bank-ref").value).toBe("");
  });
  it("a refused upload keeps the file choice and the reference so the client can try again", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "upload-failed" }) } as Response).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);
    const done = mount(); await attach(); await setValue(el("bank-ref"), "TRX-0042");
    await act(async () => { submitBtn().click(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(host!.textContent).toMatch(/couldn't upload/i); expect(el("bank-ref").value).toBe("TRX-0042"); expect(submitBtn().disabled).toBe(false);
    await act(async () => { submitBtn().click(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); expect(done).toHaveBeenCalledTimes(1); expect(posts()).toBe(2);
  });
});
