import { isPathwayValue } from "./pathways";
import { normaliseEmail, normalisePhone } from "@/lib/directory/emails";

// Staff-recorded enquiries (M1) — validation for an enquiry a staff member records from a channel other than the website form. Pure.
//
// The website form is unchanged. This only decides whether a hand-recorded enquiry is complete and normalises it; it sends nothing, creates no quotation,
// amount, payment or booking, and the enquiry starts at the same first stage as any other.

export const INTAKE_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp / message" },
  { value: "telephone", label: "Telephone" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
] as const;
export type IntakeChannel = (typeof INTAKE_CHANNELS)[number]["value"];

export function isIntakeChannel(v: string): v is IntakeChannel {
  return INTAKE_CHANNELS.some((c) => c.value === v);
}

export function channelLabel(v: string | null | undefined): string {
  if (!v) return "Website form (or recorded before channels were tracked)";
  if (v === "website") return "Website form";
  return INTAKE_CHANNELS.find((c) => c.value === v)?.label ?? v;
}

export type StaffEnquiryInput = {
  service: string;
  channel: string;
  receivedAt: string; // ISO instant or a datetime-local value
  fullName: string;
  email: string;
  phone: string;
  details: string;
  allowStatusEmails: boolean;
  now: Date;
};

export type StaffEnquiryValue = {
  service: string;
  channel: IntakeChannel;
  receivedAtIso: string;
  fullName: string;
  email: string | null; // null = no real address; the service stores the reserved placeholder
  phone: string | null;
  details: string | null;
  suppressEmails: boolean;
};

const MAX_AGE_MS = 366 * 24 * 3600 * 1000;

export function validateStaffEnquiry(input: StaffEnquiryInput): { ok: true; value: StaffEnquiryValue } | { ok: false; error: string } {
  if (!isPathwayValue(input.service)) return { ok: false, error: "Choose the service the client asked about. Creative Crew Support requests are recorded in Crew Support, not here." };
  if (!isIntakeChannel(input.channel)) return { ok: false, error: "Choose how the enquiry reached Ordift." };
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 200) return { ok: false, error: "Enter the client's name (2 to 200 characters)." };

  const rawEmail = input.email.trim();
  const email = rawEmail ? normaliseEmail(rawEmail) : null;
  if (rawEmail && !email) return { ok: false, error: "That is not a valid email address. Leave it empty if the client gave none." };
  const rawPhone = input.phone.trim();
  const phoneDigits = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phoneDigits) return { ok: false, error: "That is not a valid phone number (7 to 15 digits)." };
  if (!email && !phoneDigits) return { ok: false, error: "Enter at least an email address or a phone number so the client can be reached." };

  const t = Date.parse(input.receivedAt);
  if (Number.isNaN(t)) return { ok: false, error: "Enter when the client made contact." };
  if (t > input.now.getTime() + 5 * 60_000) return { ok: false, error: "The contact time can't be in the future." };
  if (t < input.now.getTime() - MAX_AGE_MS) return { ok: false, error: "The contact time is more than a year ago. Check the date." };

  const details = input.details.trim();
  if (details.length > 4000) return { ok: false, error: "Keep the details under 4,000 characters." };

  return {
    ok: true,
    value: { service: input.service, channel: input.channel, receivedAtIso: new Date(t).toISOString(), fullName, email, phone: phoneDigits ? rawPhone : null, details: details || null, suppressEmails: !input.allowStatusEmails },
  };
}
