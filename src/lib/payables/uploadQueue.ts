// Pure scheduling rules for the multi-file uploader. A photographer may drop a few hundred photographs at once;
// starting every upload simultaneously overloads the browser and the connection and makes most of them fail, so the
// queue runs a small number at a time and reports plainly what finished and what needs another try.
export const UPLOAD_CONCURRENCY = 3;

export type UploadStatus = "queued" | "uploading" | "recording" | "done" | "error";
export type QueueItem = { id: string; status: UploadStatus };

// Ids of queued items to start now, so that no more than `limit` are in flight (uploading or being recorded).
export function idsToStart(items: QueueItem[], limit: number = UPLOAD_CONCURRENCY): string[] {
  const active = items.filter((t) => t.status === "uploading" || t.status === "recording").length;
  const room = Math.max(0, limit - active);
  return items.filter((t) => t.status === "queued").slice(0, room).map((t) => t.id);
}

export type QueueSummary = { total: number; done: number; failed: number; inFlight: number; waiting: number; busy: boolean };
export function summarizeQueue(items: QueueItem[]): QueueSummary {
  const done = items.filter((t) => t.status === "done").length;
  const failed = items.filter((t) => t.status === "error").length;
  const inFlight = items.filter((t) => t.status === "uploading" || t.status === "recording").length;
  const waiting = items.filter((t) => t.status === "queued").length;
  return { total: items.length, done, failed, inFlight, waiting, busy: inFlight + waiting > 0 };
}

export function summaryText(s: QueueSummary): string {
  if (s.total === 0) return "";
  const parts = [`${s.done} of ${s.total} uploaded`];
  if (s.inFlight + s.waiting > 0) parts.push(`${s.inFlight + s.waiting} still going`);
  if (s.failed > 0) parts.push(`${s.failed} failed — use Retry`);
  return parts.join(" · ");
}
