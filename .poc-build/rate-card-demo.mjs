// scripts/rate-card-demo.tsx
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToFile } from "@react-pdf/renderer";

// src/lib/pdf/fonts.ts
import { Font } from "@react-pdf/renderer";
var done = false;
function registerBrandFonts(base) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
  Font.registerHyphenationCallback((word) => [word]);
  done = true;
}

// src/lib/pdf/rateCard/RateCardDocument.tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// src/lib/pdf/brand.ts
var BRAND = { navy: "#0b1220", navy900: "#111a2e", gold: "#bfa14a", goldPressed: "#8e7736", offwhite: "#f7f5f1", ink: "#1a1d24", inkMuted: "#5b5f6b", rule: "#dcd8cf", tint: "#efece4", panelGrey: "#1d2028" };

// src/lib/pdf/rateCard/RateCardDocument.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var A4 = { w: 595, h: 841 };
function formatAmount(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
function formatPrice(p, currency) {
  if (p.kind === "on_request") return { prefix: "", amount: "On request", unit: "" };
  return { prefix: p.kind === "from" ? "From" : "", amount: `${currency} ${formatAmount(p.amount)}`, unit: p.unit ?? "" };
}
var s = StyleSheet.create({
  coverPage: { backgroundColor: BRAND.navy, color: BRAND.offwhite, fontFamily: "Inter" },
  coverImg: { position: "absolute", top: 0, left: 0, width: A4.w, height: A4.h, objectFit: "cover" },
  coverShade: { position: "absolute", top: 0, left: 0, width: A4.w, height: A4.h, backgroundColor: BRAND.navy, opacity: 0.18 },
  logo: { position: "absolute", top: 46, left: 46, width: 112 },
  panelBg: { position: "absolute", left: 46, bottom: 96, width: 372, height: 250, backgroundColor: BRAND.panelGrey },
  panel: { position: "absolute", left: 46, bottom: 96, width: 372, height: 250, paddingHorizontal: 30, paddingTop: 30, justifyContent: "space-between", paddingBottom: 26 },
  rule: { width: 48, height: 2, backgroundColor: BRAND.gold, marginBottom: 14 },
  eyebrow: { fontFamily: "Inter", fontSize: 8.5, letterSpacing: 2.2, color: BRAND.gold, fontWeight: 600, textTransform: "uppercase" },
  title: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 50, lineHeight: 1.02, color: BRAND.offwhite, marginTop: 4 },
  subtitle: { fontSize: 11, lineHeight: 1.55, color: "#d6d9e2", marginTop: 8, width: 300 },
  panelMeta: { fontFamily: "Inter", fontSize: 8.5, letterSpacing: 0.4, color: "#b9bfce", lineHeight: 1.5 },
  coverFoot: { fontFamily: "Inter", position: "absolute", left: 46, right: 46, bottom: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: "#e8e6df" },
  draftTag: { fontFamily: "Inter", color: BRAND.gold, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" },
  page: { backgroundColor: BRAND.offwhite, paddingHorizontal: 50, paddingTop: 52, paddingBottom: 72, fontFamily: "Inter", color: BRAND.ink },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottomWidth: 1.2, borderBottomColor: BRAND.gold, marginBottom: 6 },
  h1: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 24, color: BRAND.navy, maxWidth: 360 },
  headMeta: { fontFamily: "Inter", fontSize: 8, color: BRAND.inkMuted, textAlign: "right", lineHeight: 1.5 },
  intro: { fontSize: 10, lineHeight: 1.6, color: BRAND.inkMuted, marginTop: 10, marginBottom: 6, width: 430 },
  item: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 0.6, borderBottomColor: BRAND.rule },
  itemMain: { width: "69%", paddingRight: 18 },
  itemName: { fontSize: 12.5, fontWeight: 600, color: BRAND.navy, marginBottom: 3 },
  itemDesc: { fontSize: 9.8, lineHeight: 1.55, color: BRAND.inkMuted, marginBottom: 5 },
  inc: { flexDirection: "row", marginTop: 1.5 },
  incDot: { fontFamily: "Inter", width: 10, color: BRAND.gold, fontSize: 9.5, fontWeight: 600 },
  incText: { flex: 1, fontSize: 9.5, lineHeight: 1.45, color: BRAND.ink },
  itemPrice: { width: "31%", alignItems: "flex-end" },
  pFrom: { fontFamily: "Inter", fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: BRAND.goldPressed, fontWeight: 600, marginBottom: 1 },
  pAmount: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 19, color: BRAND.navy, textAlign: "right" },
  pUnit: { fontFamily: "Inter", fontSize: 8, color: BRAND.inkMuted, marginTop: 2, textAlign: "right" },
  pNote: { fontFamily: "Inter", fontSize: 8, color: BRAND.inkMuted, marginTop: 6, textAlign: "right", lineHeight: 1.4 },
  condBlock: { marginTop: 16, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: BRAND.gold },
  condTitle: { fontSize: 10.5, fontWeight: 600, color: BRAND.navy, marginBottom: 3 },
  condText: { fontSize: 9.8, lineHeight: 1.6, color: BRAND.inkMuted },
  contactRow: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: 0.6, borderBottomColor: BRAND.rule },
  contactLabel: { fontFamily: "Inter", width: "30%", fontSize: 8, letterSpacing: 1.3, textTransform: "uppercase", color: BRAND.goldPressed, fontWeight: 600, paddingTop: 2 },
  contactValue: { width: "70%", fontSize: 11.5, color: BRAND.navy },
  footer: { fontFamily: "Inter", position: "absolute", left: 50, right: 50, bottom: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: BRAND.inkMuted, borderTopWidth: 0.5, borderTopColor: BRAND.rule, paddingTop: 8 },
  specs: { fontFamily: "Inter", fontSize: 8.6, color: BRAND.goldPressed, fontWeight: 500, marginBottom: 4, letterSpacing: 0.2 },
  tiers: { marginTop: 6, borderTopWidth: 0.5, borderTopColor: BRAND.rule },
  tierRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: BRAND.rule },
  tierLabel: { fontFamily: "Inter", fontSize: 9.3, color: BRAND.ink },
  tierPrice: { fontFamily: "Inter", fontSize: 9.3, fontWeight: 600, color: BRAND.navy },
  minBox: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: BRAND.tint, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  minLabel: { fontFamily: "Inter", fontSize: 9.8, fontWeight: 600, color: BRAND.navy },
  minPrice: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 14, color: BRAND.navy },
  addHead: { fontFamily: "Inter", fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: BRAND.goldPressed, fontWeight: 600, marginTop: 18, marginBottom: 4 },
  addRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6.5, borderBottomWidth: 0.5, borderBottomColor: BRAND.rule },
  addMain: { width: "70%", paddingRight: 12 },
  addName: { fontFamily: "Inter", fontSize: 10, color: BRAND.ink, fontWeight: 500 },
  addNote: { fontFamily: "Inter", fontSize: 8.4, color: BRAND.inkMuted, marginTop: 1.5, lineHeight: 1.4 },
  addPrice: { fontFamily: "Inter", fontSize: 10, fontWeight: 600, color: BRAND.navy, textAlign: "right", width: "30%" },
  secNote: { fontFamily: "Inter", fontSize: 9, lineHeight: 1.55, color: BRAND.inkMuted, marginTop: 8 },
  custom: { marginTop: 10, marginBottom: 2, padding: 9, borderWidth: 0.8, borderColor: BRAND.gold, backgroundColor: "#fbf8ef" },
  customText: { fontFamily: "Inter", fontSize: 9.4, lineHeight: 1.55, color: BRAND.ink },
  fxBanner: { fontFamily: "Inter", fontSize: 8.2, color: BRAND.goldPressed, marginTop: 8, lineHeight: 1.45, fontWeight: 500 },
  watermark: { position: "absolute", top: 300, left: 70, fontFamily: "Fraunces", fontSize: 150, color: "#0b1220", opacity: 0.055, transform: "rotate(-32deg)" },
  watermarkCover: { position: "absolute", top: 280, left: 40, fontFamily: "Fraunces", fontSize: 170, color: "#ffffff", opacity: 0.16, transform: "rotate(-32deg)" },
  draftBar: { fontFamily: "Inter", position: "absolute", top: 22, right: 50, fontSize: 7.5, letterSpacing: 1.3, textTransform: "uppercase", color: BRAND.goldPressed, fontWeight: 600 }
});
var priceText = (p, currency) => {
  const f = formatPrice(p, currency);
  return [f.prefix, f.amount, f.unit && p.kind !== "on_request" ? f.unit : ""].filter(Boolean).join(" ");
};
var fxLine = (c) => {
  const fx = c.meta.fx;
  if (!fx) return null;
  const rule = fx.rule.kind === "up_to_multiple" ? `rounded up to the next ${c.meta.currency} ${fx.rule.multiple}` : `rounded to the nearest ${c.meta.currency} ${fx.rule.multiple}`;
  if (c.meta.conversionPolicy === "approved") return `${c.meta.currency} prices are converted from USD at ${fx.rateToUsd} and ${rule}.`;
  return `Indicative: proposed conversion, not yet approved for client use. ${c.meta.currency} prices are converted from the USD base prices at ${fx.rateToUsd} (${fx.source}, effective ${fx.effectiveFrom}), ${rule}.`;
};
function Item({ i, currency }) {
  const p = formatPrice(i.price, currency);
  return /* @__PURE__ */ jsxs(View, { style: s.item, wrap: !(i.description.length < 450 && i.inclusions.length <= 9), children: [
    /* @__PURE__ */ jsxs(View, { style: s.itemMain, children: [
      /* @__PURE__ */ jsx(Text, { style: s.itemName, children: i.name }),
      i.specs && i.specs.length ? /* @__PURE__ */ jsx(Text, { style: s.specs, children: i.specs.join("  \xB7  ") }) : null,
      i.description ? /* @__PURE__ */ jsx(Text, { style: s.itemDesc, children: i.description }) : null,
      i.inclusions.map((x, n) => /* @__PURE__ */ jsxs(View, { style: s.inc, children: [
        /* @__PURE__ */ jsx(Text, { style: s.incDot, children: "\u2013" }),
        /* @__PURE__ */ jsx(Text, { style: s.incText, children: x })
      ] }, n)),
      i.tiers && i.tiers.length ? /* @__PURE__ */ jsx(View, { style: s.tiers, children: i.tiers.map((t) => /* @__PURE__ */ jsxs(View, { style: s.tierRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.tierLabel, children: t.label }),
        /* @__PURE__ */ jsx(Text, { style: s.tierPrice, children: priceText(t.price, currency) })
      ] }, t.label)) }) : null
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.itemPrice, children: [
      p.prefix ? /* @__PURE__ */ jsx(Text, { style: s.pFrom, children: p.prefix }) : null,
      /* @__PURE__ */ jsx(Text, { style: s.pAmount, children: p.amount }),
      p.unit ? /* @__PURE__ */ jsx(Text, { style: s.pUnit, children: p.unit }) : null,
      i.note ? /* @__PURE__ */ jsx(Text, { style: s.pNote, children: i.note }) : null
    ] })
  ] });
}
function Frame({ c, status }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    status.state === "draft" ? /* @__PURE__ */ jsx(Text, { style: s.draftBar, fixed: true, children: "Draft \u2014 not approved for distribution" }) : null,
    status.state === "draft" ? /* @__PURE__ */ jsx(Text, { style: s.watermark, fixed: true, children: "DRAFT" }) : null,
    /* @__PURE__ */ jsxs(View, { style: s.footer, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { children: "Ordift Studios \xB7 ordiftstudios.com" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        c.meta.title,
        " \xB7 ",
        c.meta.editionLabel,
        status.state === "approved" ? ` \xB7 ${status.contentHash.slice(0, 8)}` : ""
      ] }),
      /* @__PURE__ */ jsx(Text, { render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` })
    ] })
  ] });
}
function Section({ sec, c, status }) {
  const items = sec.items.filter((i) => i.included !== false);
  const addons = (sec.addons ?? []).filter((a) => a.included !== false);
  const fx = fxLine(c);
  return /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.page, children: [
    /* @__PURE__ */ jsx(Frame, { c, status }),
    /* @__PURE__ */ jsxs(View, { style: s.head, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { style: s.h1, children: sec.title }),
      /* @__PURE__ */ jsxs(Text, { style: s.headMeta, children: [
        c.meta.marketName,
        "\n",
        "Prices in ",
        c.meta.currency
      ] })
    ] }),
    fx ? /* @__PURE__ */ jsx(Text, { style: s.fxBanner, children: fx }) : null,
    sec.intro ? /* @__PURE__ */ jsx(Text, { style: s.intro, children: sec.intro }) : null,
    sec.customQuotationNote ? /* @__PURE__ */ jsx(View, { style: s.custom, wrap: false, children: /* @__PURE__ */ jsx(Text, { style: s.customText, children: sec.customQuotationNote }) }) : null,
    items.map((i) => /* @__PURE__ */ jsx(Item, { i, currency: c.meta.currency }, i.key)),
    sec.minimum ? /* @__PURE__ */ jsxs(View, { style: s.minBox, wrap: false, children: [
      /* @__PURE__ */ jsx(Text, { style: s.minLabel, children: sec.minimum.label }),
      /* @__PURE__ */ jsx(Text, { style: s.minPrice, children: priceText(sec.minimum.price, c.meta.currency) })
    ] }) : null,
    addons.length ? /* @__PURE__ */ jsxs(View, { wrap: false, children: [
      /* @__PURE__ */ jsx(Text, { style: s.addHead, children: "Additional services" }),
      addons.map((a) => /* @__PURE__ */ jsxs(View, { style: s.addRow, children: [
        /* @__PURE__ */ jsxs(View, { style: s.addMain, children: [
          /* @__PURE__ */ jsx(Text, { style: s.addName, children: a.name }),
          a.note ? /* @__PURE__ */ jsx(Text, { style: s.addNote, children: a.note }) : null
        ] }),
        /* @__PURE__ */ jsx(Text, { style: s.addPrice, children: priceText(a.price, c.meta.currency) })
      ] }, a.name))
    ] }) : null,
    (sec.notes ?? []).map((n, k) => /* @__PURE__ */ jsx(Text, { style: s.secNote, children: n }, k))
  ] });
}
function RateCardDocument({ content: c, status, logoWhite, coverPanelOpacity = 0.8 }) {
  const m = c.meta;
  return /* @__PURE__ */ jsxs(Document, { title: `${m.title} \u2014 ${m.editionLabel}`, author: "Ordift Studios", subject: status.state === "draft" ? "DRAFT \u2014 not approved for distribution" : `Approved edition ${status.editionId}`, creator: "Ordift Studios", producer: "Ordift Studios", children: [
    /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.coverPage, children: [
      c.coverImage ? /* @__PURE__ */ jsx(Image, { src: c.coverImage, style: s.coverImg }) : null,
      /* @__PURE__ */ jsx(View, { style: s.coverShade }),
      /* @__PURE__ */ jsx(Image, { src: logoWhite, style: s.logo }),
      /* @__PURE__ */ jsx(View, { style: [s.panelBg, { opacity: coverPanelOpacity }] }),
      /* @__PURE__ */ jsxs(View, { style: s.panel, children: [
        /* @__PURE__ */ jsxs(View, { children: [
          /* @__PURE__ */ jsx(View, { style: s.rule }),
          /* @__PURE__ */ jsx(Text, { style: s.eyebrow, children: "Ordift Studios" }),
          /* @__PURE__ */ jsx(Text, { style: s.title, children: m.title }),
          m.subtitle ? /* @__PURE__ */ jsx(Text, { style: s.subtitle, children: m.subtitle }) : null
        ] }),
        /* @__PURE__ */ jsxs(Text, { style: s.panelMeta, children: [
          m.marketName,
          " \xB7 Prices in ",
          m.currency,
          "\n",
          m.editionLabel,
          " \xB7 Effective ",
          m.effectiveDate
        ] })
      ] }),
      status.state === "draft" ? /* @__PURE__ */ jsx(Text, { style: s.watermarkCover, children: "DRAFT" }) : null,
      /* @__PURE__ */ jsxs(View, { style: s.coverFoot, children: [
        /* @__PURE__ */ jsx(Text, { children: "ordiftstudios.com" }),
        status.state === "draft" ? /* @__PURE__ */ jsx(Text, { style: s.draftTag, children: "Draft \u2014 not approved" }) : /* @__PURE__ */ jsxs(Text, { children: [
          "Edition ",
          status.editionId
        ] })
      ] })
    ] }),
    c.sections.filter((sec) => sec.items.some((i) => i.included !== false)).map((sec) => /* @__PURE__ */ jsx(Section, { sec, c, status }, sec.key)),
    c.conditions.length > 0 ? /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.page, children: [
      /* @__PURE__ */ jsx(Frame, { c, status }),
      /* @__PURE__ */ jsx(View, { style: s.head, children: /* @__PURE__ */ jsx(Text, { style: s.h1, children: "Conditions" }) }),
      c.conditions.map((x, n) => /* @__PURE__ */ jsxs(View, { style: s.condBlock, wrap: false, children: [
        /* @__PURE__ */ jsx(Text, { style: s.condTitle, children: x.title }),
        /* @__PURE__ */ jsx(Text, { style: s.condText, children: x.text })
      ] }, n))
    ] }) : null,
    c.contact.length > 0 ? /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.page, children: [
      /* @__PURE__ */ jsx(Frame, { c, status }),
      /* @__PURE__ */ jsx(View, { style: s.head, children: /* @__PURE__ */ jsx(Text, { style: s.h1, children: "Book with us" }) }),
      c.intro ? /* @__PURE__ */ jsx(Text, { style: s.intro, children: c.intro }) : null,
      c.contact.map((x, n) => /* @__PURE__ */ jsxs(View, { style: s.contactRow, wrap: false, children: [
        /* @__PURE__ */ jsx(Text, { style: s.contactLabel, children: x.label }),
        /* @__PURE__ */ jsx(Text, { style: s.contactValue, children: x.value })
      ] }, n))
    ] }) : null
  ] });
}

// src/lib/pricing/weddingEventEstimate.ts
var WEDDING_TIER_LABELS = {
  chapter: "The Chapter",
  narrative: "The Narrative",
  chronicle: "The Chronicle",
  archive: "The Archive"
};
var EVENT_TIER_LABELS = {
  focused: "Focused",
  half_day: "Half Day",
  full_day: "Full Day",
  extended: "Extended",
  full_event: "Full Event",
  round_the_clock: "Round-the-Clock"
};

// src/lib/pdf/rateCard/eligibility.ts
var UNCLASSIFIED = "unclassified";
function assessActivities(activities, lic) {
  if (!activities || activities.length === 0) return { ok: true };
  if (activities.includes(UNCLASSIFIED)) return { ok: false, reason: "The activity this service falls under has not been classified yet." };
  const missing = activities.filter((a) => !lic.keys.includes(a));
  return missing.length ? { ok: false, reason: `${lic.entityName} is not currently licensed for: ${missing.join(", ")}.` } : { ok: true };
}
function applyEligibility(c, lic) {
  const mark = (x) => {
    const e = assessActivities(x.activities, lic);
    return { ...x, eligibility: e, included: e.ok ? x.included : false };
  };
  return {
    ...c,
    meta: { ...c.meta, issuingEntity: { ...lic.entityId ? { entityId: lic.entityId } : {}, name: lic.entityName, checkedOn: lic.checkedOn, licensedActivities: [...lic.keys].sort() } },
    sections: c.sections.map((s2) => ({ ...s2, items: s2.items.map(mark), addons: s2.addons?.map(mark) }))
  };
}
var excludedByEligibility = (c) => c.sections.flatMap((s2) => [...s2.items.filter((i) => i.eligibility && !i.eligibility.ok).map((i) => `${s2.title} \u2014 ${i.name}: ${i.eligibility?.reason}`), ...(s2.addons ?? []).filter((a) => a.eligibility && !a.eligibility.ok).map((a) => `${s2.title} \u2014 ${a.name}: ${a.eligibility?.reason}`)]);

// src/lib/pdf/rateCard/mappers.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var hours = (h) => h === 0.5 ? "30-minute" : Number.isInteger(h) ? `${h}-hour` : `${h}-hour`;
function personalSessionSection(rates) {
  const items = [...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => ({
    key: `ps-${r.durationHours}h`,
    name: `${hours(r.durationHours)} session`,
    description: "",
    inclusions: [
      r.professionallyEditedImages > 0 ? `${plural(r.professionallyEditedImages, "professionally edited image")}` : "",
      r.signatureRetouchedImages > 0 ? `${plural(r.signatureRetouchedImages, "signature retouched image")}` : ""
    ].filter(Boolean),
    price: { kind: "fixed", amount: r.priceUsd, unit: "per session" },
    source: "selling_rates",
    activities: ["photography"],
    specs: [`${hours(r.durationHours)} session`]
  }));
  return { key: "personal_sessions", title: "Personal sessions", structure: "fixed", items };
}
var ACTIVITIES = { photography: ["photography"], film: ["videography"], photography_film: ["photography", "videography"] };
var MODE_LABEL = { photography: "Photography", film: "Film", photography_film: "Photography and film" };
function weddingEventSection(category, mode, rates, deliverables) {
  const labels = category === "wedding" ? WEDDING_TIER_LABELS : EVENT_TIER_LABELS;
  const items = rates.filter((r) => r.serviceMode === mode).sort((a, b) => a.priceUsd - b.priceUsd).map((r) => {
    const d = deliverables.find((x) => x.tierSlug === r.tierSlug && x.serviceMode === mode);
    const inc = [];
    if (d) {
      inc.push(`${plural(d.coverageHours, "hour")} of coverage${d.eventDays > 1 ? ` over ${d.eventDays} days` : ""}`);
      if (d.photographers > 0) inc.push(plural(d.photographers, "photographer"));
      if (d.filmmakers > 0) inc.push(plural(d.filmmakers, "filmmaker"));
      if (d.professionallyEditedImagesMin > 0) inc.push(`${d.professionallyEditedImagesMin}+ professionally edited images`);
      if (d.signatureRetouchedImages > 0) inc.push(plural(d.signatureRetouchedImages, "signature retouched image"));
      if (d.highlightFilmMinMinutes != null && d.highlightFilmMaxMinutes != null) inc.push(`Highlight film, ${d.highlightFilmMinMinutes}\u2013${d.highlightFilmMaxMinutes} minutes`);
      if (d.includesDocumentary) inc.push("Documentary edit");
      if (d.onlineGallery) inc.push("Online gallery");
      if (d.planningConsultation) inc.push("Planning consultation");
      if (d.prioritySneakPeek) inc.push("Priority sneak peek");
    }
    return { key: `${category}-${mode}-${r.tierSlug}`, name: labels[r.tierSlug] ?? r.tierSlug, description: "", inclusions: inc, price: { kind: "fixed", amount: r.priceUsd, unit: "per booking" }, source: "selling_rates", activities: ACTIVITIES[mode] };
  });
  return { key: `${category}_${mode}`, title: `${category === "wedding" ? "Weddings" : "Events"} \u2014 ${MODE_LABEL[mode]}`, structure: "fixed", items };
}
var CORPORATE_NAMES = { individual_headshot: "Individual headshot", executive_portrait: "Executive portrait" };
function corporateSection(products, tiers2, minimumUsd, retouchPerImageUsd, priority) {
  const items = [...products].sort((a, b) => a.priceUsd - b.priceUsd).map((p) => ({
    key: `corp-${p.productSlug}`,
    name: CORPORATE_NAMES[p.productSlug] ?? p.productSlug,
    description: "",
    specs: p.signatureRetouchedImages > 0 ? [plural(p.signatureRetouchedImages, "signature retouched image")] : [],
    inclusions: [],
    price: { kind: "fixed", amount: p.priceUsd, unit: "per person" },
    source: "selling_rates",
    activities: ["photography"]
  }));
  if (tiers2.length) {
    const sorted = [...tiers2].sort((a, b) => a.minPeople - b.minPeople);
    items.push({
      key: "corp-team",
      name: "Team headshots",
      description: "",
      inclusions: [],
      price: { kind: "from", amount: Math.min(...sorted.map((t) => t.pricePerPersonUsd)), unit: "per person" },
      source: "selling_rates",
      activities: ["photography"],
      tiers: sorted.map((t) => ({ label: `${t.minPeople}\u2013${t.maxPeople} people`, price: { kind: "fixed", amount: t.pricePerPersonUsd, unit: "per person" } }))
    });
  }
  const addons = [];
  if (retouchPerImageUsd && retouchPerImageUsd > 0) addons.push({ name: "Additional retouched image", price: { kind: "fixed", amount: retouchPerImageUsd, unit: "per image" }, activities: ["photography"] });
  const PRIORITY_LABEL = { individual_headshot: "individual headshot", executive_portrait: "executive portrait", team_2_5: "team of 2\u20135", team_6_10: "team of 6\u201310", team_11_25: "team of 11\u201325", team_26_50: "team of 26\u201350" };
  const pr = Object.entries(priority).filter(([, v2]) => typeof v2 === "number" && v2 > 0);
  if (pr.length) addons.push({ name: "Priority delivery", price: { kind: "on_request" }, note: `Adds to the booking total: ${pr.map(([k, v2]) => `${v2}% for an ${PRIORITY_LABEL[k] ?? k}`.replace("an team", "a team")).join("; ")}. Confirmed in the quotation.`, activities: ["photography"] });
  return {
    key: "corporate_headshots",
    title: "Corporate headshots",
    structure: "mixed",
    items,
    addons,
    minimum: minimumUsd && minimumUsd > 0 ? { label: "Minimum booking", price: { kind: "fixed", amount: minimumUsd } } : void 0
  };
}
var SCOPE_LABEL = { focused: "Focused", full_day: "Full day", extended: "Extended" };
var MODE_ACTIVITIES = { photography: ["photography"], film: ["videography"], photography_film: ["photography", "videography"] };
var MODE_TITLE = { photography: "photography", film: "film", photography_film: "photography and film" };
var PHOTO_POST = /* @__PURE__ */ new Set(["additional_finished_image", "advanced_retouch", "high_end_retouch", "creative_composite"]);
var VIDEO_POST = /* @__PURE__ */ new Set(["cutdown_15s", "cutdown_30s", "alternate_edit_60s", "motion_graphics_basic"]);
var postName = (slug) => ({ cutdown_15s: "15-second cutdown", cutdown_30s: "30-second cutdown", alternate_edit_60s: "Alternate edit, 60 seconds" })[slug] ?? slug.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());
function commercialSection(fees, catalogueBaseUsd, catalogueMinimumUsd, post) {
  const order = ["focused", "full_day", "extended"];
  const items = [...fees].sort((a, b) => a.serviceMode.localeCompare(b.serviceMode) || order.indexOf(a.scopeSlug) - order.indexOf(b.scopeSlug)).map((f) => ({
    key: `com-${f.serviceMode}-${f.scopeSlug}`,
    name: `${SCOPE_LABEL[f.scopeSlug] ?? f.scopeSlug} production \u2014 ${MODE_TITLE[f.serviceMode]}`,
    description: "",
    inclusions: [],
    price: { kind: "from", amount: f.priceUsd, unit: "per project" },
    source: "selling_rates",
    activities: MODE_ACTIVITIES[f.serviceMode]
  }));
  if (catalogueBaseUsd && catalogueBaseUsd > 0) items.push({ key: "com-catalogue", name: "Product and catalogue photography", description: "", inclusions: [], price: { kind: "from", amount: catalogueBaseUsd, unit: "per image" }, source: "selling_rates", activities: ["photography"] });
  const addons = [...post].sort((a, b) => a.priceUsd - b.priceUsd).map((r) => ({
    name: postName(r.itemSlug),
    price: r.isFromPrice ? { kind: "from", amount: r.priceUsd } : { kind: "fixed", amount: r.priceUsd },
    activities: PHOTO_POST.has(r.itemSlug) ? ["photography"] : VIDEO_POST.has(r.itemSlug) ? ["videography"] : [UNCLASSIFIED]
  }));
  return {
    key: "commercial",
    title: "Commercial and product photography",
    structure: "from",
    items,
    addons,
    minimum: catalogueMinimumUsd && catalogueMinimumUsd > 0 ? { label: "Minimum for product and catalogue work", price: { kind: "fixed", amount: catalogueMinimumUsd } } : void 0
  };
}

// src/lib/pdf/rateCard/convert.ts
var RATE_MAX_AGE_DAYS = 30;
var DEFAULT_ROUNDING = { kind: "up_to_multiple", multiple: 5 };
var cents = (n) => Math.round(n * 100) / 100;
function applyRounding(exact, rule) {
  const m = rule.multiple;
  if (!(m > 0)) throw new Error("The rounding multiple must be above zero.");
  const q = exact / m;
  const r = rule.kind === "up_to_multiple" ? Math.ceil(cents(q * 1e3) / 1e3) : Math.round(q);
  return cents(r * m);
}
function convertUsd(usd, fx) {
  if (!(usd > 0) || !(fx.rateToUsd > 0)) throw new Error("A conversion needs a positive USD amount and a positive rate.");
  const exact = cents(usd * fx.rateToUsd);
  const rounded = applyRounding(exact, fx.rule);
  return { usdReference: usd, rateToUsd: fx.rateToUsd, exact, rounded, difference: cents(rounded - exact) };
}
var convPrice = (p, fx) => {
  if (p.kind === "on_request") return { price: p };
  const c = convertUsd(p.amount, fx);
  return { price: { ...p, amount: c.rounded }, conversion: c };
};
function convertContent(usd, fx) {
  if (usd.meta.currency !== "USD" || usd.meta.fx) throw new Error("Only a USD card can be converted.");
  const conv = (x) => ({ ...x, ...convPrice(x.price, fx) });
  const sections2 = usd.sections.map((s2) => ({
    ...s2,
    items: s2.items.map((i) => ({ ...conv(i), tiers: i.tiers?.map((t) => conv(t)) })),
    minimum: s2.minimum ? conv(s2.minimum) : void 0,
    addons: s2.addons?.map((a) => conv(a))
  }));
  return { ...usd, meta: { ...usd.meta, currency: fx.currency, fx, conversionPolicy: "proposed" }, sections: sections2 };
}
function conversionReview(c) {
  const rows = [];
  const add = (where, cv) => {
    if (cv) rows.push({ where, usd: cv.usdReference, rate: cv.rateToUsd, exact: cv.exact, rounded: cv.rounded, difference: cv.difference });
  };
  for (const s2 of c.sections) {
    for (const i of s2.items) {
      if (i.included === false) continue;
      add(`${s2.title} \u2014 ${i.name}`, i.conversion);
      i.tiers?.forEach((t) => add(`${s2.title} \u2014 ${i.name} \u2014 ${t.label}`, t.conversion));
    }
    if (s2.minimum) add(`${s2.title} \u2014 ${s2.minimum.label}`, s2.minimum.conversion);
    s2.addons?.forEach((a) => {
      if (a.included !== false) add(`${s2.title} \u2014 ${a.name}`, a.conversion);
    });
  }
  return rows;
}
function checkConversions(c, today) {
  const errs = [];
  const fx = c.meta.fx;
  if (c.meta.currency === "USD") {
    if (fx) errs.push("A USD card must not carry an exchange rate.");
    return errs;
  }
  if (!fx || fx.currency !== c.meta.currency) return [`A ${c.meta.currency} card needs its exchange-rate basis (rate, effective date, source and rounding rule).`];
  if (!(fx.rateToUsd > 0)) errs.push("The exchange rate must be above zero.");
  if (!fx.source.trim()) errs.push("State the source of the exchange rate.");
  const age = Math.floor((Date.parse(today) - Date.parse(fx.effectiveFrom)) / 864e5);
  if (!Number.isFinite(age) || age < 0) errs.push("The exchange rate has no valid effective date.");
  else if (age > RATE_MAX_AGE_DAYS) errs.push(`The exchange rate is ${age} days old (the limit is ${RATE_MAX_AGE_DAYS}). Review the governed rate first.`);
  const check = (where, price, cv) => {
    if (price.kind === "on_request") return;
    if (!cv) {
      errs.push(`${where}: no conversion is recorded for this price.`);
      return;
    }
    const want = convertUsd(cv.usdReference, fx);
    if (cv.rateToUsd !== fx.rateToUsd || cv.exact !== want.exact || cv.rounded !== want.rounded || price.amount !== want.rounded) errs.push(`${where}: the price does not match its USD reference, the stated rate and the rounding rule.`);
  };
  for (const s2 of c.sections) {
    for (const i of s2.items) {
      if (i.included === false) continue;
      check(`${s2.title} \u2014 ${i.name}`, i.price, i.conversion);
      i.tiers?.forEach((t) => check(`${s2.title} \u2014 ${i.name} \u2014 ${t.label}`, t.price, t.conversion));
    }
    if (s2.minimum) check(`${s2.title} \u2014 ${s2.minimum.label}`, s2.minimum.price, s2.minimum.conversion);
    s2.addons?.forEach((a) => {
      if (a.included !== false) check(`${s2.title} \u2014 ${a.name}`, a.price, a.conversion);
    });
  }
  return errs;
}

// src/lib/pdf/rateCard/types.ts
var PLACEHOLDER_MARK = "[PLACEHOLDER]";

// src/lib/pdf/rateCard/validate.ts
var ISO = /^\d{4}-\d{2}-\d{2}$/;
var ALLOWED = {
  root: ["meta", "coverImage", "intro", "sections", "conditions", "contact"],
  meta: ["title", "subtitle", "editionLabel", "effectiveDate", "marketSlug", "marketName", "currency", "conversionPolicy", "fx", "issuingEntity"],
  fx: ["currency", "rateToUsd", "effectiveFrom", "source", "rule"],
  rule: ["kind", "multiple"],
  issuingEntity: ["entityId", "name", "checkedOn", "licensedActivities"],
  section: ["key", "title", "intro", "structure", "items", "minimum", "addons", "notes", "customQuotationNote"],
  item: ["key", "name", "description", "specs", "inclusions", "price", "conversion", "tiers", "note", "source", "activities", "included", "eligibility"],
  addon: ["name", "price", "conversion", "note", "activities", "included", "eligibility"],
  minimum: ["label", "price", "conversion"],
  tier: ["label", "price", "conversion"],
  price: ["kind", "amount", "unit"],
  conversion: ["usdReference", "rateToUsd", "exact", "rounded", "difference"],
  eligibility: ["ok", "reason"],
  note: ["title", "text"],
  contact: ["label", "value"]
};
function unknownKeys(c) {
  const bad = [];
  const chk = (kind, o, where) => {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) if (!ALLOWED[kind].includes(k)) bad.push(`${where}.${k}`);
  };
  chk("root", c, "card");
  chk("meta", c.meta, "meta");
  chk("fx", c.meta?.fx, "meta.fx");
  chk("rule", c.meta?.fx?.rule, "meta.fx.rule");
  chk("issuingEntity", c.meta?.issuingEntity, "meta.issuingEntity");
  const price = (p, w) => chk("price", p, w);
  c.sections?.forEach((s2, si) => {
    const sw = `sections[${si}]`;
    chk("section", s2, sw);
    s2.items?.forEach((i, ii) => {
      const w = `${sw}.items[${ii}]`;
      chk("item", i, w);
      price(i.price, `${w}.price`);
      chk("conversion", i.conversion, `${w}.conversion`);
      chk("eligibility", i.eligibility, `${w}.eligibility`);
      i.tiers?.forEach((t, ti) => {
        chk("tier", t, `${w}.tiers[${ti}]`);
        price(t.price, `${w}.tiers[${ti}].price`);
        chk("conversion", t.conversion, `${w}.tiers[${ti}].conversion`);
      });
    });
    if (s2.minimum) {
      chk("minimum", s2.minimum, `${sw}.minimum`);
      price(s2.minimum.price, `${sw}.minimum.price`);
      chk("conversion", s2.minimum.conversion, `${sw}.minimum.conversion`);
    }
    s2.addons?.forEach((a, ai) => {
      const w = `${sw}.addons[${ai}]`;
      chk("addon", a, w);
      price(a.price, `${w}.price`);
      chk("conversion", a.conversion, `${w}.conversion`);
      chk("eligibility", a.eligibility, `${w}.eligibility`);
    });
  });
  c.conditions?.forEach((x, i) => chk("note", x, `conditions[${i}]`));
  c.contact?.forEach((x, i) => chk("contact", x, `contact[${i}]`));
  return bad;
}
function strings(v2, out2 = []) {
  if (typeof v2 === "string") out2.push(v2);
  else if (Array.isArray(v2)) v2.forEach((x) => strings(x, out2));
  else if (v2 && typeof v2 === "object") Object.values(v2).forEach((x) => strings(x, out2));
  return out2;
}
var placeholderCount = (c) => strings(c).filter((s2) => s2.includes(PLACEHOLDER_MARK)).length;
var priceProblem = (label, p) => {
  if (p.kind === "on_request") return null;
  if (!Number.isFinite(p.amount) || p.amount <= 0) return `\u201C${label}\u201D: enter a price above zero, or choose \u201CPrice on request\u201D.`;
  if (Math.round(p.amount * 100) !== p.amount * 100) return `\u201C${label}\u201D: a price has at most two decimals.`;
  return null;
};
function validateRateCard(c, mode, opts = {}) {
  const errors = [];
  const warnings = [];
  const hard = mode === "approval" ? errors : warnings;
  const m = c.meta;
  if (!m.title.trim()) errors.push("Enter the rate card title.");
  if (!m.editionLabel.trim()) errors.push("Enter the edition label (for example \u201C2026 Edition 1\u201D).");
  if (!ISO.test(m.effectiveDate)) errors.push("Enter the effective date as YYYY-MM-DD.");
  if (!/^[A-Z]{3}$/.test(m.currency)) errors.push("Enter the currency as a three-letter code (for example USD).");
  if (!m.marketName.trim()) errors.push("Name the market the prices apply to.");
  if (c.sections.length === 0) errors.push("Add at least one service category.");
  const seen = /* @__PURE__ */ new Set();
  const live = c.sections.map((s2) => ({ ...s2, items: s2.items.filter((i) => i.included !== false) }));
  for (const s2 of c.sections) {
    if (!s2.title.trim()) errors.push("Every service category needs a title.");
    if (s2.items.length === 0) errors.push(`\u201C${s2.title || s2.key}\u201D has no items.`);
    for (const i of s2.items) {
      if (seen.has(`${s2.key}/${i.key}`)) errors.push(`\u201C${i.name}\u201D appears twice in \u201C${s2.title}\u201D.`);
      seen.add(`${s2.key}/${i.key}`);
      if (!i.name.trim()) errors.push(`An item in \u201C${s2.title}\u201D has no name.`);
      const p = priceProblem(i.name || i.key, i.price);
      if (p) errors.push(p);
      i.tiers?.forEach((t) => {
        const tp = priceProblem(`${i.name} \u2014 ${t.label}`, t.price);
        if (tp) errors.push(tp);
      });
      if (s2.structure === "fixed" && i.price.kind === "from") errors.push(`\u201C${i.name}\u201D: \u201C${s2.title}\u201D is a fixed-price category, so a starting price is not allowed.`);
      if (s2.structure === "from" && i.price.kind === "fixed") errors.push(`\u201C${i.name}\u201D: \u201C${s2.title}\u201D uses starting prices, so a fixed price is not allowed.`);
      if (i.included !== false) {
        if (!i.description.trim()) hard.push(`\u201C${i.name || i.key}\u201D has no approved service description yet.`);
        if (i.source === "placeholder") hard.push(`\u201C${i.name || i.key}\u201D is placeholder content and cannot be approved.`);
        if (i.eligibility && !i.eligibility.ok) hard.push(`\u201C${i.name}\u201D is not eligible for publication: ${i.eligibility.reason}`);
      }
    }
    if (s2.minimum) {
      const p = priceProblem(s2.minimum.label, s2.minimum.price);
      if (p) errors.push(p);
    }
    for (const a of s2.addons ?? []) {
      const p = priceProblem(a.name, a.price);
      if (p) errors.push(p);
      if (a.included !== false && a.eligibility && !a.eligibility.ok) hard.push(`\u201C${a.name}\u201D is not eligible for publication: ${a.eligibility.reason}`);
    }
  }
  if (live.every((s2) => s2.items.length === 0) && c.sections.length > 0) errors.push("Every item is excluded, so there is nothing to publish.");
  for (const e of checkConversions(c, opts.today ?? m.effectiveDate)) (/days old/.test(e) ? hard : errors).push(e);
  if (m.currency !== "USD") {
    if (m.conversionPolicy !== "proposed" && m.conversionPolicy !== "approved") errors.push(`A ${m.currency} card must be marked as proposed or approved currency conversion.`);
    if (mode === "approval" && (m.conversionPolicy !== "approved" || opts.currencyPolicyApproved !== true)) errors.push(`${m.currency} figures stay proposed / indicative until the Founder approves the quotation and payment currency policy, so a ${m.currency} card cannot be approved for clients yet.`);
  }
  const pc = placeholderCount(c);
  if (pc > 0) hard.push(`${pc} text field(s) still contain placeholder wording (${PLACEHOLDER_MARK}) that needs Founder-approved text.`);
  const unknown = unknownKeys(c);
  if (unknown.length) errors.push(`The content contains fields that a rate card may not carry: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ` and ${unknown.length - 5} more` : ""}.`);
  if (mode === "approval") {
    if (c.conditions.length === 0 || c.conditions.some((x) => !x.text.trim())) errors.push("Add the approved conditions (validity, tax, deposits, usage terms) before approval.");
    if (c.contact.length === 0) errors.push("Add the contact and booking details before approval.");
    if (!c.coverImage.trim()) errors.push("Choose the cover image.");
    if (!m.issuingEntity) errors.push("Record which legal entity offers these prices and its verified licensed activities before approval.");
  }
  return { errors, warnings };
}

// scripts/rate-card-demo.tsx
var [rowsPath, out, opacity] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 0.7)];
var j = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
var first = (rows, key) => {
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((r) => seen.has(key(r)) ? false : (seen.add(key(r)), true));
};
var tiers = first(j.tiers, (r) => `${r.category}:${r.serviceMode}:${r.tierSlug}`).map((r) => ({ marketId: "qatar", ...r }));
var deliv = first(j.deliverables, (r) => `${r.category}:${r.tier_slug}:${r.service_mode}`).map((r) => ({
  category: r.category,
  tierSlug: r.tier_slug,
  serviceMode: r.service_mode,
  eventDays: r.event_days,
  coverageHours: r.coverage_hours,
  photographers: r.photographers,
  filmmakers: r.filmmakers,
  professionallyEditedImagesMin: r.professionally_edited_images_min,
  signatureRetouchedImages: r.signature_retouched_images,
  highlightFilmMinMinutes: r.highlight_film_min_minutes === null ? null : Number(r.highlight_film_min_minutes),
  highlightFilmMaxMinutes: r.highlight_film_max_minutes === null ? null : Number(r.highlight_film_max_minutes),
  includesDocumentary: r.includes_documentary,
  onlineGallery: r.online_gallery,
  planningConsultation: r.planning_consultation,
  prioritySneakPeek: r.priority_sneak_peek
}));
var sections = [personalSessionSection(j.personal)];
for (const category of ["wedding", "event"]) for (const mode of ["photography", "film", "photography_film"]) {
  const s2 = weddingEventSection(category, mode, tiers.filter((t) => t.category === category), deliv.filter((d) => d.category === category));
  if (s2.items.length) sections.push(s2);
}
sections.push(corporateSection(j.corpProducts, j.corpTiers, j.corpMinimum, j.corpRetouch, j.corpPriority));
sections.push(commercialSection(j.comFees, j.comBase, j.comMin, j.comPost));
for (const s2 of sections) s2.customQuotationNote = `${PLACEHOLDER_MARK} Wording for requirements that do not fit a standard package.`;
var draft = {
  meta: { title: "Rate Card", subtitle: "Qatar \u2014 demonstration draft. Prices are proposed QAR conversions of the current USD selling rates and are not approved.", editionLabel: "DEMO draft", effectiveDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), marketSlug: "qatar", marketName: "Qatar / GCC", currency: "USD", conversionPolicy: "none" },
  coverImage: path.join(process.cwd(), "public/pdf/cover-placeholder.jpg"),
  sections,
  conditions: [{ title: "Prices", text: `${PLACEHOLDER_MARK} Approved wording on currency, validity and what the prices include.` }, { title: "Tax and deposits", text: `${PLACEHOLDER_MARK} Approved wording on tax, deposits and payment schedule.` }, { title: "Usage and delivery", text: `${PLACEHOLDER_MARK} Approved wording on usage rights and delivery timelines.` }],
  contact: [{ label: "Website", value: "ordiftstudios.com" }, { label: "Email", value: `${PLACEHOLDER_MARK} contact email` }, { label: "WhatsApp", value: `${PLACEHOLDER_MARK} booking number` }]
};
draft = applyEligibility(draft, { entityName: "ORDIFT STUDIOS (Qatar W.L.L.)", checkedOn: draft.meta.effectiveDate, keys: ["photography"] });
draft = convertContent(draft, { currency: "QAR", rateToUsd: j.fx.rateToUsd, effectiveFrom: j.fx.effectiveFrom, source: j.fx.reason || "Governed exchange-rate table (QAR)", rule: DEFAULT_ROUNDING });
var v = validateRateCard(draft, "draft", { today: draft.meta.effectiveDate });
console.log("draft errors:", v.errors.length, "| warnings:", v.warnings.length, "| conversions:", conversionReview(draft).length, "| excluded:", excludedByEligibility(draft).length);
fs.writeFileSync(out.replace(/\.pdf$/, ".json"), JSON.stringify(draft, null, 1));
fs.writeFileSync(out.replace(/\.pdf$/, "-review.json"), JSON.stringify(conversionReview(draft), null, 1));
fs.writeFileSync(out.replace(/\.pdf$/, "-excluded.json"), JSON.stringify(excludedByEligibility(draft), null, 1));
registerBrandFonts(path.join(process.cwd(), "public/fonts/pdf"));
var t0 = Date.now();
renderToFile(React.createElement(RateCardDocument, { content: draft, status: { state: "draft" }, coverPanelOpacity: opacity, logoWhite: path.join(process.cwd(), "public/brand/logo-full-white.png") }), out).then(() => console.log(`rendered in ${Date.now() - t0} ms`));
