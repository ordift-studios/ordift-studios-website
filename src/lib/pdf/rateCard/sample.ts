// PLACEHOLDER content for the local preview. Every price is obviously fake (1,111 / 2,222 …), every description says it is a placeholder, and every item is marked source 'placeholder'
// so validation refuses to approve it. Replace with real packages and approved wording when the Founder selects and approves them.
import type { RateCardContent } from "./types";

const ph = (key: string, name: string, kind: "fixed" | "from", amount: number, inc: string[], unit: string): RateCardContent["sections"][number]["items"][number] => ({
  key, name, description: "Placeholder service description — the Founder will supply the approved wording. It is here only to show how a short paragraph sets in the layout.", inclusions: inc,
  price: { kind, amount, unit }, source: "placeholder",
});

export const SAMPLE_RATE_CARD: RateCardContent = {
  meta: { title: "Rate Card", subtitle: "Sample layout. Every figure, description and condition in this document is a placeholder.", editionLabel: "SAMPLE edition", effectiveDate: "2026-10-28", marketSlug: "sample", marketName: "Sample market", currency: "USD" },
  coverImage: "",
  intro: "Placeholder introduction to the booking page. The Founder will supply the approved text.",
  sections: [
    { key: "sample_fixed", title: "Sample packages (fixed prices)", structure: "fixed", intro: "A fixed-price category: each package has one price. Placeholder text.", items: [
      ph("a", "Sample package A", "fixed", 1111, ["2 hours of coverage", "40 professionally edited images", "Online gallery"], "per session"),
      ph("b", "Sample package B", "fixed", 2222, ["4 hours of coverage", "80 professionally edited images", "10 signature retouched images", "Online gallery"], "per session"),
      { ...ph("c", "Sample package C", "fixed", 3333, ["8 hours of coverage", "2 photographers", "Highlight film, 3–5 minutes", "Priority sneak peek"], "per booking"), note: "Placeholder condition: travel quoted separately." },
    ] },
    { key: "sample_from", title: "Sample services (starting prices)", structure: "from", intro: "A starting-price category: the final price is quoted for each brief. Placeholder text.", items: [
      ph("d", "Sample service D", "from", 444, ["Scoped to the brief", "Two rounds of revisions"], "per project"),
      ph("e", "Sample service E", "from", 5555, ["Concept and creative direction", "Production and delivery"], "per project"),
      { key: "f", name: "Sample service F", description: "Placeholder: a service priced entirely on request.", inclusions: [], price: { kind: "on_request" }, source: "placeholder" },
    ] },
  ],
  conditions: [
    { title: "Prices (placeholder)", text: "Placeholder wording. The Founder will supply the approved statement on currency, validity and what the prices include." },
    { title: "Tax and deposits (placeholder)", text: "Placeholder wording on tax, deposits and payment schedule — not real terms." },
    { title: "Usage and delivery (placeholder)", text: "Placeholder wording on usage rights and delivery timelines — not real terms." },
  ],
  contact: [
    { label: "Website", value: "ordiftstudios.com" },
    { label: "Email", value: "Contact email to be confirmed" },
    { label: "WhatsApp", value: "Booking number to be confirmed" },
  ],
};
