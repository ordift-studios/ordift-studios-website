import { describe, expect, it, vi } from "vitest";
import { UPLOAD_LIMIT, createUploadLimiter } from "./uploadLimit";

describe("upload limit policy", () => {
  it("is 20 uploads per 10 minutes: room for a full 30-photograph portfolio over two sittings, not for a script", () => expect(UPLOAD_LIMIT).toEqual({ windowMs: 600_000, max: 20 }));
});

describe("without a shared store (per-instance counting)", () => {
  const none = () => null;
  it("allows 20, refuses the 21st with the time until the oldest ages out, per user", async () => {
    let t = 1_000_000; const check = createUploadLimiter({ redis: none, now: () => t });
    for (let n = 0; n < 20; n++) { expect((await check("a")).allowed).toBe(true); t += 1000; }
    const blocked = await check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(Math.ceil((1_000_000 + 600_000 - t) / 1000));
    expect((await check("b")).allowed).toBe(true);
  });
  it("slides: once the oldest uploads are older than 10 minutes, uploading is allowed again", async () => {
    let t = 0; const check = createUploadLimiter({ redis: none, now: () => t });
    for (let n = 0; n < 20; n++) await check("a");
    expect((await check("a")).allowed).toBe(false);
    t = 600_001;
    expect((await check("a")).allowed).toBe(true);
  });
});

describe("with the shared Redis store", () => {
  it("passes the user's own key, the window and the limit, and turns the answer into allowed / retry-after", async () => {
    const calls: { keys: string[]; args: string[] }[] = [];
    let answer = 0;
    const redis = { eval: async (_s: string, keys: string[], args: string[]) => { calls.push({ keys, args }); return answer; } };
    const check = createUploadLimiter({ redis: () => redis, now: () => 1_000_000 });
    expect(await check("user-7")).toEqual({ allowed: true });
    expect(calls[0].keys).toEqual(["ratelimit:qr-portfolio-upload:user-7"]);
    expect(calls[0].args.slice(0, 3)).toEqual(["1000000", "600000", "20"]);
    answer = 1_000_000 - 100_000;                                         // the oldest hit was 100 s ago
    expect(await check("user-7")).toEqual({ allowed: false, retryAfterSeconds: 500 });
  });
  it("fails open, and says so, if the store is unreachable", async () => {
    const log = vi.fn();
    const check = createUploadLimiter({ redis: () => ({ eval: async () => { throw new Error("redis down"); } }), log });
    expect(await check("a")).toEqual({ allowed: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed, allowing"), expect.any(Error));
  });
});
