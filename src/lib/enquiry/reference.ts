import { randomInt } from "crypto";

// Format: ORD-YYYYMMDD-XXXX (4 random digits). Human-readable enough to
// quote back over email/WhatsApp, sortable by date, no PII embedded.
export function generateReferenceNumber(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");
  return `ORD-${y}${m}${d}-${suffix}`;
}
