// CLIENT CHECKOUT FORM - pure rules (no I/O). Ordift never collects card details: card and Mobile Money payments happen on the payment provider's hosted page. The only free text a client
// can type on the checkout flow is a reference note on a bank transfer, so that note must never carry a card number, and it is bounded. These rules run in the browser (to clear the field
// and explain) and again on the server (the real check).
export const MAX_REFERENCE_NOTE = 300;
export const CARD_NUMBER_MESSAGE = "Please do not type a card number here. We never need your card details: card payments happen on the secure payment page. The note was cleared.";
export const NOTE_TOO_LONG_MESSAGE = `Keep the reference note under ${MAX_REFERENCE_NOTE} characters.`;

function luhnValid(digits: string): boolean {
  let sum = 0; let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = digits.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}
// A run of 13-19 digits (spaces or dashes between groups allowed) that passes the Luhn check is treated as a payment card number. A bank reference, an invoice number or a phone number of
// the same length that happens not to pass is allowed; this errs toward refusing a real-looking card number.
export function looksLikeCardNumber(text: string | null | undefined): boolean {
  for (const m of String(text ?? "").matchAll(/(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

export type NoteCheck = { ok: true } | { ok: false; code: "sensitive-data-in-note" | "note-too-long"; message: string; clear: boolean };
export function checkReferenceNote(note: string | null | undefined): NoteCheck {
  const t = String(note ?? "");
  if (looksLikeCardNumber(t)) return { ok: false, code: "sensitive-data-in-note", message: CARD_NUMBER_MESSAGE, clear: true };      // never kept, never echoed
  if (t.length > MAX_REFERENCE_NOTE) return { ok: false, code: "note-too-long", message: NOTE_TOO_LONG_MESSAGE, clear: false };
  return { ok: true };
}

// One request at a time: a synchronous lock the form takes BEFORE it awaits anything, so a double click or a second Enter cannot start a second request. (React state alone is not
// enough: the button only disables on the next render.)
export function createInFlightLock() {
  let busy = false;
  return { tryAcquire: () => (busy ? false : ((busy = true), true)), release: () => { busy = false; }, get busy() { return busy; } };
}
