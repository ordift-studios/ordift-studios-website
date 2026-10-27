// scripts/rate-card-quality.tsx
import path from "node:path";
import React from "react";
import { renderToFile } from "@react-pdf/renderer";

// src/lib/pdf/fonts.ts
import { Font } from "@react-pdf/renderer";
var done = false;
function registerBrandFonts(base2) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base2}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base2}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base2}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base2}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base2}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
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
    "   ",
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

// src/lib/pdf/rateCard/sample.ts
var ph = (key, name, kind, amount, inc, unit) => ({
  key,
  name,
  description: "Placeholder service description \u2014 the Founder will supply the approved wording. It is here only to show how a short paragraph sets in the layout.",
  inclusions: inc,
  price: { kind, amount, unit },
  source: "placeholder"
});
var SAMPLE_RATE_CARD = {
  meta: { title: "Rate Card", subtitle: "Sample layout. Every figure, description and condition in this document is a placeholder.", editionLabel: "SAMPLE edition", effectiveDate: "2026-10-28", marketSlug: "sample", marketName: "Sample market", currency: "USD" },
  coverImage: "",
  intro: "Placeholder introduction to the booking page. The Founder will supply the approved text.",
  sections: [
    { key: "sample_fixed", title: "Sample packages (fixed prices)", structure: "fixed", intro: "A fixed-price category: each package has one price. Placeholder text.", items: [
      ph("a", "Sample package A", "fixed", 1111, ["2 hours of coverage", "40 professionally edited images", "Online gallery"], "per session"),
      ph("b", "Sample package B", "fixed", 2222, ["4 hours of coverage", "80 professionally edited images", "10 signature retouched images", "Online gallery"], "per session"),
      { ...ph("c", "Sample package C", "fixed", 3333, ["8 hours of coverage", "2 photographers", "Highlight film, 3\u20135 minutes", "Priority sneak peek"], "per booking"), note: "Placeholder condition: travel quoted separately." }
    ] },
    { key: "sample_from", title: "Sample services (starting prices)", structure: "from", intro: "A starting-price category: the final price is quoted for each brief. Placeholder text.", items: [
      ph("d", "Sample service D", "from", 444, ["Scoped to the brief", "Two rounds of revisions"], "per project"),
      ph("e", "Sample service E", "from", 5555, ["Concept and creative direction", "Production and delivery"], "per project"),
      { key: "f", name: "Sample service F", description: "Placeholder: a service priced entirely on request.", inclusions: [], price: { kind: "on_request" }, source: "placeholder" }
    ] }
  ],
  conditions: [
    { title: "Prices (placeholder)", text: "Placeholder wording. The Founder will supply the approved statement on currency, validity and what the prices include." },
    { title: "Tax and deposits (placeholder)", text: "Placeholder wording on tax, deposits and payment schedule \u2014 not real terms." },
    { title: "Usage and delivery (placeholder)", text: "Placeholder wording on usage rights and delivery timelines \u2014 not real terms." }
  ],
  contact: [
    { label: "Website", value: "ordiftstudios.com" },
    { label: "Email", value: "Contact email to be confirmed" },
    { label: "WhatsApp", value: "Booking number to be confirmed" }
  ]
};

// scripts/rate-card-quality.tsx
var [out, small, large] = [process.argv[2], process.argv[3], process.argv[4]];
var root = process.cwd();
registerBrandFonts(path.join(root, "public/fonts/pdf"));
var logo = path.join(root, "public/brand/logo-full-white.png");
var cover = path.join(root, "public/pdf/cover-placeholder.jpg");
var long = "A long approved description written to test line wrapping and page breaks across several lines of body text in the pricing layout. ".repeat(10);
var item = (n, over = {}) => ({ key: `i${n}`, name: `Package ${n} with a deliberately long service name that has to wrap onto a second line`, description: n % 3 === 0 ? long : "Short approved description.", specs: ["2 hours", "20 edited images"], inclusions: Array.from({ length: n % 5 === 0 ? 14 : 3 }, (_, k) => `Inclusion line ${k + 1} for package ${n}`), price: { kind: n % 2 ? "fixed" : "from", amount: 1e3 + n * 15, unit: "per booking" }, source: "manual", ...over });
var base = () => ({ ...SAMPLE_RATE_CARD, coverImage: cover });
var many = (n) => ({ ...base(), sections: [0, 1, 2].map((s2) => ({ key: `s${s2}`, title: `Category ${s2 + 1}`, structure: "mixed", items: Array.from({ length: n }, (_, k) => item(k + s2 * 100 + 1)), customQuotationNote: "[PLACEHOLDER] custom note" })) });
var jobs = [
  ["long-text", { ...base(), sections: [{ key: "s", title: "Long text", structure: "mixed", items: Array.from({ length: 6 }, (_, k) => item(k * 3 + 3)) }] }, "draft"],
  ["many-items", many(24), "draft"],
  ["cover-small", { ...base(), coverImage: small }, "draft"],
  ["cover-large", { ...base(), coverImage: large }, "draft"],
  ["cover-missing", { ...base(), coverImage: "" }, "draft"],
  ["approved", { ...base(), sections: [{ key: "s", title: "Approved", structure: "mixed", items: [item(1), item(2)] }] }, "approved"]
];
(async () => {
  for (const [name, content, st] of jobs) {
    const t0 = Date.now();
    await renderToFile(React.createElement(RateCardDocument, { content, status: st === "draft" ? { state: "draft" } : { state: "approved", editionId: "ED-1", approvedBy: "Founder", approvedAt: "2026-11-01T00:00:00Z", contentHash: "0123456789abcdef".repeat(4) }, logoWhite: logo, coverPanelOpacity: 0.7 }), path.join(out, `${name}.pdf`));
    console.log(`${name}: ${Date.now() - t0} ms`);
  }
})();
