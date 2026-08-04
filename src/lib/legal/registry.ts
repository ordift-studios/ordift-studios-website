import type { LegalDocument, LegalDocumentStub } from "./types";
import { privacyPolicy } from "./documents/os-lgl-001-privacy";
import { cookiePolicy } from "./documents/os-lgl-002-cookies";
import { websiteTerms } from "./documents/os-lgl-003-terms";
import { bookingTerms } from "./documents/os-lgl-004-booking";
import { withStandardAppendices } from "./boilerplate";

// The single place a new Enterprise Legal Series document gets wired
// in. To add a document once its content is approved: create
// `documents/os-lgl-0XX-<slug>.ts` following the same shape as
// os-lgl-001-privacy.ts, import it here, and add it to `rawDocuments`
// below — the route, layout, TOC, definitions aggregation, standing
// Appendices A–G, and publication generator all pick it up
// automatically. No other file needs to change.
const rawDocuments: Record<string, LegalDocument> = {
  privacy: privacyPolicy,
  cookies: cookiePolicy,
  terms: websiteTerms,
  booking: bookingTerms,
};

// Every registered document gets the shared series-wide Appendices
// (see boilerplate.ts) appended once here, rather than each document
// file duplicating that content.
const documents: Record<string, LegalDocument> = Object.fromEntries(
  Object.entries(rawDocuments).map(([slug, doc]) => [slug, withStandardAppendices(doc)])
);

// Documents named in OS-LGL-001's Related Documents list that are not
// yet approved for integration. Advertised here (code + title only, no
// content) purely so /legal continues to describe the full intended
// series without publishing placeholder text for any of them.
export const upcomingDocuments: LegalDocumentStub[] = [];

export function getLegalDocument(slug: string): LegalDocument | null {
  return documents[slug] ?? null;
}

export function listLegalDocuments(): LegalDocument[] {
  return Object.values(documents);
}

export function isEnterpriseLegalSlug(slug: string): boolean {
  return slug in documents;
}
