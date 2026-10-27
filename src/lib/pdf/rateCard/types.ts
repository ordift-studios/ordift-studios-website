// The rate card is a GENERAL, client-facing price list — never a personalised quotation. Everything in it is a SELLING price or approved wording; there is deliberately no
// field anywhere in these types for a cost, margin, vendor rate or payable, so nothing confidential can be carried into a PDF by accident.

export type PriceSpec =
  | { kind: "fixed"; amount: number; unit?: string }   // a package with one price
  | { kind: "from"; amount: number; unit?: string }    // a starting price: the final price is quoted per brief
  | { kind: "on_request" };

export type ItemSource = "selling_rates" | "manual" | "placeholder";

export type RateCardItem = {
  key: string;
  name: string;
  description: string;          // approved service wording (empty until the Founder supplies it)
  inclusions: string[];         // what is included, one line each
  price: PriceSpec;
  note?: string;                // a short condition specific to this item
  source: ItemSource;           // 'selling_rates' = read from the existing selling tables; 'placeholder' can never be approved
};

export type RateCardSection = { key: string; title: string; intro?: string; structure: "fixed" | "from" | "mixed"; items: RateCardItem[] };

export type RateCardContent = {
  meta: { title: string; subtitle?: string; editionLabel: string; effectiveDate: string; marketSlug: string; marketName: string; currency: string };
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
