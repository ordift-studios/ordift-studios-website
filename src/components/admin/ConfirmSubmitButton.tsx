"use client";

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
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
