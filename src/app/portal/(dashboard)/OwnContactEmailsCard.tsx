import type { OwnContactEmails } from "@/lib/organization/correspondenceEmail";

// READ-ONLY card on the signed-in person's own portal pages: their account (login) email and the preferred correspondence email Ordift holds for them. It has no form, no input and no
// action: nobody can change a credential or a preference from here (a change is made by an authorized Ordift administrator). It shows only the two addresses - never an evidence note, who
// recorded the preference, or any history.
export function OwnContactEmailsCard({ emails }: { emails: OwnContactEmails }) {
  return (
    <section aria-labelledby="own-contact-emails-heading" className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
      <h2 id="own-contact-emails-heading" className="font-serif font-medium text-body text-ordift-ink">Your contact emails</h2>
      <p className="font-sans text-body-small text-ordift-ink-muted">Account Email — Used for Login: <span className="text-ordift-ink">{emails.accountEmail ?? "—"}</span></p>
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Preferred Correspondence Email — Used for Communication:{" "}
        <span className="text-ordift-ink">{emails.preferredEmail ?? (emails.available ? "Not set (Ordift uses your account email)" : "Not available yet")}</span>
      </p>
      <p className="font-sans text-caption text-ordift-ink-muted">
        These are shown for your information. Your login email is not affected by your correspondence preference. To change your preferred correspondence email, please contact Ordift.
      </p>
    </section>
  );
}
