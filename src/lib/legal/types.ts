// Domain model for the Ordift Studios Enterprise Legal Series (OSELS).
//
// Structured (not Sanity-plain-text) by design: a legal document like
// OS-LGL-001 needs stable per-heading anchor IDs (for the sticky TOC and
// deep links), a typed Document Control block, an inline definitions
// list, and mixed prose/list/table content per section — none of which
// a single `text` field can carry without re-parsing conventions out of
// a markdown blob at render time. The existing Sanity `legalPage` type
// (plain `body: text`) is TD-010 in TECHNICAL_DEBT_REGISTER.md — this is
// deliberately a parallel, in-code content source for the Enterprise
// Legal Series specifically, not a fix to that Sanity field. See
// TECHNICAL_DECISION_RECORDS.md for the full reasoning.
//
// Every document here is loaded through `registry.ts`, mirroring this
// project's established CMS-agnostic pattern (contentRepository): the
// rendering layer never imports a document file directly, so swapping
// the source (e.g. a future Sanity portable-text adapter) later touches
// only the registry, not every consumer.

export type DocumentStatus = "approved" | "draft" | "under-review" | "superseded";

export type DocumentClassification = "public" | "internal" | "confidential";

export type RelatedDocumentRef = {
  code: string | null;
  title: string;
};

// A running change log rather than a single "initial issue" row (2026-08-04
// direction: "maintain a running change log in future versions so updates
// are easy to track across releases") — every version bump appends an
// entry here instead of the generator synthesizing one row from `version`/
// `effectiveDate` at render time.
export type RevisionEntry = {
  version: string;
  date: string; // ISO date
  description: string;
  author: string;
};

export type DocumentControlMetadata = {
  documentTitle: string;
  documentCode: string;
  publicationSeries: string;
  version: string;
  status: DocumentStatus;
  classification: DocumentClassification;
  effectiveDate: string; // ISO date
  lastUpdated: string; // ISO date
  reviewCycle: string;
  documentOwner: string;
  preparedBy: string;
  approvedBy: string;
  relatedDocuments: RelatedDocumentRef[];
  controlledDocumentNotice: string;
  changeLog: RevisionEntry[];
};

export type DefinedTerm = {
  /** Stable anchor slug for cross-referencing (e.g. "personal-information"),
   * independent of `term` so rewording a term's exact phrasing later
   * doesn't break existing deep links to it. */
  id: string;
  term: string;
  definition: string;
};

// Section content nodes — deliberately small and literal (paragraph,
// list, table) rather than a general rich-text schema, because the
// source documents are legal prose with occasional lists/tables, not
// freeform editorial content. Extend this union if a future document
// needs a shape these don't cover — don't force-fit.
export type LegalContentNode =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "divider" }
  // An unnumbered in-section lead-in (e.g. "Directly from you" inside
  // §6 of OS-LGL-001) — the source document uses these without giving
  // them their own x.y number, so they render as an emphasized inline
  // heading rather than becoming an invented numbered subsection.
  | { type: "subheading"; text: string };

export type LegalSection = {
  id: string; // anchor slug, e.g. "information-we-collect"
  number: string; // "5" or "5.1" — preserves the source document's own numbering
  heading: string;
  level: 1 | 2; // 1 = top-level TOC entry, 2 = subsection
  content: LegalContentNode[];
};

export type LegalDocument = {
  control: DocumentControlMetadata;
  definitions: DefinedTerm[];
  sections: LegalSection[];
  /** URL-safe slug this document is served at under /legal/[slug]. */
  slug: string;
};

/** A document not yet available for integration — used by the registry
 * to advertise future slots (Cookie Policy, Website Terms, Booking
 * Terms) without publishing content or fabricating placeholder text. */
export type LegalDocumentStub = {
  slug: string;
  documentCode: string;
  title: string;
  status: "pending";
};
