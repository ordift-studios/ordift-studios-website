import type { ContactEmailsView } from "@/lib/organization/correspondenceEmail";

// The two emails, kept visibly apart (read-only). Shown only to people the caller has already authorized (loadContactEmailsForViewer returns null otherwise).
//   Account Email — Used for Login: the Supabase Auth email. Never editable here. Login, password reset and signing links use it.
//   Preferred Correspondence Email — Used for Communication: what the person asked Ordift to use for ordinary correspondence (unverified).
const dateOf = (iso: string) => iso.slice(0, 10);

export function ContactEmailLines({ view }: { view: ContactEmailsView }) {
  return (
    <div className="space-y-1">
      <p className="font-sans text-body-small text-ordift-ink-muted">Account Email — Used for Login: <span className="text-ordift-ink">{view.accountEmail ?? "—"}</span></p>
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Preferred Correspondence Email — Used for Communication:{" "}
        <span className="text-ordift-ink">{view.preferred ? view.preferred.email : view.available ? "Not recorded (the account email is used)" : "Not available yet"}</span>
      </p>
      {view.preferred && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Unverified · {view.preferred.sourceLabel} · recorded {dateOf(view.preferred.recordedAt)}{view.preferred.recordedByName ? ` by ${view.preferred.recordedByName}` : ""}
        </p>
      )}
    </div>
  );
}
