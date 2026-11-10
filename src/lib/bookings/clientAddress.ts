// WHERE A CLIENT BOOKING NOTICE MAY GO (pure). Booking details (date, place) are only ever e-mailed to an address the system can stand behind:
//   1. the project has a PORTAL OWNER (the client claimed it through the verified link-and-code process, or signed up from a website enquiry): the notice goes to THAT ACCOUNT'S confirmed login address,
//      never to the e-mail typed on the enquiry (which for a staff-recorded enquiry is unverified, possibly shared or wrong). If the account address is unconfirmed or cannot be read, nothing is sent (fail closed): no fall-back.
//   2. no owner, enquiry came from the public website form: the typed address is NOT proof the person controls it (anyone can type any address into a form), so NOTHING with booking details is e-mailed to it. The ordinary enquiry acknowledgement and the quotation e-mails are a different matter and are unchanged.
//      (PROPOSED, not built: a one-time e-mail verification link that proves the mailbox without registration: see PROPOSAL_website_enquiry_contact_verification.md.)
//   3. no owner, recorded by staff (WhatsApp, telephone, e-mail, in person): NOTHING is sent automatically (whatever the enquiry's e-mail-suppression setting says: that setting governs quotation and payment e-mails, booking details need the verified route). Staff deliver the message themselves and record it (or invite the client to claim the project).
export type AddressInput = { hasOwner: boolean; ownerEmail: string | null; ownerConfirmed: boolean; ownerLookupFailed?: boolean; enquiryEmail: string | null; enquiryEmailIsPlaceholder: boolean; suppressed: boolean; staffRecorded?: boolean };
export type AddressDecision = { send: true; to: string; via: "portal_account" } | { send: false; reason: "no_email" | "suppressed" | "unverified_address" | "account_unconfirmed" | "account_lookup_failed" };

export function chooseClientAddress(i: AddressInput): AddressDecision {
  if (i.hasOwner) {
    if (i.ownerLookupFailed) return { send: false, reason: "account_lookup_failed" };
    if (!i.ownerEmail || !i.ownerConfirmed) return { send: false, reason: "account_unconfirmed" };
    return { send: true, to: i.ownerEmail, via: "portal_account" };
  }
  if (!i.enquiryEmail || i.enquiryEmailIsPlaceholder) return { send: false, reason: "no_email" };
  if (i.suppressed || i.staffRecorded) return { send: false, reason: "suppressed" };   // a STAFF-RECORDED enquiry is never auto-mailed on the typed address, even when staff allowed the lifecycle e-mails: booking details (date, place) need the verified route
  return { send: false, reason: "unverified_address" };                                  // a WEBSITE-FORM address was only typed into a form: it is not proof of anything, so booking details are not e-mailed to it either (the enquiry acknowledgement and quotation e-mails are separate and unchanged)
}

export const SKIP_TEXT: Record<string, string> = {
  unverified_address: "Not e-mailed: the address was typed on the website form and has not been verified, so booking details are not sent to it. Tell the client yourself (use the message below) and record it, or ask them to sign in to their portal account.",
  suppressed: "Not e-mailed: recorded by staff and not yet linked to the client's verified portal account. Tell the client yourself (use the message below) and record it, or invite them to claim the project in the portal.",
  no_email: "Not e-mailed: no e-mail address on file. Tell the client yourself and record it.",
  account_unconfirmed: "Not e-mailed: the client's portal account has no confirmed e-mail address. Tell the client yourself and record it.",
  account_lookup_failed: "Not e-mailed: the client's portal account address could not be read just now. Retry, or tell the client yourself and record it.",
  superseded: "Not sent: the booking has changed since, and this message would be out of date.",
  no_recipients: "Not sent: no eligible recipient.", not_eligible: "Not sent: this person is not an active team member with an internal role, or has switched this notice off.",
};
