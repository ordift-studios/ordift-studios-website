import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { classifyEmail, normalisePhone } from "./emails";

// Client Directory — can this person be reached? Pure and import-light.
//
// A client does not need an email address to exist in the directory. Ordift takes enquiries by WhatsApp, telephone, Instagram, referral and in person,
// and a person reached that way is a real client. What a contact does need is at least one way to reach them: a valid email address OR a valid
// telephone / WhatsApp number. Email is required only where a workflow genuinely depends on it (an automatic email, a portal invitation, an
// account link by address); those actions are switched off, with a stated reason, for a contact that has none.
//
// A reserved placeholder address (enquiries.email is NOT NULL, so an enquiry recorded without one carries '<reference>@no-email.invalid') is NOT an
// address. It is never copied into the directory.

// The addresses on a record that are real. A placeholder, an empty string and a value that is not an address are all dropped here, so a record that
// has no email is simply a record with no emails, and nothing downstream has to know the placeholder exists.
export function realEmailsOf(raw: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    if (!r || !r.trim() || isPlaceholderEmail(r)) continue;
    out.push(r.trim());
  }
  return out;
}

export function realPhonesOf(raw: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    if (!r || !r.trim()) continue;
    out.push(r.trim());
  }
  return out;
}

// Typed by a person into a form: a placeholder is refused with a clear reason instead of the generic "not a valid email".
export const PLACEHOLDER_EMAIL_ERROR = "That is a reserved placeholder, not a real email address. Leave the email empty if the client has not given one.";

export const MINIMUM_CONTACT_ERROR = "Enter at least one way to reach this person: a valid email address, or a telephone / WhatsApp number.";

// Creating a contact: at least one VALID email or phone. Returns null when it is fine.
export function minimumContactError(emails: string[], phones: string[]): string | null {
  const hasEmail = emails.some((e) => classifyEmail(e) !== null);
  const hasPhone = phones.some((p) => normalisePhone(p) !== null);
  return hasEmail || hasPhone ? null : MINIMUM_CONTACT_ERROR;
}

// Changing a contact: refuse only a change that would take away the LAST way to reach someone who could be reached before. A legacy contact that
// already had neither is not blocked from unrelated edits.
export function wouldLoseLastWayToReach(before: { activeEmails: number; phones: number }, after: { activeEmails: number; phones: number }): boolean {
  return before.activeEmails + before.phones > 0 && after.activeEmails + after.phones === 0;
}

export const LAST_WAY_TO_REACH_ERROR = "This would remove the only way to reach this person. Add an email address or a telephone / WhatsApp number first.";

export type ChannelState = { available: boolean; reason: string | null };

export type ContactChannelSummary = {
  primaryEmail: string | null;
  emailLabel: string;
  phoneLabel: string;
  email: ChannelState;
  phoneOrWhatsApp: ChannelState;
  automaticEmail: ChannelState;
  portalInvitation: ChannelState;
  accountLinkSuggestion: ChannelState;
};

export const EMAIL_NOT_PROVIDED = "Email not provided";

// What can and cannot be done for a contact, and why, so the screen can switch email-dependent actions off with an explanation rather than hide them.
// "portalInvitation" and "automaticEmail" need a PERSONAL address; a contact that holds only a shared mailbox is not invited to a personal account.
export function summariseContactChannels(c: { emails: { email: string; isPrimary: boolean; isShared: boolean; removed: boolean }[]; phones: string[]; profileLinked: boolean }): ContactChannelSummary {
  const active = c.emails.filter((e) => !e.removed);
  const primary = active.find((e) => e.isPrimary) ?? active[0] ?? null;
  const personal = active.filter((e) => !e.isShared);
  const noEmail = "No email address is on file for this contact.";
  const phones = c.phones.filter((p) => normalisePhone(p) !== null);
  return {
    primaryEmail: primary?.email ?? null,
    emailLabel: primary?.email ?? EMAIL_NOT_PROVIDED,
    phoneLabel: phones[0] ?? "Phone / WhatsApp not provided",
    email: { available: active.length > 0, reason: active.length > 0 ? null : noEmail },
    phoneOrWhatsApp: { available: phones.length > 0, reason: phones.length > 0 ? null : "No telephone or WhatsApp number is on file for this contact." },
    automaticEmail: { available: active.length > 0, reason: active.length > 0 ? null : `${noEmail} Automatic emails cannot be sent. Contact them by telephone or WhatsApp, or add an email address.` },
    portalInvitation: c.profileLinked
      ? { available: false, reason: "Already linked to a portal account." }
      : personal.length > 0
        ? { available: true, reason: null }
        : { available: false, reason: active.length > 0 ? "Only a shared mailbox is on file. A portal account needs a personal email address." : `${noEmail} A portal account needs a personal email address.` },
    accountLinkSuggestion: personal.length > 0 ? { available: true, reason: null } : { available: false, reason: "Accounts are matched by personal email address, and this contact has none." },
  };
}
