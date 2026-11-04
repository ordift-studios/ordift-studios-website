// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import CopyUrlButton from "./CopyUrlButton";

const URL_TO_COPY = "https://ordiftstudios.com/connect";
let root: Root | null = null; let host: HTMLElement | null = null;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); });
function mount() { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(CopyUrlButton, { url: URL_TO_COPY }))); return host; }
const button = (h: HTMLElement) => h.querySelector("button")!;
const status = (h: HTMLElement) => h.querySelector('[role="status"]')!.textContent;
const press = async (h: HTMLElement) => { await act(async () => { button(h).dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };

describe("Copy URL", () => {
  it("copies exactly the fixed address with the clipboard API and says so, then goes back to its label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const h = mount();
    expect(button(h).textContent).toBe("Copy URL");
    await press(h);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(URL_TO_COPY);
    expect(button(h).textContent).toBe("Copied");
    expect(status(h)).toContain("copied to the clipboard");
    act(() => { vi.advanceTimersByTime(3100); });
    expect(button(h).textContent).toBe("Copy URL");
  });
  it("falls back to selecting a hidden field when the clipboard API is refused or missing, still copying exactly the address", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    let copied = "";
    document.execCommand = vi.fn((cmd: string) => { copied = (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value ?? ""; return cmd === "copy"; }) as unknown as typeof document.execCommand;
    const h = mount(); await press(h);
    expect(copied).toBe(URL_TO_COPY);
    expect(button(h).textContent).toBe("Copied");
    expect(document.querySelector("textarea")).toBeNull();                                        // the temporary field is removed
  });
  it("tells the person plainly when it cannot copy, and never claims success", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    const h = mount(); await press(h);
    expect(button(h).textContent).toBe("Copy URL");
    expect(h.textContent).toContain("Could not copy");
    expect(status(h)).toContain("could not be copied");
  });
  it("accepts no other address: the only text it ever copies is the one it was given, which the page fixes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const h = mount(); await press(h); await press(h);
    expect(new Set(writeText.mock.calls.map((c) => c[0]))).toEqual(new Set([URL_TO_COPY]));
  });
});
