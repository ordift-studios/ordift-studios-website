/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF drawing primitive, not an HTML <img> */
import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND as C } from "../brand";
import { COVER_PANEL_OPACITY, coverOf, coverWording } from "./cover";
import type { EditionStatus, RateCardContent } from "./types";

// The approved cover (Founder-approved design, 2026-10): the photograph fills the page and the upper part carries nothing — no logo, no text. One semi-transparent charcoal panel sits flush against
// the bottom edge and holds, top to bottom, the official logo, the title, the service descriptor and the edition line. The photograph is only ever cropped (never recoloured or retouched) and is not
// darkened: the panel is the only layer above it. The logo artwork is used as supplied.
const PANEL_W = 318;
const LOGO_W = 88, LOGO_RATIO = 461 / 348; // the supplied logo file's own proportions
const CHARCOAL = "#25272c", CHAMPAGNE = "#d8c8a0", TITLE = "#f6f2ea";

const s = StyleSheet.create({
  page: { backgroundColor: C.navy, fontFamily: "Inter" },
  photo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, objectFit: "cover" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  panel: { width: PANEL_W },
  panelBg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: CHARCOAL },
  body: { alignItems: "center", paddingTop: 26, paddingHorizontal: 20 },
  title: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 46, color: TITLE, letterSpacing: -0.5, lineHeight: 1, marginTop: 18 },
  hair: { width: 24, height: 0.7, backgroundColor: CHAMPAGNE, marginTop: 16, opacity: 0.9 },
  descriptor: { fontFamily: "Inter", fontWeight: 500, fontSize: 7.8, letterSpacing: 3.2, textTransform: "uppercase", color: TITLE, marginTop: 14 },
  edition: { fontFamily: "Inter", fontWeight: 500, fontSize: 7.3, letterSpacing: 3.2, textTransform: "uppercase", color: CHAMPAGNE, marginTop: 8 },
  control: { fontFamily: "Inter", fontWeight: 600, fontSize: 6.2, letterSpacing: 1.4, textTransform: "uppercase", color: CHAMPAGNE, marginTop: 14, opacity: 0.85 },
  watermark: { position: "absolute", top: 280, left: 40, fontFamily: "Fraunces", fontSize: 170, color: "#ffffff", opacity: 0.16, transform: "rotate(-32deg)" },
});

export function CoverPage({ content: c, status, logoWhite, panelOpacity = COVER_PANEL_OPACITY }: { content: RateCardContent; status: EditionStatus; logoWhite: string; panelOpacity?: number }) {
  const cov = coverOf(c), words = coverWording(c);
  const draft = status.state === "draft";
  return (
    <Page size="A4" style={s.page}>
      {c.coverImage ? <Image src={c.coverImage} style={[s.photo, { objectPositionX: "50%", objectPositionY: `${Math.round(cov.focusY * 100)}%` }]} /> : null}
      {draft ? <Text style={s.watermark}>DRAFT</Text> : null}
      <View style={s.dock}>
        <View style={s.panel}>
          <View style={[s.panelBg, { opacity: panelOpacity }]} />
          <View style={[s.body, { paddingBottom: draft ? 20 : 28 }]}>
            <Image src={logoWhite} style={{ width: LOGO_W, height: LOGO_W / LOGO_RATIO }} />
            <Text style={s.title}>{c.meta.title}</Text>
            <View style={s.hair} />
            {words.descriptor ? <Text style={s.descriptor}>{words.descriptor}</Text> : null}
            <Text style={words.descriptor ? s.edition : [s.edition, { marginTop: 14 }]}>{words.edition}</Text>
            {draft ? <Text style={s.control}>Draft — not approved</Text> : <Text style={s.control}>{c.meta.editionLabel}</Text>}
          </View>
        </View>
      </View>
    </Page>
  );
}
