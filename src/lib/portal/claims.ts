import { createHash, randomBytes, randomInt } from "node:crypto";

// PORTAL CLAIMS - pure rules (no database, no network). How a staff-recorded enquiry becomes the property of a client's own portal account: staff issues a one-time link and a 6-digit code (stored only as
// hashes), the client opens the link while signed in to THEIR OWN account and types the code. Nothing is ever matched on an email address or a telephone number. See PROPOSAL_portal_claims.sql.
export const CLAIM_CHANNELS = ["whatsapp", "telephone", "email", "in_person", "other"] as const;
export type ClaimChannel = (typeof CLAIM_CHANNELS)[number];
export const CHANNEL_LABELS: Record<ClaimChannel, string> = { whatsapp: "WhatsApp message", telephone: "Telephone call", email: "Email", in_person: "In person", other: "Another way" };
export const DEFAULT_EXPIRY_DAYS = 3;
export const MAX_EXPIRY_DAYS = 14;
export const MAX_ATTEMPTS = 5;

export const newToken = (): string => randomBytes(32).toString("base64url");
export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
export const hashToken = (token: string): string => sha256(token);
export const hashCode = (token: string, code: string): string => sha256(`${token}:${code}`);

export function normaliseCode(input: string | null | undefined): string | null {
  const c = String(input ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}
export const isPlausibleToken = (t: string | null | undefined): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
export const claimUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/portal/claim/${token}`;
export const isClaimChannel = (c: string): c is ClaimChannel => (CLAIM_CHANNELS as readonly string[]).includes(c);
export const clampExpiryDays = (d: number) => (Number.isFinite(d) ? Math.min(Math.max(Math.round(d), 1), MAX_EXPIRY_DAYS) : DEFAULT_EXPIRY_DAYS);

// ---- Risk: a reason to be more careful about HOW the invitation is delivered. Never a reason to link anything automatically.
export type RiskFacts = { email: string | null; emailIsPlaceholder: boolean; emailIsSharedInDirectory: boolean; otherEnquiriesWithEmail: number; emailAlreadyOwnedByAnAccount: boolean; hasDirectoryContact: boolean };
export type Risk = { level: "normal" | "elevated"; reasons: string[] };
export function assessClaimRisk(f: RiskFacts): Risk {
  const reasons: string[] = [];
  if (f.emailIsPlaceholder || !f.email) reasons.push("There is no real email address on this record, so nothing can be confirmed by email. Deliver the link in person, by telephone or on a number you have already spoken to.");
  if (f.emailIsSharedInDirectory) reasons.push("The email address on this record is marked as a SHARED mailbox (for example info@ or bookings@). Anyone with access to it could receive an emailed link, so give the CODE by voice or in person, never in the same message.");
  if (f.otherEnquiriesWithEmail > 0) reasons.push(`${f.otherEnquiriesWithEmail} other record(s) use the same email address. They may be the same person or a different one: confirm who you are speaking to before you give them this project.`);
  if (f.emailAlreadyOwnedByAnAccount) reasons.push("A portal account already exists for another record with this email. It may be the same person, or a family member or colleague: do not assume. The link and code decide, not the email.");
  if (!f.hasDirectoryContact) reasons.push("This record is not yet linked to a client in the directory, so there is no second record to cross-check the person against.");
  return { level: reasons.length > 1 || f.emailIsSharedInDirectory || f.emailIsPlaceholder ? "elevated" : "normal", reasons };
}

export function deliveryAdvice(channel: ClaimChannel, level: Risk["level"]): string {
  const base = channel === "in_person" ? "Show or read the link and the code to the client while they are with you." :
    channel === "telephone" ? "Read the code to the client on the call. Send the link by message afterwards, or read it out." :
    channel === "email" ? "Email the link only. Give the 6-digit code by telephone or WhatsApp, not in the email." :
    channel === "whatsapp" ? "Send the link in the chat. Give the 6-digit code in a separate message, or better, by voice." : "Give the link and the code through the way you already communicate with the client, in two separate steps.";
  return level === "elevated" ? `${base} This record needs extra care (see the notes above): confirm you are speaking to the right person before you give the code.` : base;
}

export function invitationMessage(p: { name: string | null; reference: string; link: string }): string {
  return `Hello${p.name ? ` ${p.name.split(" ")[0]}` : ""}, this is ORDIFT STUDIOS. To see your project ${p.reference} and pay online, please open this link, sign in to (or create) your own account, and enter the 6-digit code we give you separately: ${p.link}\nThe link works once, and only for a few days. If you did not ask for this, ignore it.`;
}
export const codeMessage = (code: string) => `Your ORDIFT STUDIOS verification code is ${code}. Please do not share it with anyone else.`;

// ---- What the CLIENT is told for each outcome (never more than they need; never reveals whether a project exists)
export type ClaimOutcome = "claimed" | "already_yours" | "already_claimed" | "bad_code" | "locked" | "expired" | "revoked" | "not_found" | "not_eligible" | "already_owned" | "rate_limited" | "invalid_input";
export function clientMessage(outcome: ClaimOutcome, attemptsLeft?: number, reason?: string): string {
  switch (outcome) {
    case "claimed": case "already_yours": return "Your project is now linked to your account.";
    case "bad_code": return `That code isn't right. You have ${attemptsLeft ?? 0} ${attemptsLeft === 1 ? "try" : "tries"} left.`;
    case "locked": return "Too many wrong codes, so this link is now locked. Ask ORDIFT STUDIOS for a new one.";
    case "not_eligible": return reason === "staff_account" ? "This is a staff account. A client's project can only be claimed from the client's own account: sign out and sign in as the client." : "This account can't claim a project right now. Contact ORDIFT STUDIOS.";
    case "rate_limited": return "Too many attempts. Please wait a few minutes and try again.";
    case "invalid_input": return "Enter the 6-digit code you were given.";
    default: return "This link is no longer valid. Ask ORDIFT STUDIOS for a new one.";            // not_found, expired, revoked, already_claimed, already_owned: all look the same to a stranger
  }
}
