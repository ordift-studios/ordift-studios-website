import { randomInt } from "crypto";

// Format: WKS-YYYYMMDD-XXXX — same shape as enquiry references
// (ORD-...) but a distinct prefix so the two are never confused when
// quoted back to someone over email/WhatsApp.
export function generateRegistrationReference(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");
  return `WKS-${y}${m}${d}-${suffix}`;
}
