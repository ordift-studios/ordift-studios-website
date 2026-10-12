import { describe, expect, it } from "vitest";
import { UPLOAD_CONCURRENCY, idsToStart, summarizeQueue, summaryText, type QueueItem } from "./uploadQueue";

const item = (id: string, status: QueueItem["status"]): QueueItem => ({ id, status });

describe("upload queue", () => {
  it("starts at most the concurrency limit, in order, however many files are dropped", () => {
    const items = Array.from({ length: 300 }, (_, i) => item(`f${i}`, "queued"));
    expect(idsToStart(items)).toEqual(["f0", "f1", "f2"]);
    expect(UPLOAD_CONCURRENCY).toBe(3);
  });
  it("counts uploading and recording as in flight and only fills the remaining room", () => {
    expect(idsToStart([item("a", "uploading"), item("b", "recording"), item("c", "queued"), item("d", "queued")])).toEqual(["c"]);
    expect(idsToStart([item("a", "uploading"), item("b", "uploading"), item("c", "recording"), item("d", "queued")])).toEqual([]);
  });
  it("never restarts finished or failed files by itself", () => {
    expect(idsToStart([item("a", "done"), item("b", "error"), item("c", "queued")])).toEqual(["c"]);
    expect(idsToStart([item("a", "done"), item("b", "error")])).toEqual([]);
  });
  it("a failed file retried (set back to queued) is picked up again", () => {
    expect(idsToStart([item("a", "queued"), item("b", "done")])).toEqual(["a"]);
  });
  it("summarises plainly: done, still going, failed", () => {
    const s = summarizeQueue([item("a", "done"), item("b", "done"), item("c", "uploading"), item("d", "queued"), item("e", "error")]);
    expect(s).toEqual({ total: 5, done: 2, failed: 1, inFlight: 1, waiting: 1, busy: true });
    expect(summaryText(s)).toBe("2 of 5 uploaded · 2 still going · 1 failed — use Retry");
    expect(summaryText(summarizeQueue([item("a", "done")]))).toBe("1 of 1 uploaded");
    expect(summaryText(summarizeQueue([]))).toBe("");
    expect(summarizeQueue([item("a", "done"), item("b", "error")]).busy).toBe(false);
  });
});
