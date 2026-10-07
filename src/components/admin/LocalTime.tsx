"use client";

// Renders an ISO instant in the VIEWER's own timezone (never a fixed
// zone). The server pass can only know UTC, so the browser re-renders
// the same instant locally; suppressHydrationWarning marks that
// difference as intentional.
export default function LocalTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const text = Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}
