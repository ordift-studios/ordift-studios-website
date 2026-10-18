import { domainsMatch, isFreeMailDomain, normaliseOrganisationName, registrableDomain, blockingMatches, type OrganisationMatch } from "./names";
import type { ParsedApprovalEmail } from "./approvalEmail";

// How a pasted email lines up with a recorded supplier application, and what a person must do before confirming it.
// Pure. These are HINTS for a human decision: all of the evidence is text a person pasted, none of it is independently
// verified, the platform never treats an email as proof of approval, and even the best result still requires an
// administrator to attest and confirm.

export const ORDIFT_OWN_DOMAINS = ["ordiftstudios.com", "ordiftghana.com"];

// Shown wherever the checks are shown. Every fact below comes from text a person pasted, so none of it is independently verified.
export const UNVERIFIED_NOTICE =
  "Everything below is read from text a person pasted. Nothing was checked with the sending organisation or its mail system, and email headers in pasted text can be edited or invented. These are consistency checks to help you decide, not proof.";

export type SignalState = "ok" | "warn" | "bad" | "unknown";
export type ApprovalSignal = { key: SignalKey; label: string; state: SignalState; detail: string };
export type SignalKey = "sender_domain" | "reference" | "organisation_name" | "approval_wording" | "authentication" | "date";
export type MatchLevel = "strong" | "review" | "weak";

export type ApplicationForMatching = {
  reference: string | null;
  organisationName: string;
  contactDomain: string | null;
  submittedOn: string; // YYYY-MM-DD
  linkedOrganisation: { name: string; primaryDomain: string | null } | null;
};

const APPROVAL_WORDING = /\b(approved|approval|accepted|successfully (registered|onboarded|enrolled)|added to (our |the )?(approved |preferred )?(vendor|supplier)|(you|your company|your application) (has |have |is |are )?(now )?(been )?(approved|registered|onboarded|accepted)|congratulations)\b/i;
const NEGATIVE_WORDING = /\b(unsuccessful|not (been )?(approved|accepted)|declined|rejected|regret to|unable to (approve|accept)|incomplete|additional (information|documents?) (is |are )?(required|needed)|further documentation|pending (review|approval)|awaiting (approval|review))\b/i;

function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function assessApproval(application: ApplicationForMatching, email: ParsedApprovalEmail): { signals: ApprovalSignal[]; level: MatchLevel } {
  const haystack = `${email.subject ?? ""}\n${email.bodyText}`;
  const signals: ApprovalSignal[] = [];

  // 1. Sender domain against the domain recorded for this application / organisation.
  const expected = application.contactDomain ?? application.linkedOrganisation?.primaryDomain ?? null;
  if (!email.senderDomain) {
    signals.push({ key: "sender_domain", label: "Sender domain", state: "unknown", detail: "The sender could not be read. Paste the full email including its headers, or type the sender's address." });
  } else if (isFreeMailDomain(email.senderDomain)) {
    signals.push({ key: "sender_domain", label: "Sender domain", state: "bad", detail: `Sent from a free mailbox provider (${registrableDomain(email.senderDomain)}), which does not show which organisation wrote it.` });
  } else if (!expected) {
    signals.push({ key: "sender_domain", label: "Sender domain", state: "warn", detail: `Sent from ${registrableDomain(email.senderDomain)}. No expected domain is recorded for this application, so nothing to compare against.` });
  } else if (domainsMatch(email.senderDomain, expected)) {
    signals.push({ key: "sender_domain", label: "Sender domain", state: "ok", detail: `Sent from ${registrableDomain(email.senderDomain)}, matching the recorded domain.` });
  } else {
    signals.push({ key: "sender_domain", label: "Sender domain", state: "bad", detail: `Sent from ${registrableDomain(email.senderDomain)}, but the recorded domain is ${registrableDomain(expected)}.` });
  }

  // 2. Application reference.
  if (!application.reference) {
    signals.push({ key: "reference", label: "Application reference", state: "unknown", detail: "No reference was recorded for this application." });
  } else if (alnum(application.reference).length >= 3 && alnum(haystack).includes(alnum(application.reference))) {
    signals.push({ key: "reference", label: "Application reference", state: "ok", detail: "The recorded reference appears in the email." });
  } else {
    signals.push({ key: "reference", label: "Application reference", state: "warn", detail: "The recorded reference does not appear in the email." });
  }

  // 3. Organisation name.
  const wantedName = normaliseOrganisationName(application.organisationName);
  const haystackName = normaliseOrganisationName(haystack);
  if (wantedName && ` ${haystackName} `.includes(` ${wantedName} `)) {
    signals.push({ key: "organisation_name", label: "Organisation name", state: "ok", detail: "The organisation's name appears in the email." });
  } else {
    signals.push({ key: "organisation_name", label: "Organisation name", state: "warn", detail: "The organisation's name does not appear in the email." });
  }

  // 4. Approval wording (a keyword hint only; a person reads the email).
  const positive = APPROVAL_WORDING.test(haystack);
  const negative = NEGATIVE_WORDING.test(haystack);
  if (positive && !negative) signals.push({ key: "approval_wording", label: "Approval wording", state: "ok", detail: "The email contains wording that suggests approval. Read it to be sure." });
  else if (positive && negative) signals.push({ key: "approval_wording", label: "Approval wording", state: "warn", detail: "The email mixes approval wording with wording that suggests a condition, a delay or a refusal. Read it carefully." });
  else if (negative) signals.push({ key: "approval_wording", label: "Approval wording", state: "bad", detail: "The email contains wording that suggests it is NOT an approval." });
  else signals.push({ key: "approval_wording", label: "Approval wording", state: "warn", detail: "No clear approval wording was found." });

  // 5. Authentication results AS PASTED. The receiving server's verdicts are only as trustworthy as the person-supplied text they
  //    were read from, so every branch says so.
  const AUTH_LABEL = "Sender authentication (as pasted, not independently verified)";
  if (!email.hasHeaders || email.senderFromForward) {
    signals.push({ key: "authentication", label: AUTH_LABEL, state: "unknown", detail: email.senderFromForward ? "The email was pasted as a forward, so no authentication results for the original message are available." : "No headers were pasted, so there are no authentication results to read." });
  } else if (email.spf === "fail" || email.dkim === "fail" || email.dmarc === "fail") {
    signals.push({ key: "authentication", label: AUTH_LABEL, state: "bad", detail: `The pasted headers report a failure (SPF ${email.spf}, DKIM ${email.dkim}, DMARC ${email.dmarc}).` });
  } else if (email.dmarc === "pass" || email.dkimAligned) {
    signals.push({ key: "authentication", label: AUTH_LABEL, state: "ok", detail: `The pasted headers report a pass for the sender's own domain (SPF ${email.spf}, DKIM ${email.dkim}, DMARC ${email.dmarc}). This was read from pasted text and has not been verified; headers can be edited.` });
  } else {
    signals.push({ key: "authentication", label: AUTH_LABEL, state: "warn", detail: `The pasted headers do not show that the sender's own domain signed the message (SPF ${email.spf}, DKIM ${email.dkim}, DMARC ${email.dmarc}). Not independently verified.` });
  }

  // 6. Date: an approval cannot predate the application it approves.
  if (!email.sentOn) signals.push({ key: "date", label: "Date", state: "unknown", detail: "The email's date could not be read." });
  else if (email.sentOn < application.submittedOn) signals.push({ key: "date", label: "Date", state: "bad", detail: `The email is dated ${email.sentOn}, before the application was submitted on ${application.submittedOn}.` });
  else signals.push({ key: "date", label: "Date", state: "ok", detail: `Dated ${email.sentOn}, after the application was submitted.` });

  return { signals, level: levelOf(signals) };
}

function stateOf(signals: ApprovalSignal[], key: SignalKey): SignalState {
  return signals.find((s) => s.key === key)?.state ?? "unknown";
}

export function levelOf(signals: ApprovalSignal[]): MatchLevel {
  const domain = stateOf(signals, "sender_domain");
  const reference = stateOf(signals, "reference");
  const name = stateOf(signals, "organisation_name");
  const wording = stateOf(signals, "approval_wording");
  const auth = stateOf(signals, "authentication");
  const date = stateOf(signals, "date");
  const anyBad = [domain, wording, auth, date].includes("bad");
  if (anyBad) return "weak";
  if (domain === "ok" && (reference === "ok" || name === "ok") && wording === "ok" && auth !== "bad" && date !== "bad") return "strong";
  if (domain !== "ok" && reference !== "ok") return "weak";
  return "review";
}

// A person always attests before an approval is recorded; no match level, however good, approves anything on its own.
export function confirmationRequirements(level: MatchLevel): { acknowledgement: boolean; noteRequired: boolean } {
  return { acknowledgement: true, noteRequired: level === "weak" };
}

// ---- Choosing the organisation at confirmation ---------------------------------------------------------------------

export type ConfirmationInput = {
  level: MatchLevel;
  organisationChoice: { kind: "existing"; organisationId: string } | { kind: "new"; name: string; domain: string | null };
  // Matches the person was shown for the proposed name/domain (computed server-side from the live directory).
  matchesForNew: OrganisationMatch[];
  acknowledgedReview: boolean;
  confirmedDistinct: boolean; // "this is a different organisation from the matches shown"
  note: string;
};

export type ConfirmationPlan = { ok: true; mode: "link_existing" | "create_new" } | { ok: false; error: string };

export function planConfirmation(input: ConfirmationInput): ConfirmationPlan {
  const need = confirmationRequirements(input.level);
  if (need.acknowledgement && !input.acknowledgedReview) {
    return { ok: false, error: "Tick the box to confirm you have read the email and decided that it is a genuine approval. The checks are not proof." };
  }
  if (need.noteRequired && input.note.trim().length < 10) {
    return { ok: false, error: "Add a note (at least 10 characters) saying how the approval was verified." };
  }
  if (input.organisationChoice.kind === "existing") {
    if (!input.organisationChoice.organisationId) return { ok: false, error: "Choose the organisation." };
    return { ok: true, mode: "link_existing" };
  }
  if (!input.organisationChoice.name.trim()) return { ok: false, error: "Enter the organisation's name." };
  const blockers = blockingMatches(input.matchesForNew);
  if (blockers.length > 0 && !input.confirmedDistinct) {
    const exact = blockers.some((m) => m.strength === "exact");
    return {
      ok: false,
      error: exact
        ? `An organisation called "${blockers[0].organisation.name}" is already registered. Choose it instead of creating a new one.`
        : `"${blockers[0].organisation.name}" looks like the same organisation. Choose it, or tick the box to confirm this is a different organisation.`,
    };
  }
  // An exact name can never be created twice, even with the box ticked (the database refuses it as well).
  if (blockers.some((m) => m.strength === "exact")) {
    return { ok: false, error: `An organisation called "${blockers[0].organisation.name}" is already registered. Choose it instead of creating a new one.` };
  }
  return { ok: true, mode: "create_new" };
}

// ---- Relationship record -----------------------------------------------------------------------------------------

export type RelationshipState = { status: "prospect" | "approved" | "inactive"; approvedAt: string | null } | null;
export type RelationshipWrite = { action: "insert" | "update"; status: "approved"; approvedAt: string };

// A client relationship is created or moved to approved. An already-approved relationship keeps its ORIGINAL approval
// date, so a later approval email never rewrites history; it only points the record at the latest application.
export function relationshipWrite(existing: RelationshipState, nowIso: string): RelationshipWrite {
  if (!existing) return { action: "insert", status: "approved", approvedAt: nowIso };
  if (existing.status === "approved" && existing.approvedAt) return { action: "update", status: "approved", approvedAt: existing.approvedAt };
  return { action: "update", status: "approved", approvedAt: nowIso };
}
