"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import type { JobRow } from "@/lib/bookings/notificationService";
import { SKIP_TEXT } from "@/lib/bookings/clientAddress";
import { clientNoticeOutstanding } from "@/lib/bookings/noticeOutstanding";
import { recordClientNoticeAction, retryBookingNotificationAction } from "./bookingActions";

// Super Admin (every notice) and Admin (the client notice only: no internal, assigned or money information). The delivery record of the booking messages: what was produced, whether anything left this system, how many tries,
// the OUTSTANDING ACTION when the client has not been told, a Retry / Send now (Super Admin), and the way to RECORD that the client was told another way (Admin or Super Admin). A sent notice has no button (it cannot go twice).
const EVENT: Record<string, string> = { confirmed: "Booking Confirmed", changed: "Rescheduled and confirmed", cancelled_pending: "Cancelled — new date to be agreed", cancelled_final: "Cancelled (final)" };
const WHO: Record<string, string> = { client: "Client", internal: "Team", assigned: "Assigned person", released: "Person taken off" };
const RESULT: Record<string, string> = { sent: "Sent", logged: "Test mode: logged only, nothing was sent", no_recipients: SKIP_TEXT.no_recipients, not_eligible: SKIP_TEXT.not_eligible, superseded: SKIP_TEXT.superseded, ...Object.fromEntries(["suppressed", "unverified_address", "no_email", "account_unconfirmed", "account_lookup_failed"].map((k) => [k, SKIP_TEXT[k]])) };
const TONE: Record<string, string> = { sent: "bg-green-50 text-green-900", failed: "bg-red-50 text-red-900", skipped: "bg-amber-50 text-amber-900", deferred: "bg-amber-50 text-amber-900", pending: "bg-black/5 text-ordift-ink", processing: "bg-black/5 text-ordift-ink" };
const CHANNELS = [["whatsapp", "WhatsApp"], ["telephone", "Telephone call"], ["email", "E-mail from my own mailbox"], ["in_person", "In person"], ["other", "Other"]];
const field = "rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption text-ordift-ink";

export default function BookingNotificationsCard({ enquiryId, jobs, currentConfirmationId, level }: { enquiryId: string; jobs: JobRow[]; currentConfirmationId: string | null; level: "super_admin" | "admin" }) {
  if (jobs.length === 0) return null;
  const out = clientNoticeOutstanding(jobs, currentConfirmationId);
  return (
    <div className="border-t border-black/10 pt-4 space-y-3" data-testid="booking-notifications">
      <p className="font-sans text-body-small font-medium text-ordift-ink">Notifications</p>
      {out ? <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" data-testid="outstanding-notice"><p className="font-sans text-caption font-semibold text-amber-950">Outstanding action</p><p className="font-sans text-caption text-amber-950">{out.text}</p></div> : null}
      <ul className="space-y-3">
        {jobs.map((j) => {
          const current = j.confirmation_id === currentConfirmationId, manual = j.deliveries?.find((d) => d.mode === "manual");
          const actionable = current && j.status !== "sent" && j.provider_result !== "superseded";
          return (
            <li key={j.id} className="rounded-lg border border-black/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-body-small font-medium text-ordift-ink">{WHO[j.audience] ?? j.audience}: {EVENT[j.event] ?? j.event}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 font-sans text-caption font-medium ${TONE[j.status] ?? ""}`}>{j.status}</span>
                <span className="font-sans text-caption text-ordift-ink-muted">tries: {j.attempt_count}{j.sent_at ? ` · ${new Date(j.sent_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}{current ? "" : " · earlier version"}</span>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">{manual ? `Recorded as told by ${manual.channel?.replace("_", " ")}${manual.note ? ` — ${manual.note}` : ""}.` : j.provider_result ? (RESULT[j.provider_result] ?? j.provider_result) : j.status === "pending" ? "Waiting to be sent." : j.status === "processing" ? "Being sent." : j.status === "deferred" ? "Held back." : "No result recorded."}{j.audience === "internal" && j.recipient_count > 0 ? ` · reached ${j.deliveries.filter((d) => d.ok).length} of ${j.recipient_count}` : ""}</p>
              {j.status === "deferred" ? <p className="font-sans text-caption text-amber-950">Deferred{j.deferred_at ? ` ${new Date(j.deferred_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}: {j.deferred_reason}</p> : null}
              {j.last_error ? <p className="font-sans text-caption text-red-900">Last error: {j.last_error}</p> : null}
              {j.body_text ? <details><summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed">View the message</summary><p className="font-sans text-caption text-ordift-ink-muted mt-1">Subject: {j.subject}</p><pre className="mt-1 whitespace-pre-wrap rounded-md bg-black/[0.03] p-2 font-sans text-caption text-ordift-ink">{j.body_text}</pre></details> : null}
              {actionable && level === "super_admin" ? (
                <ActionForm action={retryBookingNotificationAction} className="flex items-center gap-2">
                  <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="confirmationId" value={j.confirmation_id} /><input type="hidden" name="audience" value={j.audience} />
                  <SubmitButton pendingLabel="Sending…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">{j.status === "pending" || j.status === "deferred" ? "Send now" : "Retry"}</SubmitButton>
                </ActionForm>
              ) : null}
              {actionable && j.audience === "client" ? (
                <ActionForm action={recordClientNoticeAction} className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-2" data-testid="record-client-notice">
                  <input type="hidden" name="enquiryId" value={enquiryId} /><input type="hidden" name="confirmationId" value={j.confirmation_id} />
                  <label className="font-sans text-caption text-ordift-ink-muted">I told the client by
                    <select name="channel" className={`${field} ml-1`} defaultValue="whatsapp">{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="font-sans text-caption text-ordift-ink-muted">Note (no phone or e-mail)<input name="note" maxLength={300} className={`${field} ml-1`} autoComplete="off" /></label>
                  <SubmitButton pendingLabel="Recording…" className="min-h-9 px-4 rounded-full border border-black/20 font-sans text-caption">Record that I told the client</SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
