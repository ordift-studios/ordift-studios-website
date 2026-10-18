import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { setEnquiryEmailNotificationsAction } from "../staffIntakeActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";

// Automatic client emails for a STAFF-RECORDED enquiry (admin or Super Admin). They start off. Switching them on is an explicit, reasoned, audited decision;
// it sends nothing itself. Not shown for website enquiries, which keep their established behaviour.
export default async function EmailNotificationsPanel({ enquiryId }: { enquiryId: string }) {
  const { data: e } = await createAdminClient().from("enquiries").select("created_by, email, email_notifications_suppressed").eq("id", enquiryId).maybeSingle();
  if (!e || e.created_by === null) return null;
  const off = e.email_notifications_suppressed !== false;
  const noEmail = isPlaceholderEmail(e.email);
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Automatic client emails</h2>
      <p className="font-sans text-body-small text-ordift-ink">
        {off ? "Off. No quotation-ready, booking-confirmed or files-ready email is sent to this client automatically." : "On. This client receives the automatic quotation-ready, booking-confirmed and files-ready emails."}
      </p>
      {off && noEmail ? (
        <p className="font-sans text-caption text-ordift-ink-muted">No email address is on file, so these cannot be switched on.</p>
      ) : (
        <ActionForm action={setEnquiryEmailNotificationsAction} className="flex flex-wrap items-start gap-2">
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <input type="hidden" name="allow" value={off ? "true" : "false"} />
          <input name="reason" required minLength={5} placeholder={off ? "Why switch them on? (for example: the client agreed by WhatsApp)" : "Why switch them off?"} className="min-w-72 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <SubmitButton pendingLabel="Saving…" className="rounded-lg border border-black/20 px-3 py-2 font-sans text-body-small text-ordift-ink">{off ? "Switch automatic emails on" : "Switch automatic emails off"}</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
