// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
import CancelInstructionButton from "./CancelInstructionButton";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { h.refresh.mockReset(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const mount = () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(CancelInstructionButton, { paymentId: "p1" }))); };
const btn = () => host!.querySelector("button") as HTMLButtonElement;
const settle = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("CancelInstructionButton", () => {
  it("sends one cancel request for two presses in the same instant, then refreshes the page", async () => {
    let finish!: (v: Response) => void; fetchMock.mockImplementation(() => new Promise<Response>((r) => { finish = r; })); mount();
    await act(async () => { btn().click(); btn().click(); await Promise.resolve(); }); await act(async () => { finish({ ok: true, json: async () => ({ ok: true }) } as Response); await Promise.resolve(); }); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ paymentId: "p1" }) }); expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it("says plainly when the instruction can no longer be cancelled, and can be tried again", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "payment-not-open-for-cancellation" }) } as Response); mount();
    await act(async () => { btn().click(); await Promise.resolve(); }); await settle(); expect(host!.textContent).toMatch(/can no longer be cancelled/); expect(h.refresh).not.toHaveBeenCalled(); expect(btn().disabled).toBe(false);
  });
});
