// LOCAL PROOF OF CONCEPT (branch pdf-poc, never deployed). Three A4 pages: branded cover, a rate-card page with SAMPLE prices, a full-bleed test photograph.
/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF drawing primitive, not an HTML <img>; PDF alt text is not supported by the library */
// Everything here is placeholder content: the prices are fake, the picture is a generated test image (no client photograph), nothing is published.
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export const NAVY = "#0b1220"; export const NAVY_900 = "#111a2e"; export const GOLD = "#bfa14a"; export const OFFWHITE = "#f7f5f1"; export const INK = "#1a1d24"; export const INK_MUTED = "#5b5f6b";

const s = StyleSheet.create({
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
  capText: { fontSize: 10, lineHeight: 1.6, color: "#c9ccd6", width: 380 },
});

const SAMPLE_ROWS: [string, string, string, string][] = [
  ["Sample package A", "Placeholder description used only to test wrapping, spacing and line height in a two-line row.", "1,111", "SAMPLE PRICE"],
  ["Sample package B", "Placeholder description. Currency symbols below test glyph coverage: $ € £ ₵ — and tabular figures.", "2,222", "SAMPLE PRICE"],
  ["Sample package C", "Placeholder description for a larger package with several lines of descriptive text to check the layout.", "3,333", "SAMPLE PRICE"],
  ["Sample add-on", "Short placeholder line.", "444", "SAMPLE PRICE"],
];

export function OrdiftPocDocument({ logoWhite, photo, stampDate }: { logoWhite: string; photo: string; stampDate: string }) {
  return (
    <Document title="Ordift Studios — Rate Card (SAMPLE, proof of concept)" author="Ordift Studios" subject="Proof of concept. Sample prices only. Not for distribution." creator="Ordift Studios" producer="Ordift Studios">
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <Image src={logoWhite} style={s.logo} />
          <View>
            <View style={s.rule} />
            <Text style={s.eyebrow}>Sample · proof of concept</Text>
            <Text style={s.coverTitle}>Rate Card</Text>
            <Text style={s.coverSub}>Layout test for the Ordift Studios client documents. Every figure and picture in this file is a placeholder.</Text>
          </View>
          <View style={s.coverFoot}><Text>ordiftstudios.com</Text><Text>Edition: SAMPLE — {stampDate}</Text></View>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <View style={s.head}><Text style={s.h1}>Photography</Text><Text style={s.stamp}>Sample prices — not real</Text></View>
        <Text style={s.sectionTitle}>Session packages</Text>
        <Text style={s.sectionNote}>Prices below are fake and exist only to test the layout. USD, per booking, exclusive of tax (sample wording).</Text>
        <View style={s.thead}><Text style={[s.th, { width: "30%" }]}>Package</Text><Text style={[s.th, { width: "48%" }]}>What is included</Text><Text style={[s.th, { width: "22%", textAlign: "right" }]}>Price (USD)</Text></View>
        {SAMPLE_ROWS.map(([n, d, p, note]) => (
          <View key={n} style={s.row} wrap={false}>
            <Text style={s.cName}>{n}</Text><Text style={s.cDesc}>{d}</Text>
            <View style={{ width: "22%" }}><Text style={[s.cPrice, { width: "100%" }]}>{p}</Text><Text style={s.priceSub}>{note}</Text></View>
          </View>
        ))}
        <View style={s.cond}><Text style={s.condTitle}>Conditions (sample wording)</Text><Text style={s.condText}>Sample conditions text for layout testing only. The real wording, validity, tax and usage terms will be supplied and approved by the Founder.</Text></View>
        <View style={s.footer} fixed><Text>Ordift Studios · ordiftstudios.com</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>

      <Page size="A4" style={s.photoPage}>
        <Image src={photo} style={s.photo} />
        <View style={s.caption}>
          <Text style={s.capTitle}>Test photograph</Text>
          <Text style={s.capText}>Placeholder image generated for this test (3600 × 2400 px). It is not a photograph of a client and carries no permission question. Used to measure embedded image quality and file size.</Text>
        </View>
      </Page>
    </Document>
  );
}
