// Safely asks Cloudflare Turnstile for a fresh challenge in an existing widget.
//
// ROOT CAUSE this exists for (verified live on /portal/login, 2026-10-11): the widget used to call
// `window.turnstile.reset("<container id>")` with a bare id string. Turnstile treats a string as a
// widget id or CSS selector, so a plain id matches nothing and THROWS
// "[Cloudflare Turnstile] Nothing to reset found for provided container." Called from a React
// effect after a failed sign-in, that exception aborted the reset (leaving the spent token in place)
// and could take the form down with it — the "I'm not a robot disappears until I refresh" symptom.
// Passing the container ELEMENT works, and this wrapper never lets a reset failure throw.
export type TurnstileLike = { reset: (idOrContainer?: string | HTMLElement) => void };

export function resetTurnstile(
  containerId: string,
  env: { doc?: Pick<Document, "getElementById">; api?: TurnstileLike } = {}
): boolean {
  const doc = env.doc ?? (typeof document !== "undefined" ? document : undefined);
  const api = env.api ?? (typeof window !== "undefined" ? (window as unknown as { turnstile?: TurnstileLike }).turnstile : undefined);
  if (!doc || !api) return false;
  const element = doc.getElementById(containerId);
  if (!element) return false;
  try {
    api.reset(element as HTMLElement);
    return true;
  } catch (error) {
    console.warn("[turnstile] reset failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}
