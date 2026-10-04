import { describe, expect, it, vi } from "vitest";
import { saveTierRate } from "./tierRateSave";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = { marketSlug: "ghana", category: "event", serviceMode: "photography_film", tierSlug: "focused", priceUsd: "351", ...overrides };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("saveTierRate — post-save feedback for the Rate Card tier editor", () => {
  it("reports success only after the write returns ok, passes the exact market/category/medium/tier/price, and revalidates once", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const revalidate = vi.fn();
    const state = await saveTierRate(form(), "user-1", save, revalidate);
    expect(state).toEqual({ ok: true, message: "Saved — new version active at $351.00." });
    expect(save).toHaveBeenCalledWith({ marketSlug: "ghana", category: "event", serviceMode: "photography_film", tierSlug: "focused", priceUsd: 351, actorUserId: "user-1" });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("an unchanged value is reported honestly as no change, not as a new version", async () => {
    const state = await saveTierRate(form({ priceUsd: "350" }), "user-1", async () => ({ ok: true, unchanged: true }), vi.fn());
    expect(state).toEqual({ ok: true, message: "No change — the active rate is already $350.00." });
  });

  it("a failed write returns the error, never success, and does not revalidate", async () => {
    const revalidate = vi.fn();
    const state = await saveTierRate(form(), "user-1", async () => ({ ok: false, error: "Failed to save the new rate." }), revalidate);
    expect(state).toEqual({ ok: false, error: "Failed to save the new rate." });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("a thrown error becomes a plain error state, never success", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const revalidate = vi.fn();
    const state = await saveTierRate(form(), "user-1", async () => { throw new Error("boom"); }, revalidate);
    expect(state).toEqual({ ok: false, error: "Could not save the rate. Please try again." });
    expect(revalidate).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("an unauthenticated caller gets an error and nothing is written", async () => {
    const save = vi.fn();
    const state = await saveTierRate(form(), null, save, vi.fn());
    expect(state?.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([["", "event", "focused", "351"], ["ghana", "bogus", "focused", "351"], ["ghana", "event", "", "351"], ["ghana", "event", "focused", "abc"], ["ghana", "event", "focused", "0"], ["ghana", "event", "focused", "-5"]])(
    "invalid input (%s/%s/%s/%s) is rejected with an error and nothing is written",
    async (marketSlug, category, tierSlug, priceUsd) => {
      const save = vi.fn();
      const revalidate = vi.fn();
      const state = await saveTierRate(form({ marketSlug, category, tierSlug, priceUsd }), "user-1", save, revalidate);
      expect(state?.ok).toBe(false);
      expect(save).not.toHaveBeenCalled();
      expect(revalidate).not.toHaveBeenCalled();
    }
  );
});
