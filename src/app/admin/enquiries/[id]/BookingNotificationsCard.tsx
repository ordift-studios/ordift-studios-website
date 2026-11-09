"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import type { JobRow } from "@/lib/bookings/notificationService";
import { retryBookingNotificationAction } from "./bookingActions";

// Super Admin only (the data is empty for everyone else). The delivery record of the booking e-mails: what was produced, whether anything left this system, how many tries, and a Retry for a failed or skipped one.
// A sent notification has no Retry (the database refuses to claim it), so a message can never go out twice.
const RESULT: Record<string, string> = {
  sent: "Sent", logged: "Test mode: logged only, nothing was sent", suppressed: "Not emailed: this enquiry was recorded by staff, so client e-mails are suppressed (tell the client yourself; the message is below)",
  no_email: "Not emailed: the client has no e-mail address on file", no_recipients: "Not sent: no internal recipient is eligible",
};
const STATUS_TONE: Record<string, string> = { sent: "bg-green-50 text-green-900", failed: "bg-red-50 text-red-900", skipped: "bg-amber-50 text-amber-900", pending: "bg-black/5 text-ordift-ink", processing: "bg-black/5 text-ordift-ink" };

export default function BookingNotificationsCard({ enquiryId, jobs }: { enquiryId: string; jobs: JobRow[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="border-t border-black/10 pt-4 space-y-3" data-testid="booking-notifications">
      <p className="font-sans text-body-small font-medium text-ordift-ink">Notifications</p>
      <ul className="space-y-3">
        {jobs.map((j) => (
          <li key={j.id} className="rounded-lg border border-black/10 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{j.audience === "client" ? "Client: Booking Confirmed" : "Internal: New Booking Confirmed"}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 font-sans text-caption font-medium ${STATUS_TONE[j.status] ?? ""}`}>{j.status}</span>
              <span className="font-sans text-caption text-ordift-ink-muted">tries: {j.attempt_count}{j.sent_at ? ` · ${new Date(j.sent_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}</span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">{j.provider_result ? (RESULT[j.provider_result] ?? j.provider_result) : j.status === "pending" ? "Waiting to be sent." : j.status === "processing" ? "Being sent." : "No result recorded."}{j.audience === "internal" && j.recipient_count > 0 ? ` · reached ${j.deliveries.filter((d) => d.ok).length} of ${j.recipient_count}` : ""}</p>
            {j.last_error ? <p className="font-sans text-caption text-red-900">Last error: {j.last_error}</p> : null}
            {j.body_text ? <details><summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed">View the message</summary><p className="font-sans text-caption text-ordift-ink-muted mt-1">Subject: {j.subject}</p><pre className="mt-1 whitespace-pre-wrap rounded-md bg-black/[0.03] p-2 font-sans text-caption text-ordift-ink">{j.body_text}</pre></details> : null}
            {j.status !== "sent" ? (
              <ActionForm action={retryBookingNotificationAction} className="flex items-center gap-2">
                <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="confirmationId" value={j.confirmation_id} /><input type="hidden" name="audience" value={j.audience} />
                <SubmitButton pendingLabel="Retrying…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">{j.status === "pending" ? "Send now" : "Retry"}</SubmitButton>
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
