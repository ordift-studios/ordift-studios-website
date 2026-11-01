/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF drawing primitive, not an HTML <img> */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND as C } from "../brand";
import type { PortfolioContent, PortfolioMode } from "./types";

export const PREVIEW_BANNER = "INTERNAL PREVIEW — NOT FOR DISTRIBUTION";
export const bannerFor = (mode: PortfolioMode): string | null => (mode === "internal_preview" ? PREVIEW_BANNER : null);

const s = StyleSheet.create({
  page: { backgroundColor: C.offwhite, paddingHorizontal: 50, paddingTop: 52, paddingBottom: 64, fontFamily: "Inter", color: C.ink },
  cover: { backgroundColor: C.navy, paddingHorizontal: 60, paddingTop: 0, paddingBottom: 0, fontFamily: "Inter", justifyContent: "flex-end" },
  coverImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, objectFit: "cover" },
  coverPanel: { backgroundColor: "#25272c", paddingVertical: 34, paddingHorizontal: 34, marginBottom: 60, width: 330 },
  coverTitle: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 40, color: "#f6f2ea", lineHeight: 1 },
  coverSub: { fontFamily: "Inter", fontWeight: 500, fontSize: 8, letterSpacing: 3, textTransform: "uppercase", color: "#d8c8a0", marginTop: 14 },
  h1: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 22, color: C.navy, borderBottomWidth: 1.2, borderBottomColor: C.gold, paddingBottom: 10, marginBottom: 14 },
  p: { fontFamily: "Inter", fontSize: 10.4, lineHeight: 1.6, color: C.inkMuted, marginBottom: 9, width: 440 },
  figure: { marginBottom: 16 }, img: { width: "100%", maxHeight: 330, objectFit: "contain", backgroundColor: C.tint },
  cap: { fontFamily: "Inter", fontSize: 8.6, color: C.inkMuted, marginTop: 4 }, desc: { fontFamily: "Inter", fontSize: 9.4, lineHeight: 1.5, color: C.ink, marginTop: 3 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: C.rule }, lab: { width: 110, fontSize: 9, color: C.inkMuted }, val: { fontSize: 10.4, color: C.ink },
  small: { fontFamily: "Inter", fontSize: 8.4, color: C.inkMuted, marginTop: 3 },
  watermark: { position: "absolute", top: 330, left: 40, fontFamily: "Fraunces", fontSize: 34, color: "#b3261e", opacity: 0.13, transform: "rotate(-32deg)" },
  foot: { position: "absolute", bottom: 28, left: 50, right: 50, fontSize: 7.6, color: C.inkMuted, flexDirection: "row", justifyContent: "space-between" },
});

const Mark = ({ mode }: { mode: PortfolioMode }) => (bannerFor(mode) ? <Text style={s.watermark} fixed>{PREVIEW_BANNER}</Text> : null);
const Foot = ({ c, mode }: { c: PortfolioContent; mode: PortfolioMode }) => <View style={s.foot} fixed><Text>{c.editionLabel}{mode === "internal_preview" ? " · internal preview" : ""}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>;

export function PortfolioDocument({ content: c, mode }: { content: PortfolioContent; mode: PortfolioMode }) {
  return (
    <Document title={`${c.title} — ${c.editionLabel}${mode === "internal_preview" ? " (internal preview)" : ""}`} author="Ordift Studios">
      <Page size="A4" style={s.cover}>
        {c.coverImageSrc ? <Image src={c.coverImageSrc} style={s.coverImg} /> : null}
        <View style={s.coverPanel}><Text style={s.coverTitle}>{c.title}</Text><Text style={s.coverSub}>{c.editionLabel}</Text>{bannerFor(mode) ? <Text style={[s.coverSub, { color: "#ff9a92" }]}>{PREVIEW_BANNER}</Text> : null}</View>
      </Page>
      {c.studioIntro.length ? (
        <Page size="A4" style={s.page}><Mark mode={mode} /><Text style={s.h1}>Ordift Studios</Text>{c.studioIntro.map((t, i) => <Text key={i} style={s.p}>{t}</Text>)}<Foot c={c} mode={mode} /></Page>
      ) : null}
      {c.categories.filter((x) => x.items.length).map((cat) => (
        <Page key={cat.key} size="A4" style={s.page} wrap><Mark mode={mode} /><Text style={s.h1}>{cat.title}</Text>{cat.intro ? <Text style={s.p}>{cat.intro}</Text> : null}
          {cat.items.map((i) => <View key={`${cat.key}-${i.fileId}`} style={s.figure} wrap={false}><Image src={i.imageSrc} style={s.img} />{i.caption ? <Text style={s.cap}>{i.caption}</Text> : null}{i.description ? <Text style={s.desc}>{i.description}</Text> : null}</View>)}
          <Foot c={c} mode={mode} /></Page>
      ))}
      <Page size="A4" style={s.page}><Mark mode={mode} /><Text style={s.h1}>Contact</Text>
        {c.contact.map((r) => <View key={r.label} style={s.row}><Text style={s.lab}>{r.label}</Text><Text style={s.val}>{r.value}</Text></View>)}
        <Text style={[s.h1, { marginTop: 26, fontSize: 14 }]}>Edition</Text><Text style={s.small}>{c.editionLabel} · prepared {c.preparedOn}</Text>
        {c.approvals.length ? c.approvals.map((a, k) => <Text key={k} style={s.small}>{a.step}: {a.by}, {a.at}{a.note ? ` — ${a.note}` : ""}</Text>) : <Text style={s.small}>No approval recorded.</Text>}
        <Foot c={c} mode={mode} /></Page>
    </Document>
  );
}
