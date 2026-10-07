import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import type { NotificationEventRow } from "@/lib/crewSupport/notifications";
import { retryNotificationAction } from "./quotationActions";

const LABEL: Record<string, string> = { sent: "Sent", logged: "Logged (test mode)", failed: "Failed", suppressed_test: "Not delivered — test record", pending: "Pending" };

export default function NotificationsPanel({ requestId, events, isTest }: { requestId: string; events: NotificationEventRow[]; isTest: boolean }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" className="font-serif font-medium text-body text-ordift-ink">Client notifications</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">Only meaningful client-facing events email the requester (under review, availability review, quotation issued, acceptance recorded, declined, cancelled). Each event is sent once; internal changes never email the client.{isTest ? " This is a TEST record: messages are recorded here but never delivered." : ""}</p>
      {events.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No client notifications yet.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <p className="font-sans text-body-small text-ordift-ink">{e.subject ?? e.template} <span className="text-caption text-ordift-ink-muted">· {e.createdAt.slice(0, 16).replace("T", " ")} UTC · <strong>{LABEL[e.status] ?? e.status}</strong>{e.error ? ` · ${e.error}` : ""}</span></p>
              {e.status === "failed" && !isTest && (
                <ActionForm action={retryNotificationAction}><input type="hidden" name="eventId" value={e.id} /><input type="hidden" name="requestId" value={requestId} /><SubmitButton pendingLabel="Retrying…" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Retry</SubmitButton></ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
