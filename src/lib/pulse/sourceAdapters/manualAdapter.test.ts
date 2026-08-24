import { describe, expect, it } from "vitest";
import { manualAdapter } from "./manualAdapter";

describe("manualAdapter", () => {
  it("always returns an empty list — manual sources are never fetched", async () => {
    const items = await manualAdapter.fetch({ id: "s1", name: "[SAMPLE] Manual Source", feedUrl: null, url: null });
    expect(items).toEqual([]);
  });
});
