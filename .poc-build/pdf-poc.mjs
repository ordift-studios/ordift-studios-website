// scripts/pdf-poc.tsx
import path from "node:path";
import { renderToFile } from "@react-pdf/renderer";

// src/lib/pdf/poc/fonts.ts
import { Font } from "@react-pdf/renderer";
var done = false;
function registerPocFonts(base) {
  if (done) return;
  Font.register({ family: "Fraunces", fonts: [{ src: `${base}/Fraunces-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Fraunces-SemiBold.ttf`, fontWeight: 600 }] });
  Font.register({ family: "Inter", fonts: [{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 }, { src: `${base}/Inter-Medium.ttf`, fontWeight: 500 }, { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 }] });
  Font.registerHyphenationCallback((word) => [word]);
  done = true;
}

// src/lib/pdf/poc/OrdiftPocDocument.tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { jsx, jsxs } from "react/jsx-runtime";
var NAVY = "#0b1220";
var GOLD = "#bfa14a";
var OFFWHITE = "#f7f5f1";
var INK = "#1a1d24";
var INK_MUTED = "#5b5f6b";
var s = StyleSheet.create({
  cover: { backgroundColor: NAVY, padding: 0, color: OFFWHITE, fontFamily: "Inter" },
  coverInner: { flex: 1, paddingHorizontal: 56, paddingTop: 64, paddingBottom: 48, justifyContent: "space-between" },
  logo: { width: 112 },
  rule: { width: 64, height: 2, backgroundColor: GOLD, marginBottom: 22 },
  eyebrow: { fontSize: 9, letterSpacing: 2.4, color: GOLD, fontWeight: 600, textTransform: "uppercase", marginBottom: 14 },
  coverTitle: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 54, lineHeight: 1.04, color: OFFWHITE },
  coverSub: { fontSize: 11.5, lineHeight: 1.6, color: "#c9ccd6", marginTop: 18, width: 330 },
  coverFoot: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: "#2b3550", paddingTop: 12, fontSize: 8.5, color: "#9aa1b4" },
  page: { backgroundColor: OFFWHITE, paddingHorizontal: 56, paddingTop: 54, paddingBottom: 64, fontFamily: "Inter", color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26 },
  h1: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 28, color: NAVY },
  stamp: { fontSize: 8, letterSpacing: 1.6, color: GOLD, fontWeight: 600, textTransform: "uppercase" },
  sectionTitle: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 17, color: NAVY, marginTop: 4, marginBottom: 4 },
  sectionNote: { fontSize: 9.5, lineHeight: 1.55, color: INK_MUTED, marginBottom: 10, width: 400 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GOLD, paddingBottom: 5, marginBottom: 2 },
  th: { fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: INK_MUTED, fontWeight: 600 },
  row: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#dcd8cf", alignItems: "flex-start" },
  cName: { width: "30%", fontWeight: 600, fontSize: 10.5 },
  cDesc: { width: "48%", fontSize: 9.5, lineHeight: 1.5, color: INK_MUTED, paddingRight: 14 },
  cPrice: { width: "22%", textAlign: "right", fontSize: 12, fontFamily: "Inter", fontWeight: 500 },
  priceSub: { fontSize: 7.5, color: INK_MUTED, textAlign: "right", marginTop: 2 },
  cond: { marginTop: 26, padding: 14, backgroundColor: "#efece4", borderLeftWidth: 2, borderLeftColor: GOLD },
  condTitle: { fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600, color: NAVY, marginBottom: 5 },
  condText: { fontSize: 9, lineHeight: 1.55, color: INK_MUTED },
  footer: { position: "absolute", left: 56, right: 56, bottom: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: INK_MUTED, borderTopWidth: 0.5, borderTopColor: "#dcd8cf", paddingTop: 8 },
  photoPage: { backgroundColor: NAVY, padding: 0 },
  photo: { width: "100%", height: 600, objectFit: "cover" },
  caption: { flex: 1, paddingHorizontal: 56, paddingTop: 30, color: OFFWHITE, fontFamily: "Inter" },
  capTitle: { fontFamily: "Fraunces", fontSize: 22, color: OFFWHITE, marginBottom: 8 },
  capText: { fontSize: 10, lineHeight: 1.6, color: "#c9ccd6", width: 380 }
});
var SAMPLE_ROWS = [
  ["Sample package A", "Placeholder description used only to test wrapping, spacing and line height in a two-line row.", "1,111", "SAMPLE PRICE"],
  ["Sample package B", "Placeholder description. Currency symbols below test glyph coverage: $ \u20AC \xA3 \u20B5 \u2014 and tabular figures.", "2,222", "SAMPLE PRICE"],
  ["Sample package C", "Placeholder description for a larger package with several lines of descriptive text to check the layout.", "3,333", "SAMPLE PRICE"],
  ["Sample add-on", "Short placeholder line.", "444", "SAMPLE PRICE"]
];
function OrdiftPocDocument({ logoWhite, photo, stampDate }) {
  return /* @__PURE__ */ jsxs(Document, { title: "Ordift Studios \u2014 Rate Card (SAMPLE, proof of concept)", author: "Ordift Studios", subject: "Proof of concept. Sample prices only. Not for distribution.", creator: "Ordift Studios", producer: "Ordift Studios", children: [
    /* @__PURE__ */ jsx(Page, { size: "A4", style: s.cover, children: /* @__PURE__ */ jsxs(View, { style: s.coverInner, children: [
      /* @__PURE__ */ jsx(Image, { src: logoWhite, style: s.logo }),
      /* @__PURE__ */ jsxs(View, { children: [
        /* @__PURE__ */ jsx(View, { style: s.rule }),
        /* @__PURE__ */ jsx(Text, { style: s.eyebrow, children: "Sample \xB7 proof of concept" }),
        /* @__PURE__ */ jsx(Text, { style: s.coverTitle, children: "Rate Card" }),
        /* @__PURE__ */ jsx(Text, { style: s.coverSub, children: "Layout test for the Ordift Studios client documents. Every figure and picture in this file is a placeholder." })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.coverFoot, children: [
        /* @__PURE__ */ jsx(Text, { children: "ordiftstudios.com" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "Edition: SAMPLE \u2014 ",
          stampDate
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.page, children: [
      /* @__PURE__ */ jsxs(View, { style: s.head, children: [
        /* @__PURE__ */ jsx(Text, { style: s.h1, children: "Photography" }),
        /* @__PURE__ */ jsx(Text, { style: s.stamp, children: "Sample prices \u2014 not real" })
      ] }),
      /* @__PURE__ */ jsx(Text, { style: s.sectionTitle, children: "Session packages" }),
      /* @__PURE__ */ jsx(Text, { style: s.sectionNote, children: "Prices below are fake and exist only to test the layout. USD, per booking, exclusive of tax (sample wording)." }),
      /* @__PURE__ */ jsxs(View, { style: s.thead, children: [
        /* @__PURE__ */ jsx(Text, { style: [s.th, { width: "30%" }], children: "Package" }),
        /* @__PURE__ */ jsx(Text, { style: [s.th, { width: "48%" }], children: "What is included" }),
        /* @__PURE__ */ jsx(Text, { style: [s.th, { width: "22%", textAlign: "right" }], children: "Price (USD)" })
      ] }),
      SAMPLE_ROWS.map(([n, d, p, note]) => /* @__PURE__ */ jsxs(View, { style: s.row, wrap: false, children: [
        /* @__PURE__ */ jsx(Text, { style: s.cName, children: n }),
        /* @__PURE__ */ jsx(Text, { style: s.cDesc, children: d }),
        /* @__PURE__ */ jsxs(View, { style: { width: "22%" }, children: [
          /* @__PURE__ */ jsx(Text, { style: [s.cPrice, { width: "100%" }], children: p }),
          /* @__PURE__ */ jsx(Text, { style: s.priceSub, children: note })
        ] })
      ] }, n)),
      /* @__PURE__ */ jsxs(View, { style: s.cond, children: [
        /* @__PURE__ */ jsx(Text, { style: s.condTitle, children: "Conditions (sample wording)" }),
        /* @__PURE__ */ jsx(Text, { style: s.condText, children: "Sample conditions text for layout testing only. The real wording, validity, tax and usage terms will be supplied and approved by the Founder." })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.footer, fixed: true, children: [
        /* @__PURE__ */ jsx(Text, { children: "Ordift Studios \xB7 ordiftstudios.com" }),
        /* @__PURE__ */ jsx(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Page, { size: "A4", style: s.photoPage, children: [
      /* @__PURE__ */ jsx(Image, { src: photo, style: s.photo }),
      /* @__PURE__ */ jsxs(View, { style: s.caption, children: [
        /* @__PURE__ */ jsx(Text, { style: s.capTitle, children: "Test photograph" }),
        /* @__PURE__ */ jsx(Text, { style: s.capText, children: "Placeholder image generated for this test (3600 \xD7 2400 px). It is not a photograph of a client and carries no permission question. Used to measure embedded image quality and file size." })
      ] })
    ] })
  ] });
}

// scripts/pdf-poc.tsx
import React from "react";
var root = path.resolve(process.cwd());
registerPocFonts(path.join(root, "public/fonts/pdf-poc"));
var out = process.argv[2] ?? "poc.pdf";
var t0 = Date.now();
renderToFile(React.createElement(OrdiftPocDocument, { logoWhite: path.join(root, "public/brand/logo-full-white.png"), photo: path.join(root, "public/pdf-poc/placeholder-3600x2400.jpg"), stampDate: "27 Oct 2026" }), out).then(() => console.log(`rendered ${out} in ${Date.now() - t0} ms`));
