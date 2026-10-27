// scripts/rate-card-preview.tsx
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
  draftBar: { fontFamily: "Inter", position: "absolute", top: 22, right: 50, fontSize: 7.5, letterSpacing: 1.3, textTransform: "uppercase", color: BRAND.goldPressed, fontWeight: 600 }
});
function Item({ i, currency }) {
  const p = formatPrice(i.price, currency);
  return /* @__PURE__ */ jsxs(View, { style: s.item, wrap: false, children: [
    /* @__PURE__ */ jsxs(View, { style: s.itemMain, children: [
      /* @__PURE__ */ jsx(Text, { style: s.itemName, children: i.name }),
      i.description ? /* @__PURE__ */ jsx(Text, { style: s.itemDesc, children: i.description }) : null,
      i.inclusions.map((x, n) => /* @__PURE__ */ jsxs(View, { style: s.inc, children: [
        /* @__PURE__ */ jsx(Text, { style: s.incDot, children: "\u2013" }),
        /* @__PURE__ */ jsx(Text, { style: s.incText, children: x })
      ] }, n))
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
    /* @__PURE__ */ jsxs(View, { style: s.footer, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { children: "Ordift Studios \xB7 ordiftstudios.com" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        c.meta.title,
        " \xB7 ",
        c.meta.editionLabel
      ] }),
      /* @__PURE__ */ jsx(Text, { render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` })
    ] })
  ] });
}
function Section({ sec, c, status }) {
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
    sec.intro ? /* @__PURE__ */ jsx(Text, { style: s.intro, children: sec.intro }) : null,
    sec.items.map((i) => /* @__PURE__ */ jsx(Item, { i, currency: c.meta.currency }, i.key))
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
      /* @__PURE__ */ jsxs(View, { style: s.coverFoot, children: [
        /* @__PURE__ */ jsx(Text, { children: "ordiftstudios.com" }),
        status.state === "draft" ? /* @__PURE__ */ jsx(Text, { style: s.draftTag, children: "Draft \u2014 not approved" }) : /* @__PURE__ */ jsxs(Text, { children: [
          "Edition ",
          status.editionId
        ] })
      ] })
    ] }),
    c.sections.map((sec) => /* @__PURE__ */ jsx(Section, { sec, c, status }, sec.key)),
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

// scripts/rate-card-preview.tsx
var root = process.cwd();
registerBrandFonts(path.join(root, "public/fonts/pdf"));
var t0 = Date.now();
var content = { ...SAMPLE_RATE_CARD, coverImage: path.join(root, "public/pdf/cover-placeholder.jpg") };
renderToFile(React.createElement(RateCardDocument, { content, status: { state: "draft" }, coverPanelOpacity: Number(process.argv[3] ?? 0.8), logoWhite: path.join(root, "public/brand/logo-full-white.png") }), process.argv[2] ?? "rate-card.pdf").then(() => console.log(`rendered in ${Date.now() - t0} ms`));
