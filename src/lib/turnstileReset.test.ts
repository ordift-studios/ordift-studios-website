import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetTurnstile } from "./turnstileReset";

const element = { id: "turnstile-abc" } as unknown as HTMLElement;
const doc = { getElementById: (id: string) => (id === "turnstile-abc" ? element : null) };

describe("resetTurnstile", () => {
  it("hands Cloudflare the container ELEMENT, not a bare id string (a bare id throws)", () => {
    const reset = vi.fn();
    expect(resetTurnstile("turnstile-abc", { doc, api: { reset } })).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith(element);
  });
  it("never throws: a Cloudflare failure comes back as false", () => {
    const reset = vi.fn(() => { throw new Error("[Cloudflare Turnstile] Nothing to reset found for provided container."); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resetTurnstile("turnstile-abc", { doc, api: { reset } })).toBe(false);
    warn.mockRestore();
  });
  it("returns false (without calling Cloudflare) when the script isn't loaded or the container is gone", () => {
    const reset = vi.fn();
    expect(resetTurnstile("turnstile-abc", { doc })).toBe(false);
    expect(resetTurnstile("missing", { doc, api: { reset } })).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });
  it("the widget no longer calls turnstile.reset with the id string anywhere", () => {
    const src = readFileSync("src/components/TurnstileWidget.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/turnstile\??\.reset\(/);
    expect(src).toContain("resetTurnstile(containerId)");
  });
  it("the login still gates submit on a fresh token after a failed attempt (unchanged)", () => {
    const login = readFileSync("src/app/portal/login/LoginForm.tsx", "utf8");
    expect(login).toContain('if (state.error) setTurnstileToken("")');
    expect(login).toContain("disabled={pending || (turnstileRequired && !turnstileToken)}");
  });
});
