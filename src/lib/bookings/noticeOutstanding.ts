import { SKIP_TEXT } from "./clientAddress";

// THE VISIBLE OUTSTANDING ACTION for the client notice of the CURRENT booking version (pure). Older versions are history, never outstanding.
export type NoticeJobLike = { confirmation_id: string; audience: string; event: string; status: string; provider_result: string | null; last_error: string | null; deferred_reason?: string | null };
export type Outstanding = { kind: "deferred" | "skipped" | "failed" | "pending"; text: string };

const EVENT_NAME: Record<string, string> = { confirmed: "Booking Confirmed", changed: "rescheduled-and-confirmed", cancelled_pending: "cancelled (new date to be agreed)", cancelled_final: "cancelled (final)" };

export function clientNoticeOutstanding(jobs: NoticeJobLike[], currentConfirmationId: string | null): Outstanding | null {
  if (!currentConfirmationId) return null;
  const j = jobs.find((x) => x.confirmation_id === currentConfirmationId && x.audience === "client");
  if (!j) return null;
  const name = EVENT_NAME[j.event] ?? j.event;
  if (j.status === "deferred") return { kind: "deferred", text: `The client has NOT been told (${name}). Deferred: ${j.deferred_reason ?? "no reason recorded"}. Send it, or record that you told them another way.` };
  if (j.status === "skipped") return { kind: "skipped", text: `The client has NOT been e-mailed (${name}). ${SKIP_TEXT[j.provider_result ?? ""] ?? "Tell the client yourself and record it."}` };
  if (j.status === "failed") return { kind: "failed", text: `The client e-mail (${name}) failed${j.last_error ? `: ${j.last_error}` : ""}. Retry it, or tell the client yourself and record it.` };
  if (j.status === "pending" || j.status === "processing") return { kind: "pending", text: `The client e-mail (${name}) has not been sent yet. Press Send now, or tell the client yourself and record it.` };
  return null;                                                                // sent (automatically or recorded by a person): nothing outstanding
}
