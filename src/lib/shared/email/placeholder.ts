// Placeholder address for an enquiry recorded by staff from a channel where the client gave no email address (for example a WhatsApp conversation).
//
// enquiries.email is mandatory and is read by many existing screens and flows, so an enquiry with no real address carries a reserved placeholder instead of
// a null. The `.invalid` top-level domain is reserved (RFC 2606) and can never be a real mailbox. Nothing may be sent to it: the shared email dispatcher
// refuses it, the directory ignores it, and screens show "No email on file". Pure and import-free.

export const PLACEHOLDER_EMAIL_DOMAIN = "no-email.invalid";

export function placeholderEmailFor(reference: string): string {
  const local = reference.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `${local || "enquiry"}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return domain === PLACEHOLDER_EMAIL_DOMAIN || domain.endsWith(".invalid");
}

export function displayEmail(email: string | null | undefined): string {
  return !email || isPlaceholderEmail(email) ? "No email on file" : email;
}
