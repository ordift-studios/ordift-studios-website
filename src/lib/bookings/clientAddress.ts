// WHERE A CLIENT BOOKING NOTICE MAY GO (pure). Booking details (date, place) are only ever e-mailed to an address the system can stand behind:
//   1. the project has a PORTAL OWNER (the client claimed it through the verified link-and-code process, or signed up from a website enquiry): the notice goes to THAT ACCOUNT'S confirmed login address,
//      never to the e-mail typed on the enquiry (which for a staff-recorded enquiry is unverified, possibly shared or wrong). If the account address is unconfirmed or cannot be read, nothing is sent (fail closed): no fall-back.
//   2. no owner, enquiry came from the public website form (the client typed it themselves; the same address already receives the quotation and payment e-mails): the typed address, as the established policy has it.
//   3. no owner, recorded by staff (WhatsApp, telephone, e-mail, in person): NOTHING is sent automatically. Staff deliver the message themselves and record it (or invite the client to claim the project).
export type AddressInput = { hasOwner: boolean; ownerEmail: string | null; ownerConfirmed: boolean; ownerLookupFailed?: boolean; enquiryEmail: string | null; enquiryEmailIsPlaceholder: boolean; suppressed: boolean };
export type AddressDecision = { send: true; to: string; via: "portal_account" | "enquiry_email" } | { send: false; reason: "no_email" | "suppressed" | "account_unconfirmed" | "account_lookup_failed" };

export function chooseClientAddress(i: AddressInput): AddressDecision {
  if (i.hasOwner) {
    if (i.ownerLookupFailed) return { send: false, reason: "account_lookup_failed" };
    if (!i.ownerEmail || !i.ownerConfirmed) return { send: false, reason: "account_unconfirmed" };
    return { send: true, to: i.ownerEmail, via: "portal_account" };
  }
  if (!i.enquiryEmail || i.enquiryEmailIsPlaceholder) return { send: false, reason: "no_email" };
  if (i.suppressed) return { send: false, reason: "suppressed" };
  return { send: true, to: i.enquiryEmail, via: "enquiry_email" };
}

export const SKIP_TEXT: Record<string, string> = {
  suppressed: "Not e-mailed: recorded by staff and not yet linked to the client's verified portal account. Tell the client yourself (use the message below) and record it, or invite them to claim the project in the portal.",
  no_email: "Not e-mailed: no e-mail address on file. Tell the client yourself and record it.",
  account_unconfirmed: "Not e-mailed: the client's portal account has no confirmed e-mail address. Tell the client yourself and record it.",
  account_lookup_failed: "Not e-mailed: the client's portal account address could not be read just now. Retry, or tell the client yourself and record it.",
  superseded: "Not sent: the booking has changed since, and this message would be out of date.",
  no_recipients: "Not sent: no eligible recipient.", not_eligible: "Not sent: this person is not an active team member with an internal role, or has switched this notice off.",
};
