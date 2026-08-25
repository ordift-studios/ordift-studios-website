// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part B (2026-08-25) — corporate staff email/digital identity
// generation. Pure, deterministic, no I/O — collision checking against
// already-reserved addresses is the caller's job (see
// src/lib/organization/reserveCorporateIdentity.ts), passed in here as
// a plain predicate so this module stays fully unit-testable without a
// database.
//
// Canonical new-staff domain — ordiftstudios.com, the primary
// international brand domain. Existing historical ordiftghana.com
// addresses (if any) are untouched by this module entirely; this only
// ever generates NEW ordiftstudios.com identities.
export const ORDIFT_STAFF_EMAIL_DOMAIN = "ordiftstudios.com";

// Lowercase, strip diacritics, strip everything but a-z — handles
// hyphenated/compound names (e.g. "Smith-Jones" -> "smithjones") and
// spaced compound surnames the same deterministic way: concatenated,
// never dropped, never randomly re-ordered.
function normalizeNamePart(part: string): string {
  return part
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function initial(part: string): string {
  const normalized = normalizeNamePart(part);
  return normalized.length > 0 ? normalized[0] : "";
}

export type CorporateEmailNameInput = {
  // Legal/preferred onboarding first name — required.
  firstName: string;
  // Already-registered middle name(s), used in the PRIMARY candidate
  // (e.g. "Michael Kwame Dadson"'s "Kwame") — per the approved naming
  // rule, these are always included, not held back for collision use.
  middleNames?: string[];
  surname: string;
  // Extra verified given/day names available ONLY for collision
  // resolution (e.g. a Ghanaian day name), tried one at a time, in the
  // order given, only when the primary candidate collides. Never
  // invented — the caller must only pass names actually present in the
  // person's verified onboarding identity data (Part B's explicit
  // instruction: "Do NOT invent a middle name/day name").
  additionalVerifiedNames?: string[];
};

export type CorporateEmailCandidate = {
  localPart: string;
  // Which verified name components (beyond the primary rule) this
  // candidate consumed, in order — empty for the primary candidate,
  // and absent entirely for the final numeric fallback (isFallback).
  usedAdditionalNames: string[];
  isFallback: boolean;
};

// Generates the full ordered candidate list, most-preferred first:
// 1. Primary: first-initial + every registered middle-name initial + surname.
// 2. One escalating candidate per additionalVerifiedNames entry, each
//    adding exactly one more initial (in the order provided) — never
//    more than one at a time, so the least additional disambiguation
//    needed is always tried first.
// 3. A deterministic, non-random numeric fallback (localPart + "2", "3",
//    ...) ONLY as the last resort, appended to the most-disambiguated
//    name-based candidate — per Part B, "only if meaningful name-based
//    differentiation is impossible."
//
// This function itself never checks availability — see
// pickAvailableLocalPart() below, which is the piece that actually
// walks this list against a live "is this taken" check.
export function generateCorporateEmailCandidates(
  input: CorporateEmailNameInput,
  fallbackAttempts = 8
): CorporateEmailCandidate[] {
  const firstInitial = initial(input.firstName);
  const middleInitials = (input.middleNames ?? []).map(initial).filter(Boolean);
  const surname = normalizeNamePart(input.surname);
  const additional = (input.additionalVerifiedNames ?? []).filter((n) => normalizeNamePart(n).length > 0);

  const candidates: CorporateEmailCandidate[] = [];

  const baseLocalPart = `${firstInitial}${middleInitials.join("")}${surname}`;
  candidates.push({ localPart: baseLocalPart, usedAdditionalNames: [], isFallback: false });

  const usedSoFar: string[] = [];
  for (const name of additional) {
    usedSoFar.push(name);
    const extraInitials = usedSoFar.map(initial).join("");
    candidates.push({
      localPart: `${firstInitial}${middleInitials.join("")}${extraInitials}${surname}`,
      usedAdditionalNames: [...usedSoFar],
      isFallback: false,
    });
  }

  const mostDisambiguated = candidates[candidates.length - 1].localPart;
  for (let n = 2; n < 2 + fallbackAttempts; n++) {
    candidates.push({ localPart: `${mostDisambiguated}${n}`, usedAdditionalNames: [...usedSoFar], isFallback: true });
  }

  return candidates;
}

// Walks the candidate list and returns the first one `isTaken` reports
// as free. `isTaken` is caller-supplied so this stays synchronous and
// DB-free for unit testing — the real caller passes a closure backed by
// a live query against corporate_identities.local_part (see
// reserveCorporateIdentity.ts).
export function pickAvailableLocalPart(
  candidates: CorporateEmailCandidate[],
  isTaken: (localPart: string) => boolean
): CorporateEmailCandidate | null {
  for (const candidate of candidates) {
    if (!isTaken(candidate.localPart)) return candidate;
  }
  return null;
}

export function formatCorporateEmail(localPart: string): string {
  return `${localPart}@${ORDIFT_STAFF_EMAIL_DOMAIN}`;
}
