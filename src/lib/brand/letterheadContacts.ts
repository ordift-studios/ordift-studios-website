import { PRIMARY_PUBLIC_CONTACT_EMAIL } from "@/lib/content/contactChannels";

// ONE place for the website address and the contact details printed on Ordift documents, so no template carries its own copy. Pure.
//
// Nothing here is invented. Every value is taken from something already approved, and says where from:
//   - the website: "www.ordiftstudios.com", exactly as printed in the approved Privacy Notice (OS-LGL-001, section 20);
//   - the email: enquiries@ordiftstudios.com, the approved public mailbox (src/lib/content/contactChannels.ts, the same single source of truth the public site uses), confirmed by management
//     on 4 Nov 2026 as the quotation correspondence address for both markets. The internal/legacy Gmail address the old letterhead printed is deliberately NOT used;
//   - the telephone numbers: +974 5510 4490 (Qatar) and +233 504 981 277 (Ghana), published in the approved Privacy Notice and confirmed by management on 4 Nov 2026 for these documents.
//   No WhatsApp number is printed (management decision, 4 Nov 2026).
// `status` records how firmly each value is established, so a reviewer can see what still needs their confirmation. A value with no approved source is simply absent, never guessed.

export const WEBSITE_DOMAIN = "ordiftstudios.com";
export const WEBSITE_DISPLAY = `www.${WEBSITE_DOMAIN}`;

export type ContactStatus =
  | "approved_public_mailbox"                // an approved functional mailbox in the public contact-channel configuration, confirmed by management for quotations
  | "confirmed_by_management";               // published in an approved legal document and confirmed by management for quotation documents (4 Nov 2026)
export type ContactValue = { value: string; status: ContactStatus; source: string };
export type LetterheadContacts = { jurisdiction: string; email: ContactValue; phone: ContactValue | null; website: ContactValue };

const WEBSITE: ContactValue = { value: WEBSITE_DISPLAY, status: "confirmed_by_management", source: "Privacy Notice OS-LGL-001, section 20 (Contact Information)" };
const EMAIL: ContactValue = { value: PRIMARY_PUBLIC_CONTACT_EMAIL, status: "approved_public_mailbox", source: "src/lib/content/contactChannels.ts (PRIMARY_PUBLIC_CONTACT_EMAIL)" };
const PRIVACY_NOTICE = "Privacy Notice OS-LGL-001, section 20 (Telephone); confirmed by management 4 Nov 2026";

// Keyed by the jurisdiction of the CONTRACTING ENTITY (the entity's own record), never by the client's location or currency.
export const LETTERHEAD_CONTACTS: Record<string, LetterheadContacts> = {
  Qatar: { jurisdiction: "Qatar", email: EMAIL, phone: { value: "+974 5510 4490", status: "confirmed_by_management", source: PRIVACY_NOTICE }, website: WEBSITE },
  Ghana: { jurisdiction: "Ghana", email: EMAIL, phone: { value: "+233 504 981 277", status: "confirmed_by_management", source: PRIVACY_NOTICE }, website: WEBSITE },
};

// For an entity in a jurisdiction with no configured contacts, only what is true for every entity is shown (the website and the public mailbox); no telephone is guessed.
export function contactsFor(jurisdiction: string | null | undefined): LetterheadContacts {
  return (jurisdiction && LETTERHEAD_CONTACTS[jurisdiction]) || { jurisdiction: jurisdiction ?? "", email: EMAIL, phone: null, website: WEBSITE };
}

// ---- the contact details AS PRINTED, in a form that can be frozen at issue.
// When a quotation is issued, this snapshot is written into the quotation's issuance audit event (the database's append-only, forgery-protected record) so a PDF regenerated later prints the
// contact details the quotation was issued with, even if this configuration has since changed. Plain strings only: no source notes or statuses, nothing that is not printed.
export const CONTACT_SNAPSHOT_VERSION = 1;
export type ContactSnapshot = { version: number; jurisdiction: string | null; email: string; phone: string | null; website: string };

export function snapshotContacts(c: LetterheadContacts): ContactSnapshot {
  return { version: CONTACT_SNAPSHOT_VERSION, jurisdiction: c.jurisdiction || null, email: c.email.value, phone: c.phone?.value ?? null, website: c.website.value };
}

// Reads a snapshot back from stored audit metadata, accepting only well-formed plain strings (anything else is treated as "no snapshot", never partially trusted).
export function parseContactSnapshot(raw: unknown): ContactSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 120): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
  if (r.version !== CONTACT_SNAPSHOT_VERSION || !str(r.email) || !str(r.website)) return null;
  if (r.phone !== null && r.phone !== undefined && !str(r.phone)) return null;
  if (r.jurisdiction !== null && r.jurisdiction !== undefined && !str(r.jurisdiction)) return null;
  return { version: CONTACT_SNAPSHOT_VERSION, jurisdiction: (r.jurisdiction as string | null | undefined) ?? null, email: r.email, phone: (r.phone as string | null | undefined) ?? null, website: r.website };
}

export type FooterColumn = { icon: "email" | "phone" | "web"; lines: string[] };
export function footerColumns(c: ContactSnapshot): FooterColumn[] {
  return [
    { icon: "email" as const, lines: [c.email] },
    ...(c.phone ? [{ icon: "phone" as const, lines: [c.phone] }] : []),
    { icon: "web" as const, lines: [c.website] },
  ];
}
