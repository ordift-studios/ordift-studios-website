// LOCAL DEMONSTRATION: builds a Qatar rate card DRAFT from a read-only export of the current Qatar selling rows (see the export script), converts it to QAR for review, and renders the PDF.
// Nothing is published or approved. Usage: node .poc-build/rate-card-demo.mjs <rows.json> <out.pdf> [opacity]
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { registerBrandFonts } from "../src/lib/pdf/fonts";
import { RateCardDocument } from "../src/lib/pdf/rateCard/RateCardDocument";
import { commercialSection, corporateSection, personalSessionSection, weddingEventSection } from "../src/lib/pdf/rateCard/mappers";
import { convertContent, conversionReview, DEFAULT_ROUNDING } from "../src/lib/pdf/rateCard/convert";
import { applyEligibility, excludedByEligibility } from "../src/lib/pdf/rateCard/eligibility";
import { validateRateCard } from "../src/lib/pdf/rateCard/validate";
import { PLACEHOLDER_MARK, type RateCardContent } from "../src/lib/pdf/rateCard/types";

const [rowsPath, out, opacity] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 0.7)];
const j = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
const first = <T,>(rows: T[], key: (r: T) => string) => { const seen = new Set<string>(); return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true))); };
const tiers = first(j.tiers as { category: string; serviceMode: string; tierSlug: string }[], (r) => `${r.category}:${r.serviceMode}:${r.tierSlug}`).map((r) => ({ marketId: "qatar", ...r }));
const deliv = first(j.deliverables as Record<string, unknown>[], (r) => `${r.category}:${r.tier_slug}:${r.service_mode}`).map((r) => ({
  category: r.category, tierSlug: r.tier_slug, serviceMode: r.service_mode, eventDays: r.event_days, coverageHours: r.coverage_hours, photographers: r.photographers, filmmakers: r.filmmakers,
  professionallyEditedImagesMin: r.professionally_edited_images_min, signatureRetouchedImages: r.signature_retouched_images, highlightFilmMinMinutes: r.highlight_film_min_minutes === null ? null : Number(r.highlight_film_min_minutes),
  highlightFilmMaxMinutes: r.highlight_film_max_minutes === null ? null : Number(r.highlight_film_max_minutes), includesDocumentary: r.includes_documentary, onlineGallery: r.online_gallery, planningConsultation: r.planning_consultation, prioritySneakPeek: r.priority_sneak_peek,
}));
const sections = [personalSessionSection(j.personal)];
for (const category of ["wedding", "event"] as const) for (const mode of ["photography", "film", "photography_film"] as const) {
  const s = weddingEventSection(category, mode, tiers.filter((t) => t.category === category) as never, deliv.filter((d) => d.category === category) as never); if (s.items.length) sections.push(s);
}
sections.push(corporateSection(j.corpProducts, j.corpTiers, j.corpMinimum, j.corpRetouch, j.corpPriority));
sections.push(commercialSection(j.comFees, j.comBase, j.comMin, j.comPost));
for (const s of sections) s.customQuotationNote = `${PLACEHOLDER_MARK} Wording for requirements that do not fit a standard package.`;
let draft: RateCardContent = {
  meta: { title: "Rate Card", subtitle: "Qatar — demonstration draft. Prices are proposed QAR conversions of the current USD selling rates and are not approved.", editionLabel: "DEMO draft", effectiveDate: new Date().toISOString().slice(0, 10), marketSlug: "qatar", marketName: "Qatar / GCC", currency: "USD", conversionPolicy: "none" },
  coverImage: path.join(process.cwd(), "public/pdf/cover-placeholder.jpg"), sections,
  conditions: [{ title: "Prices", text: `${PLACEHOLDER_MARK} Approved wording on currency, validity and what the prices include.` }, { title: "Tax and deposits", text: `${PLACEHOLDER_MARK} Approved wording on tax, deposits and payment schedule.` }, { title: "Usage and delivery", text: `${PLACEHOLDER_MARK} Approved wording on usage rights and delivery timelines.` }],
  contact: [{ label: "Website", value: "ordiftstudios.com" }, { label: "Email", value: `${PLACEHOLDER_MARK} contact email` }, { label: "WhatsApp", value: `${PLACEHOLDER_MARK} booking number` }],
};
draft = applyEligibility(draft, { entityName: "ORDIFT STUDIOS (Qatar W.L.L.)", checkedOn: draft.meta.effectiveDate, keys: ["photography"] });
draft = convertContent(draft, { currency: "QAR", rateToUsd: j.fx.rateToUsd, effectiveFrom: j.fx.effectiveFrom, source: j.fx.reason || "Governed exchange-rate table (QAR)", rule: DEFAULT_ROUNDING });
const v = validateRateCard(draft, "draft", { today: draft.meta.effectiveDate });
console.log("draft errors:", v.errors.length, "| warnings:", v.warnings.length, "| conversions:", conversionReview(draft).length, "| excluded:", excludedByEligibility(draft).length);
fs.writeFileSync(out.replace(/\.pdf$/, ".json"), JSON.stringify(draft, null, 1));
fs.writeFileSync(out.replace(/\.pdf$/, "-review.json"), JSON.stringify(conversionReview(draft), null, 1));
fs.writeFileSync(out.replace(/\.pdf$/, "-excluded.json"), JSON.stringify(excludedByEligibility(draft), null, 1));
registerBrandFonts(path.join(process.cwd(), "public/fonts/pdf"));
const t0 = Date.now();
renderToFile(React.createElement(RateCardDocument, { content: draft, status: { state: "draft" }, coverPanelOpacity: opacity, logoWhite: path.join(process.cwd(), "public/brand/logo-full-white.png") }) as never, out).then(() => console.log(`rendered in ${Date.now() - t0} ms`));
