// The rate card is a GENERAL, client-facing price list — never a personalised quotation. Everything in it is a SELLING price or approved wording; there is deliberately no
// field anywhere in these types for a cost, margin, vendor rate or payable, so nothing confidential can be carried into a PDF by accident.

export type PriceSpec =
  | { kind: "fixed"; amount: number; unit?: string }   // a package with one price
  | { kind: "from"; amount: number; unit?: string }    // a starting price: the final price is quoted per brief
  | { kind: "on_request" };

export type ItemSource = "selling_rates" | "manual" | "placeholder";

// Any text that still needs Founder-approved wording starts with this marker. Drafts may carry it (it prints, so it is visible); approval refuses any content that still contains it.
export const PLACEHOLDER_MARK = "[PLACEHOLDER]";

export type RoundingRule = { kind: "up_to_multiple"; multiple: number } | { kind: "nearest_multiple"; multiple: number };
// One reviewable conversion of a USD selling price into the display currency. The USD figure is never changed; the converted figure is derived from it.
export type Conversion = { usdReference: number; rateToUsd: number; exact: number; rounded: number; difference: number };
export type FxBasis = { currency: string; rateToUsd: number; effectiveFrom: string; source: string; rule: RoundingRule };

export type Tier = { label: string; price: PriceSpec; conversion?: Conversion };                         // e.g. a team size band with its per-person price
export type Addon = { name: string; price: PriceSpec; conversion?: Conversion; note?: string; activities?: string[]; included?: boolean; eligibility?: Eligibility };
export type Minimum = { label: string; price: PriceSpec; conversion?: Conversion };
export type Eligibility = { ok: boolean; reason?: string };

export type RateCardItem = {
  key: string;
  name: string;
  description: string;          // approved service wording (empty until the Founder supplies it)
  specs?: string[];             // key specifications on one line (duration, image counts …)
  inclusions: string[];         // what is included, one line each
  price: PriceSpec;
  conversion?: Conversion;
  tiers?: Tier[];
  note?: string;                // a short condition specific to this item
  source: ItemSource;           // 'selling_rates' = read from the existing selling tables; 'placeholder' can never be approved
  activities?: string[];        // activity keys needed to deliver it (photography, videography …); "unclassified" = the Founder has not classified it yet
  included?: boolean;           // false = left out of the PDF (default true). Ineligible items are left out automatically.
  eligibility?: Eligibility;    // result of the licensed-activity check for the issuing entity
};

export type RateCardSection = {
  key: string; title: string; intro?: string; structure: "fixed" | "from" | "mixed";
  items: RateCardItem[];
  minimum?: Minimum;            // a minimum booking
  addons?: Addon[];             // additional services and what they cost
  notes?: string[];             // additional-service notes
  customQuotationNote?: string; // what to do when a need does not fit a standard package
};

export type RateCardContent = {
  meta: {
    title: string; subtitle?: string; editionLabel: string; effectiveDate: string; marketSlug: string; marketName: string;
    currency: string;                                   // the display currency (USD, or QAR for a converted card)
    conversionPolicy?: "none" | "proposed" | "approved"; // a converted card is "proposed" (indicative) until the Founder approves the quotation/payment currency policy
    fx?: FxBasis;                                       // present exactly when currency is not USD
    issuingEntity?: { entityId?: string; jurisdiction?: string; name: string; checkedOn: string; licensedActivities: string[]; basis?: string }; // who offers these prices and what was verified as licensed, and when
  };
  coverImage: string;           // path or URL of the cover photograph (a non-client Ordift image chosen by the Founder)
  intro?: string;
  sections: RateCardSection[];
  conditions: { title: string; text: string }[];
  contact: { label: string; value: string }[];
};

// A draft is editable and always watermarked "not approved". An approved edition is a frozen snapshot: the content never changes, only a new edition replaces it.
export type EditionStatus =
  | { state: "draft" }
  | { state: "approved"; editionId: string; approvedBy: string; approvedAt: string; contentHash: string };
