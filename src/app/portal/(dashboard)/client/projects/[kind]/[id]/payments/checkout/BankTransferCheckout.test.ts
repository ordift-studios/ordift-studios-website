// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The Qatar (bank-transfer-only) checkout: pressing "Show transfer details" twice in the same instant creates ONE instruction; a refused start keeps the amount for a retry. Synthetic; no network.
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => createElement("a", { href: p.href }, p.children as never) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import BankTransferCheckout from "./BankTransferCheckout";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const mount = () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(BankTransferCheckout, { kind: "enquiry", id: "e1", balanceUsd: 800, hasExistingPayment: false, currencyCode: "QAR", rateToUsd: 3.64 }))); };
const btn = (re: RegExp) => Array.from(host!.querySelectorAll("button")).find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement;
const instruction = { ok: true, paymentId: "p1", recordId: "PAY-2026-000001", convertedAmount: 2912, currencyCode: "QAR", rateToUsd: 3.64, rateLockedAt: new Date().toISOString(), receivingAccount: { bankName: "Synthetic Bank", beneficiaryName: "Synthetic", accountNumber: "000", iban: null, swiftCode: null, currencyCode: "QAR", country: "QA", classification: "corporate", bankAccountId: "a", capturedAt: new Date().toISOString() } };

describe("Qatar bank-transfer checkout", () => {
  it("creates one instruction when the button is pressed twice in the same instant", async () => {
    let finish!: (v: Response) => void; fetchMock.mockImplementation(() => new Promise<Response>((r) => { finish = r; }));
    mount(); const b = btn(/Show transfer details/);
    await act(async () => { b.click(); b.click(); await Promise.resolve(); });
    await act(async () => { finish({ json: async () => instruction } as Response); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(host!.textContent).toMatch(/Awaiting transfer/);
  });
  it("a refused start shows the message, keeps the amount and can be retried", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ ok: false, error: "rate-limited" }) } as Response).mockResolvedValueOnce({ json: async () => instruction } as Response);
    mount(); await act(async () => { btn(/Show transfer details/).click(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(host!.textContent).toMatch(/Too many attempts/); expect(host!.textContent).toMatch(/QAR 2912\.00/);
    await act(async () => { btn(/Show transfer details/).click(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(host!.textContent).toMatch(/Awaiting transfer/);
  });
});
