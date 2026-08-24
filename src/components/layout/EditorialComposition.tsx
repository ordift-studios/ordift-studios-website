// Ordift editorial viewport-composition primitive (2026-08-25 — see
// PULSE_INGESTION_FOUNDATION.md, Phase F). A reusable answer to a
// site-wide principle, not a one-off Journal hack: a major editorial
// section should read as a deliberately composed frame as the visitor
// scrolls — like an editorial spread — rather than an arbitrary slice of
// continuous page. This wrapper is the smallest primitive that
// establishes that without forcing every section to a rigid height:
//
// - `min-height`, never a fixed `height` — content that genuinely needs
//   more room is free to take it (a section is allowed to span more
//   than one viewport; it is never cropped or compressed to fit).
// - `100svh` (small viewport height), not `100vh` or `100dvh` — `svh`
//   assumes the browser's UI chrome (address bar, etc.) is visible and
//   stays fixed at that size, so the composition never resizes out from
//   under the visitor mid-scroll the way `dvh` can on mobile browsers
//   that show/hide chrome as you scroll. `100vh` is avoided entirely —
//   it can exceed the real visible area on mobile, which is the
//   textbook cause of "the next section's edge is already peeking in."
// - No scroll-snap — natural scrolling is preserved throughout; this
//   only ever affects a section's minimum height, never scroll behavior.
// - `center` vertically centers short content within the claimed frame
//   (the "composed spread" look) — a section already taller than one
//   viewport is completely unaffected by it either way.
export default function EditorialComposition({
  children,
  center = false,
  className = "",
}: {
  children: React.ReactNode;
  center?: boolean;
  className?: string;
}) {
  return <div className={`flex flex-col min-h-[100svh] ${center ? "justify-center" : ""} ${className}`}>{children}</div>;
}
