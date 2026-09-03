"use client";

import { useFormStatus } from "react-dom";

// Engagement Lifecycle UI (2026-09-03) — a lighter confirmation than
// DeleteProjectButton's type-to-confirm pattern (src/app/admin/portfolio/
// DeleteProjectButton.tsx), appropriate here because every transition
// this guards (Approve Work, Cancel Engagement) is a status change on a
// row that is never deleted — reversible in the sense that the record
// and its full history remain, matching this schema's general
// never-delete-just-transition philosophy. A plain confirm() dialog is
// proportionate; the real authorization boundary is still server-side
// (setEngagementStatus()'s isValidEngagementTransition() check), this
// is purely a human guard-rail against an accidental click.
//
// Mutation feedback fix (2026-09-04) — now also reports pending state
// via useFormStatus(), same as SubmitButton.tsx, so a confirmed
// transition gives the same immediate disabled/aria-busy signal every
// other mutation button in this module does.
export default function ConfirmSubmitButton({
  confirmMessage,
  pendingLabel,
  className,
  children,
}: {
  confirmMessage: string;
  pendingLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-50 disabled:cursor-not-allowed`}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
