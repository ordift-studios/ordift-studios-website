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

const ITEM_PAD = 11;
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
  intro: { fontSize: 10, lineHeight: 1.55, color: C.inkMuted, marginTop: 8, marginBottom: 4, width: 430 },
  item: { flexDirection: "row", paddingVertical: ITEM_PAD, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  itemMain: { width: "76%", paddingRight: 16 },
  itemName: { fontSize: 12.5, fontWeight: 600, color: C.navy, marginBottom: 3 },
  itemDesc: { fontSize: 9.6, lineHeight: 1.5, color: C.inkMuted, marginBottom: 4 },
  incCols: { flexDirection: "row" }, incCol: { width: "50%", paddingRight: 10 },
  inc: { flexDirection: "row", marginTop: 1.2 },
  incDot: { fontFamily: "Inter", width: 10, color: C.gold, fontSize: 9.5, fontWeight: 600 },
  incText: { flex: 1, fontSize: 9.2, lineHeight: 1.4, color: C.ink },
  itemPrice: { width: "24%", alignItems: "flex-end" },
  pFrom: { fontFamily: "Inter", fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.goldPressed, fontWeight: 600, marginBottom: 1 },
  pAmount: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 19, color: C.navy, textAlign: "right" },
  pUnit: { fontFamily: "Inter", fontSize: 8, color: C.inkMuted, marginTop: 2, textAlign: "right" },
  pNote: { fontFamily: "Inter", fontSize: 8, color: C.inkMuted, marginTop: 6, textAlign: "right", lineHeight: 1.4 },
  condBlock: { marginTop: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.gold },
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
  custom: { marginTop: 8, marginBottom: 2, paddingVertical: 6, paddingHorizontal: 9, borderWidth: 0.8, borderColor: C.gold, backgroundColor: "#fbf8ef" },
  customText: { fontFamily: "Inter", fontSize: 9, lineHeight: 1.45, color: C.ink },
  fxBanner: { fontFamily: "Inter", fontSize: 8.2, color: C.goldPressed, marginTop: 8, lineHeight: 1.45, fontWeight: 500 },
  fxShort: { fontFamily: "Inter", fontSize: 8, color: C.goldPressed, marginTop: 6, lineHeight: 1.4, fontWeight: 500 },
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


// Packages with five or more inclusions list them in two columns (reading down the left column, then the right) — the main column is wide enough that a typical line fits one row.
const TWO_COL_MIN = 5;
const splitHalves = <T,>(xs: T[]): [T[], T[]] => { const k = Math.ceil(xs.length / 2); return [xs.slice(0, k), xs.slice(k)]; };

// Height model (points) used ONLY to decide where a long section should break so that no package is stranded alone on a page. It is deliberately a little pessimistic;
// if it is ever wrong the renderer still wraps normally — a break is only added when the section clearly cannot fit on one page.
const PAGE_BODY = 841 - 52 - 72 - 47; // A4 height minus top/bottom page padding minus the repeated section header
const lines = (chars: number, perLine: number) => Math.max(1, Math.ceil(chars / perLine));
const INC_ROW = 9.2 * 1.4 + 1.2;
export function estimateItemHeight(i: RateCardItem): number {
  const two = i.inclusions.length >= TWO_COL_MIN;
  const incHeight = (two ? Math.ceil(i.inclusions.length / 2) * 1.05 : i.inclusions.length) * INC_ROW; // x1.05: allowance for the occasional two-column line that wraps
  const main = 17 + (i.specs?.length ? 14 : 0) + (i.description ? lines(i.description.length, 78) * 9.6 * 1.5 + 4 : 0) + incHeight + (i.tiers?.length ? 6 + i.tiers.length * 19.5 : 0);
  const price = 24 + (i.note ? lines(i.note.length, 24) * 11.2 + 6 : 0);
  return Math.max(main, price) + ITEM_PAD * 2 + 1;
}
// Splits a section's items over the fewest pages that fit, as evenly as possible, so a page is never followed by one lonely package.
// Returns the index of the first item on each later page. `lead` is the height of what precedes the items on page one; `tail` what follows them on the last page.
export function pageBreaks(heights: number[], lead: number, tail: number): number[] {
  const total = lead + heights.reduce((a, b) => a + b, 0) + tail;
  const pages = Math.ceil(total / PAGE_BODY);
  if (pages <= 1) return [];
  const target = total / pages; const breaks: number[] = []; let cum = lead;
  heights.forEach((h, k) => { if (k > 0 && breaks.length < pages - 1 && cum + h / 2 >= target * (breaks.length + 1)) breaks.push(k); cum += h; });
  return breaks;
}
const shortFx = (c: RateCardContent): string | null => {
  const fx = c.meta.fx; if (!fx) return null;
  return c.meta.conversionPolicy === "approved" ? `${c.meta.currency} prices are converted from USD — basis on page 2.` : `Indicative ${c.meta.currency} prices — proposed conversion, not yet approved for client use (basis on page 2).`;
};

// A short item never splits across pages; a very long one may (so a long description does not strand half a page).
function Item({ i, currency, pageBreak }: { i: RateCardItem; currency: string; pageBreak?: boolean }) {
  const p = formatPrice(i.price, currency);
  return (
    <View style={s.item} break={pageBreak} wrap={!(i.description.length < 450 && i.inclusions.length <= 9)}>
      <View style={s.itemMain}>
        <Text style={s.itemName}>{i.name}</Text>
        {i.specs && i.specs.length ? <Text style={s.specs}>{i.specs.join("  ·  ")}</Text> : null}
        {i.description ? <Text style={s.itemDesc}>{i.description}</Text> : null}
        {i.inclusions.length >= TWO_COL_MIN
          ? <View style={s.incCols}>{splitHalves(i.inclusions).map((col, k) => <View key={k} style={s.incCol}>{col.map((x, n) => <View key={n} style={s.inc}><Text style={s.incDot}>–</Text><Text style={s.incText}>{x}</Text></View>)}</View>)}</View>
          : i.inclusions.map((x, n) => <View key={n} style={s.inc}><Text style={s.incDot}>–</Text><Text style={s.incText}>{x}</Text></View>)}
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

function Section({ sec, c, status, first }: { sec: RateCardSection; c: RateCardContent; status: EditionStatus; first: boolean }) {
  const items = sec.items.filter((i) => i.included !== false);
  const addons = (sec.addons ?? []).filter((a: Addon) => a.included !== false);
  const fx = first ? fxLine(c) : shortFx(c);
  // What sits above the first package and below the last one, in points (see estimateItemHeight): used to place page breaks evenly.
  const lead = (fx ? (first ? lines(fx.length, 112) * 11.9 : 11.2) + 8 : 0) + (sec.intro ? lines(sec.intro.length, 85) * 15.5 + 12 : 0) + (sec.customQuotationNote ? lines(sec.customQuotationNote.length, 100) * 13 + 22 : 0);
  const tail = (sec.minimum ? 44 : 0) + (addons.length ? 40 + addons.reduce((n, a) => n + 21 + (a.note ? lines(a.note.length, 90) * 11.8 : 0), 0) : 0) + (sec.notes ?? []).reduce((n, t) => n + lines(t.length, 105) * 14 + 8, 0);
  const breaks = new Set(pageBreaks(items.map(estimateItemHeight), lead, tail));
  return (
    <Page size="A4" style={s.page}>
      <Frame c={c} status={status} />
      <View style={s.head} fixed><Text style={s.h1}>{sec.title}</Text><Text style={s.headMeta}>{c.meta.marketName}{"\n"}Prices in {c.meta.currency}</Text></View>
      {fx ? <Text style={first ? s.fxBanner : s.fxShort}>{fx}</Text> : null}
      {sec.intro ? <Text style={s.intro}>{sec.intro}</Text> : null}
      {sec.customQuotationNote ? <View style={s.custom} wrap={false}><Text style={s.customText}>{sec.customQuotationNote}</Text></View> : null}
      {items.map((i, k) => <Item key={i.key} i={i} currency={c.meta.currency} pageBreak={breaks.has(k)} />)}
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

      {c.sections.filter((sec) => sec.items.some((i) => i.included !== false)).map((sec, n) => <Section key={sec.key} sec={sec} c={c} status={status} first={n === 0} />)}

      {c.conditions.length > 0 || c.contact.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Frame c={c} status={status} />
          {c.conditions.length > 0 ? <>
            <View style={s.head}><Text style={s.h1}>Conditions</Text></View>
            {c.conditions.map((x, n) => <View key={n} style={s.condBlock} wrap={false}><Text style={s.condTitle}>{x.title}</Text><Text style={s.condText}>{x.text}</Text></View>)}
          </> : null}
          {c.contact.length > 0 ? <>
            <View style={[s.head, c.conditions.length > 0 ? { marginTop: 34 } : {}]} wrap={false}><Text style={s.h1}>Book with us</Text></View>
            {c.intro ? <Text style={s.intro}>{c.intro}</Text> : null}
            {c.contact.map((x, n) => <View key={n} style={s.contactRow} wrap={false}><Text style={s.contactLabel}>{x.label}</Text><Text style={s.contactValue}>{x.value}</Text></View>)}
          </> : null}
        </Page>
      ) : null}
    </Document>
  );
}
