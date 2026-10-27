/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF drawing primitive, not an HTML <img> */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND as C } from "../brand";
import type { Addon, EditionStatus, PriceSpec, RateCardContent, RateCardItem, RateCardSection } from "./types";

const A4 = { w: 595, h: 841 }; // a hair under the A4 page (595.28 × 841.89) so the full-page cover image never overflows its page

export function formatAmount(n: number): string { return n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); }
export function formatPrice(p: PriceSpec, currency: string): { prefix: string; amount: string; unit: string } {
  if (p.kind === "on_request") return { prefix: "", amount: "On request", unit: "" };
  return { prefix: p.kind === "from" ? "From" : "", amount: `${currency} ${formatAmount(p.amount)}`, unit: p.unit ?? "" };
}

const s = StyleSheet.create({
  coverPage: { backgroundColor: C.navy, color: C.offwhite, fontFamily: "Inter" },
  coverImg: { position: "absolute", top: 0, left: 0, width: A4.w, height: A4.h, objectFit: "cover" },
  coverShade: { position: "absolute", top: 0, left: 0, width: A4.w, height: A4.h, backgroundColor: C.navy, opacity: 0.18 },
  logo: { position: "absolute", top: 46, left: 46, width: 112 },
  panelBg: { position: "absolute", left: 46, bottom: 96, width: 372, height: 250, backgroundColor: C.panelGrey },
  panel: { position: "absolute", left: 46, bottom: 96, width: 372, height: 250, paddingHorizontal: 30, paddingTop: 30, justifyContent: "space-between", paddingBottom: 26 },
  rule: { width: 48, height: 2, backgroundColor: C.gold, marginBottom: 14 },
  eyebrow: { fontFamily: "Inter", fontSize: 8.5, letterSpacing: 2.2, color: C.gold, fontWeight: 600, textTransform: "uppercase" },
  title: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 50, lineHeight: 1.02, color: C.offwhite, marginTop: 4 },
  subtitle: { fontSize: 11, lineHeight: 1.55, color: "#d6d9e2", marginTop: 8, width: 300 },
  panelMeta: { fontFamily: "Inter", fontSize: 8.5, letterSpacing: 0.4, color: "#b9bfce", lineHeight: 1.5 },
  coverFoot: { fontFamily: "Inter", position: "absolute", left: 46, right: 46, bottom: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: "#e8e6df" },
  draftTag: { fontFamily: "Inter", color: C.gold, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" },
  page: { backgroundColor: C.offwhite, paddingHorizontal: 50, paddingTop: 52, paddingBottom: 72, fontFamily: "Inter", color: C.ink },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottomWidth: 1.2, borderBottomColor: C.gold, marginBottom: 6 },
  h1: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 24, color: C.navy, maxWidth: 360 },
  headMeta: { fontFamily: "Inter", fontSize: 8, color: C.inkMuted, textAlign: "right", lineHeight: 1.5 },
  intro: { fontSize: 10, lineHeight: 1.6, color: C.inkMuted, marginTop: 10, marginBottom: 6, width: 430 },
  item: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  itemMain: { width: "69%", paddingRight: 18 },
  itemName: { fontSize: 12.5, fontWeight: 600, color: C.navy, marginBottom: 3 },
  itemDesc: { fontSize: 9.8, lineHeight: 1.55, color: C.inkMuted, marginBottom: 5 },
  inc: { flexDirection: "row", marginTop: 1.5 },
  incDot: { fontFamily: "Inter", width: 10, color: C.gold, fontSize: 9.5, fontWeight: 600 },
  incText: { flex: 1, fontSize: 9.5, lineHeight: 1.45, color: C.ink },
  itemPrice: { width: "31%", alignItems: "flex-end" },
  pFrom: { fontFamily: "Inter", fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.goldPressed, fontWeight: 600, marginBottom: 1 },
  pAmount: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 19, color: C.navy, textAlign: "right" },
  pUnit: { fontFamily: "Inter", fontSize: 8, color: C.inkMuted, marginTop: 2, textAlign: "right" },
  pNote: { fontFamily: "Inter", fontSize: 8, color: C.inkMuted, marginTop: 6, textAlign: "right", lineHeight: 1.4 },
  condBlock: { marginTop: 16, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.gold },
  condTitle: { fontSize: 10.5, fontWeight: 600, color: C.navy, marginBottom: 3 },
  condText: { fontSize: 9.8, lineHeight: 1.6, color: C.inkMuted },
  contactRow: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  contactLabel: { fontFamily: "Inter", width: "30%", fontSize: 8, letterSpacing: 1.3, textTransform: "uppercase", color: C.goldPressed, fontWeight: 600, paddingTop: 2 },
  contactValue: { width: "70%", fontSize: 11.5, color: C.navy },
  footer: { fontFamily: "Inter", position: "absolute", left: 50, right: 50, bottom: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.inkMuted, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8 },
  specs: { fontFamily: "Inter", fontSize: 8.6, color: C.goldPressed, fontWeight: 500, marginBottom: 4, letterSpacing: 0.2 },
  tiers: { marginTop: 6, borderTopWidth: 0.5, borderTopColor: C.rule },
  tierRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  tierLabel: { fontFamily: "Inter", fontSize: 9.3, color: C.ink }, tierPrice: { fontFamily: "Inter", fontSize: 9.3, fontWeight: 600, color: C.navy },
  minBox: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.tint, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  minLabel: { fontFamily: "Inter", fontSize: 9.8, fontWeight: 600, color: C.navy }, minPrice: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 14, color: C.navy },
  addHead: { fontFamily: "Inter", fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: C.goldPressed, fontWeight: 600, marginTop: 18, marginBottom: 4 },
  addRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6.5, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  addMain: { width: "70%", paddingRight: 12 }, addName: { fontFamily: "Inter", fontSize: 10, color: C.ink, fontWeight: 500 }, addNote: { fontFamily: "Inter", fontSize: 8.4, color: C.inkMuted, marginTop: 1.5, lineHeight: 1.4 },
  addPrice: { fontFamily: "Inter", fontSize: 10, fontWeight: 600, color: C.navy, textAlign: "right", width: "30%" },
  secNote: { fontFamily: "Inter", fontSize: 9, lineHeight: 1.55, color: C.inkMuted, marginTop: 8 },
  custom: { marginTop: 10, marginBottom: 2, padding: 9, borderWidth: 0.8, borderColor: C.gold, backgroundColor: "#fbf8ef" },
  customText: { fontFamily: "Inter", fontSize: 9.4, lineHeight: 1.55, color: C.ink },
  fxBanner: { fontFamily: "Inter", fontSize: 8.2, color: C.goldPressed, marginTop: 8, lineHeight: 1.45, fontWeight: 500 },
  watermark: { position: "absolute", top: 300, left: 70, fontFamily: "Fraunces", fontSize: 150, color: "#0b1220", opacity: 0.055, transform: "rotate(-32deg)" },
  watermarkCover: { position: "absolute", top: 280, left: 40, fontFamily: "Fraunces", fontSize: 170, color: "#ffffff", opacity: 0.16, transform: "rotate(-32deg)" },
  draftBar: { fontFamily: "Inter", position: "absolute", top: 22, right: 50, fontSize: 7.5, letterSpacing: 1.3, textTransform: "uppercase", color: C.goldPressed, fontWeight: 600 },
});

const priceText = (p: PriceSpec, currency: string) => { const f = formatPrice(p, currency); return [f.prefix, f.amount, f.unit && p.kind !== "on_request" ? f.unit : ""].filter(Boolean).join(" "); };
const fxLine = (c: RateCardContent): string | null => {
  const fx = c.meta.fx; if (!fx) return null;
  const rule = fx.rule.kind === "up_to_multiple" ? `rounded up to the next ${c.meta.currency} ${fx.rule.multiple}` : `rounded to the nearest ${c.meta.currency} ${fx.rule.multiple}`;
  if (c.meta.conversionPolicy === "approved") return `${c.meta.currency} prices are converted from USD at ${fx.rateToUsd} and ${rule}.`;   // client wording: no internal source note
  return `Indicative: proposed conversion, not yet approved for client use. ${c.meta.currency} prices are converted from the USD base prices at ${fx.rateToUsd} (${fx.source}, effective ${fx.effectiveFrom}), ${rule}.`;
};

function Item({ i, currency }: { i: RateCardItem; currency: string }) {
  const p = formatPrice(i.price, currency);
  return (
    <View style={s.item} wrap={false}>
      <View style={s.itemMain}>
        <Text style={s.itemName}>{i.name}</Text>
        {i.specs && i.specs.length ? <Text style={s.specs}>{i.specs.join("  ·  ")}</Text> : null}
        {i.description ? <Text style={s.itemDesc}>{i.description}</Text> : null}
        {i.inclusions.map((x, n) => <View key={n} style={s.inc}><Text style={s.incDot}>–</Text><Text style={s.incText}>{x}</Text></View>)}
        {i.tiers && i.tiers.length ? <View style={s.tiers}>{i.tiers.map((t) => <View key={t.label} style={s.tierRow}><Text style={s.tierLabel}>{t.label}</Text><Text style={s.tierPrice}>{priceText(t.price, currency)}</Text></View>)}</View> : null}
      </View>
      <View style={s.itemPrice}>
        {p.prefix ? <Text style={s.pFrom}>{p.prefix}</Text> : null}
        <Text style={s.pAmount}>{p.amount}</Text>
        {p.unit ? <Text style={s.pUnit}>{p.unit}</Text> : null}
        {i.note ? <Text style={s.pNote}>{i.note}</Text> : null}
      </View>
    </View>
  );
}

function Frame({ c, status }: { c: RateCardContent; status: EditionStatus }) {
  return (
    <>
      {status.state === "draft" ? <Text style={s.draftBar} fixed>Draft — not approved for distribution</Text> : null}
      {status.state === "draft" ? <Text style={s.watermark} fixed>DRAFT</Text> : null}
      <View style={s.footer} fixed>
        <Text>Ordift Studios · ordiftstudios.com</Text>
        <Text>{c.meta.title} · {c.meta.editionLabel}{status.state === "approved" ? ` · ${status.contentHash.slice(0, 8)}` : ""}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );
}

function Section({ sec, c, status }: { sec: RateCardSection; c: RateCardContent; status: EditionStatus }) {
  const items = sec.items.filter((i) => i.included !== false);
  const addons = (sec.addons ?? []).filter((a: Addon) => a.included !== false);
  const fx = fxLine(c);
  return (
    <Page size="A4" style={s.page}>
      <Frame c={c} status={status} />
      <View style={s.head} fixed><Text style={s.h1}>{sec.title}</Text><Text style={s.headMeta}>{c.meta.marketName}{"\n"}Prices in {c.meta.currency}</Text></View>
      {fx ? <Text style={s.fxBanner}>{fx}</Text> : null}
      {sec.intro ? <Text style={s.intro}>{sec.intro}</Text> : null}
      {sec.customQuotationNote ? <View style={s.custom} wrap={false}><Text style={s.customText}>{sec.customQuotationNote}</Text></View> : null}
      {items.map((i) => <Item key={i.key} i={i} currency={c.meta.currency} />)}
      {sec.minimum ? <View style={s.minBox} wrap={false}><Text style={s.minLabel}>{sec.minimum.label}</Text><Text style={s.minPrice}>{priceText(sec.minimum.price, c.meta.currency)}</Text></View> : null}
      {addons.length ? <View wrap={false}><Text style={s.addHead}>Additional services</Text>{addons.map((a) => <View key={a.name} style={s.addRow}><View style={s.addMain}><Text style={s.addName}>{a.name}</Text>{a.note ? <Text style={s.addNote}>{a.note}</Text> : null}</View><Text style={s.addPrice}>{priceText(a.price, c.meta.currency)}</Text></View>)}</View> : null}
      {(sec.notes ?? []).map((n, k) => <Text key={k} style={s.secNote}>{n}</Text>)}
    </Page>
  );
}

export function RateCardDocument({ content: c, status, logoWhite, coverPanelOpacity = 0.8 }: { content: RateCardContent; status: EditionStatus; logoWhite: string; coverPanelOpacity?: number }) {
  const m = c.meta;
  return (
    <Document title={`${m.title} — ${m.editionLabel}`} author="Ordift Studios" subject={status.state === "draft" ? "DRAFT — not approved for distribution" : `Approved edition ${status.editionId}`} creator="Ordift Studios" producer="Ordift Studios">
      <Page size="A4" style={s.coverPage}>
        {c.coverImage ? <Image src={c.coverImage} style={s.coverImg} /> : null}
        <View style={s.coverShade} />
        <Image src={logoWhite} style={s.logo} />
        <View style={[s.panelBg, { opacity: coverPanelOpacity }]} />
        <View style={s.panel}>
          <View>
            <View style={s.rule} />
            <Text style={s.eyebrow}>Ordift Studios</Text>
            <Text style={s.title}>{m.title}</Text>
            {m.subtitle ? <Text style={s.subtitle}>{m.subtitle}</Text> : null}
          </View>
          <Text style={s.panelMeta}>{m.marketName} · Prices in {m.currency}{"\n"}{m.editionLabel} · Effective {m.effectiveDate}</Text>
        </View>
        {status.state === "draft" ? <Text style={s.watermarkCover}>DRAFT</Text> : null}
        <View style={s.coverFoot}><Text>ordiftstudios.com</Text>{status.state === "draft" ? <Text style={s.draftTag}>Draft — not approved</Text> : <Text>Edition {status.editionId}</Text>}</View>
      </Page>

      {c.sections.filter((sec) => sec.items.some((i) => i.included !== false)).map((sec) => <Section key={sec.key} sec={sec} c={c} status={status} />)}

      {c.conditions.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Frame c={c} status={status} />
          <View style={s.head}><Text style={s.h1}>Conditions</Text></View>
          {c.conditions.map((x, n) => <View key={n} style={s.condBlock} wrap={false}><Text style={s.condTitle}>{x.title}</Text><Text style={s.condText}>{x.text}</Text></View>)}
        </Page>
      ) : null}

      {c.contact.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Frame c={c} status={status} />
          <View style={s.head}><Text style={s.h1}>Book with us</Text></View>
          {c.intro ? <Text style={s.intro}>{c.intro}</Text> : null}
          {c.contact.map((x, n) => <View key={n} style={s.contactRow} wrap={false}><Text style={s.contactLabel}>{x.label}</Text><Text style={s.contactValue}>{x.value}</Text></View>)}
        </Page>
      ) : null}
    </Document>
  );
}
