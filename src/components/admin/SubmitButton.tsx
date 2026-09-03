"use client";

import { useFormStatus } from "react-dom";

// Mutation feedback fix (2026-09-04) — root-caused after a real
// Production Add Payee submission gave the administrator zero visible
// signal that anything had happened, even though it had actually
// succeeded (see the investigation this fix responds to). This is the
// baseline fix applied across every genuine mutation button in the
// Payables admin UI: useFormStatus() reports pending state for the
// nearest enclosing <form>, so every submit button in this module
// switches to a clear pending label and becomes non-interactive
// (disabled + aria-busy) the instant it's pressed — the same signal,
// reused everywhere, rather than a bespoke loading flag per form.
// This alone is real double-submission protection: a disabled button
// cannot be clicked again while its own request is in flight.
export default function SubmitButton({
  pendingLabel,
  className,
  children,
}: {
  pendingLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:opacity-50 disabled:cursor-not-allowed`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
