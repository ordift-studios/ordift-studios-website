// Validation of what a payment provider returned when a checkout session was created. The adapter already throws on an HTTP or provider error; this refuses an answer that "succeeded" but cannot be
// used safely: a missing or malformed provider reference (a later webhook could not be matched to the payment) or a checkout address that is not a secure web address (the customer would be sent
// somewhere unexpected). Pure; no I/O.
export type ChargeValidation = { ok: true } | { ok: false; reason: "missing_reference" | "bad_reference" | "bad_checkout_url" };
const MAX_REFERENCE = 200;

export function validateChargeResult(charge: { checkoutUrl?: unknown; providerReference?: unknown } | null | undefined): ChargeValidation {
  const ref = charge?.providerReference;
  if (typeof ref !== "string" || ref.trim() === "") return { ok: false, reason: "missing_reference" };
  if (ref !== ref.trim() || ref.length > MAX_REFERENCE || /[\s\u0000-\u001f]/.test(ref)) return { ok: false, reason: "bad_reference" };
  const url = charge?.checkoutUrl;
  if (typeof url !== "string") return { ok: false, reason: "bad_checkout_url" };
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return { ok: false, reason: "bad_checkout_url" };
  } catch { return { ok: false, reason: "bad_checkout_url" }; }
  return { ok: true };
}
