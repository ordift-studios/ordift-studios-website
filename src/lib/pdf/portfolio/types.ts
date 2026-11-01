import type { Destination } from "@/lib/portfolio/destinations";

// PORTFOLIO PDF (infrastructure). Two modes, never mixed: an INTERNAL PREVIEW (every page watermarked, may contain photographs without permission, never distributable) and an EXTERNAL EDITION (every photograph
// must pass the library's permission check for the edition's destination, and a named approval is recorded). Generating a PDF here stores, publishes and sends NOTHING.
export type PortfolioMode = "internal_preview" | "external_edition";

export type PortfolioItem = {
  fileId: string;                 // the library file the permission check is made against
  imageSrc: string;               // a data URI or URL the renderer can read (supplied by the caller; this module never fetches private files itself)
  caption?: string;
  description?: string;           // optional project description
};
export type PortfolioCategory = { key: string; title: string; intro?: string; items: PortfolioItem[] };
export type EditionApproval = { step: string; by: string; at: string; note?: string };

export type PortfolioContent = {
  title: string;
  editionLabel: string;           // e.g. "Portfolio, Edition 1"
  preparedOn: string;             // ISO date
  studioIntro: string[];          // paragraphs of the studio introduction (approved wording supplied by the caller)
  categories: PortfolioCategory[];
  contact: { label: string; value: string }[];
  coverImageSrc?: string;
  approvals: EditionApproval[];   // approval history printed on the final page; an external edition needs at least one
};

export type GateReason = "no_permission_on_record" | "no_internal_review" | "library_disabled" | string;
export type GateBlock = { fileId: string; category: string; reason: string };
export type GateResult = { ok: true; blocked: GateBlock[]; externalAllowed: boolean } | { ok: false; error: string };
export type EligibilityCheck = (fileId: string, destination: string) => Promise<{ eligible: boolean; rightsReason: string; internalReason: string }>;
export type EditionRequest = { content: PortfolioContent; mode: PortfolioMode; destination: Destination };
