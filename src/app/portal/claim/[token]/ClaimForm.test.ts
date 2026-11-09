// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The client's claim form: a wrong code keeps the person on the page with a plain message and an EMPTY code box (a one-time code is never put back), a double press makes one attempt, and a success leaves for the project.
const h = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("./actions", () => ({ claimProjectAction: (...a: unknown[]) => h.action(...a) }));
import ClaimForm from "./ClaimForm";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
beforeEach(() => { h.action.mockReset(); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
const mount = () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(ClaimForm, { token: "T".repeat(43) }))); };
const code = () => document.getElementById("claim-code") as HTMLInputElement;
const type = async (v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(code(), v); code().dispatchEvent(new Event("input", { bubbles: true })); }); };
const settle = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("ClaimForm", () => {
  it("a wrong code shows the message and leaves the code box empty and ready", async () => {
    h.action.mockResolvedValue({ error: "That code isn't right. You have 3 tries left." }); mount(); await type("111111");
    await act(async () => { host!.querySelector("form")!.requestSubmit(); await Promise.resolve(); }); await settle();
    expect(host!.textContent).toMatch(/3 tries left/); expect(code().value).toBe(""); expect(code().getAttribute("autocomplete")).toBe("one-time-code");
  });
  it("sends the link token (hidden) with the code, once, even if pressed twice at the same instant", async () => {
    let done!: (v: unknown) => void; h.action.mockImplementation(() => new Promise((r) => { done = r; })); mount(); await type("123456");
    const f = host!.querySelector("form")!; await act(async () => { f.requestSubmit(); f.requestSubmit(); await Promise.resolve(); }); await act(async () => { done({ error: "That code isn't right. You have 4 tries left." }); await Promise.resolve(); }); await settle();
    expect(h.action).toHaveBeenCalledTimes(1); const fd = h.action.mock.calls[0][1] as FormData; expect(fd.get("token")).toBe("T".repeat(43)); expect(fd.get("code")).toBe("123456");
  });
  it("offers nothing about any project, only the code box", () => { mount(); expect(host!.textContent).not.toMatch(/ENQ-|quotation|payment of/i); expect(host!.querySelectorAll("input:not([type=hidden])")).toHaveLength(1); });
});
