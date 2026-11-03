/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF drawing primitive, not an HTML <img> */
import { Fragment } from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND as C } from "../brand";
import { BODY_FONT } from "../fonts";
import { documentBanner, formatAmount, formatIssueDate, shortFingerprint, type QuotationDocumentContent, type QuotationDocumentContext } from "@/lib/commercial/quotationDocument";
import { formatDate } from "@/lib/commercial/quotationValidity";
import { footerColumns, type FooterColumn } from "@/lib/brand/letterheadContacts";

// The client-facing quotation document for an ISSUED ordinary quotation (A4, on the approved Ordift letterhead). Built only from the frozen issued content: the entity's legal details
// captured at issue, the lines, totals and terms, never from live registry data. Internal notes, cost, margin and source references are not part of the content type, so they cannot appear.
// Wording added by the document itself is limited to labels and the neutral acceptance note below.

export const ACCEPTANCE_NOTE = "To accept this quotation, please confirm in writing (email or message) to the person who sent it to you, quoting the reference above. This quotation does not confirm a booking until Ordift Studios has confirmed it with you.";

export type LetterheadAssets = { base: Buffer | null; icons: Record<FooterColumn["icon"], Buffer | null> };

// The contact strip keeps the approved letterhead's geometry (positions measured from the approved image, 1055 x 1385 px -> 595 x 842 pt): three slots (email, telephone, website), each an icon over its text,
// separated by two rules. Only the text changes: it is the issuing entity's contact details (src/lib/brand/letterheadContacts.ts).
const SLOTS: Record<number, { cx: number; w: number }[]> = {
  3: [{ cx: 72.2, w: 104 }, { cx: 181.6, w: 86 }, { cx: 276, w: 94 }],
  2: [{ cx: 72.2, w: 104 }, { cx: 181.6, w: 94 }],
};
const RULES: Record<number, number[]> = { 3: [139.6, 227.6], 2: [139.6] };
const ICON = 24.3;

// A4 is 595 x 842 pt. The approved letterhead carries the logo in the top ~17% and the contact strip in the bottom ~11%: the content frame sits between them.
const s = StyleSheet.create({
  page: { fontFamily: BODY_FONT, color: C.ink, paddingTop: 156, paddingBottom: 142, paddingHorizontal: 54, fontSize: 9.4 },
  bg: { position: "absolute", top: 0, left: 0, width: 595, height: 842 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.2, borderBottomColor: C.gold, paddingBottom: 8, marginBottom: 12 },
  title: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 21, color: C.navy },
  meta: { alignItems: "flex-end" }, metaRef: { fontWeight: 600, fontSize: 10.5, color: C.navy }, metaLine: { fontSize: 8.6, color: C.inkMuted, marginTop: 1.5 },
  banner: { fontWeight: 600, fontSize: 9, color: "#8c1d18", borderWidth: 1, borderColor: "#8c1d18", paddingVertical: 4, paddingHorizontal: 8, marginBottom: 10, alignSelf: "flex-start" },
  cols: { flexDirection: "row", marginBottom: 12 }, col: { flex: 1, paddingRight: 12 },
  label: { fontSize: 7.2, letterSpacing: 1.4, textTransform: "uppercase", color: C.inkMuted, marginBottom: 3 },
  strong: { fontWeight: 600, fontSize: 10.6, color: C.navy }, line: { fontSize: 9, color: C.ink, marginTop: 1.5 },
  scope: { fontSize: 9, color: C.ink, marginBottom: 10 },
  thead: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.rule, paddingBottom: 4 },
  th: { fontSize: 7.2, letterSpacing: 1.2, textTransform: "uppercase", color: C.inkMuted },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 6 },
  cItem: { flex: 1, paddingRight: 8 }, cQty: { width: 74, paddingRight: 6 }, cRate: { width: 74, textAlign: "right", paddingRight: 6 }, cTotal: { width: 84, textAlign: "right" },
  sub: { fontSize: 8.2, color: C.inkMuted, marginTop: 2 },
  totals: { alignSelf: "flex-end", width: 250, marginTop: 10 },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  tGrand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.navy, marginTop: 4, paddingTop: 5 },
  grand: { fontWeight: 600, fontSize: 11, color: C.navy },
  block: { marginTop: 14 }, p: { fontSize: 9, lineHeight: 1.5, color: C.ink },
  foot: { position: "absolute", bottom: 98, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.inkMuted },
  entityLine: { position: "absolute", bottom: 111, left: 54, right: 54, fontSize: 7, color: C.ink },
  icon: { position: "absolute", top: 753.2, width: ICON, height: ICON },
  contact: { position: "absolute", top: 791, fontFamily: "Helvetica", fontSize: 8, color: "#292929", textAlign: "center" },
  rule: { position: "absolute", top: 753.8, width: 0.9, height: 74.5, backgroundColor: "#292929" },
});

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={strong ? s.tGrand : s.tRow}><Text style={strong ? s.grand : undefined}>{label}</Text><Text style={strong ? s.grand : undefined}>{value}</Text></View>
);

export function QuotationDocument({ content: c, context, fingerprint, letterhead }: { content: QuotationDocumentContent; context: QuotationDocumentContext; fingerprint: string; letterhead: LetterheadAssets }) {
  const banner = documentBanner(context.status, c.validUntil, context.today);
  const p = context.party;
  const unit = (u: string) => u.replace(/_/g, " ");
  const columns = footerColumns(context.contacts);
  const identifiers = c.entity.identifiers.map((i) => `${i.label} ${i.identifier}`).join(" · ");
  return (
    <Document title={`Quotation ${c.reference}`} author="Ordift Studios" subject={`Quotation ${c.reference}`} creator="Ordift Studios" producer="Ordift Studios">
      <Page size="A4" style={s.page} wrap>
        {letterhead.base ? <Image src={{ data: letterhead.base, format: "jpg" }} style={s.bg} fixed /> : null}

        <View style={s.titleRow}>
          <Text style={s.title}>Quotation</Text>
          <View style={s.meta}>
            <Text style={s.metaRef}>{c.reference}{c.version > 1 ? ` (version ${c.version})` : ""}</Text>
            <Text style={s.metaLine}>Issued {formatIssueDate(c.issuedAt)}</Text>
            <Text style={s.metaLine}>{c.validUntil ? `Valid until ${formatDate(c.validUntil)}` : "Validity not recorded"}</Text>
          </View>
        </View>

        {banner ? <Text style={s.banner}>{banner}</Text> : null}

        <View style={s.cols} wrap={false}>
          <View style={s.col}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.strong}>{p.name ?? "Client"}</Text>
            {p.company ? <Text style={s.line}>{p.company}</Text> : null}
            {p.email ? <Text style={s.line}>{p.email}</Text> : null}
            {p.phone ? <Text style={s.line}>{p.phone}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Issued by (contracting entity)</Text>
            <Text style={s.strong}>{c.entity.legalName}</Text>
            {c.entity.registrationType ? <Text style={s.line}>{c.entity.registrationType}</Text> : null}
            {context.jurisdiction ? <Text style={s.line}>Jurisdiction: {context.jurisdiction}</Text> : null}
            {c.entity.identifiers.map((i) => <Text key={i.label} style={s.line}>{i.label} {i.identifier}</Text>)}
          </View>
        </View>

        {c.activities.length > 0 ? <Text style={s.scope}>Services covered: {c.activities.map((a) => a.label).join(", ")}</Text> : null}

        <View style={s.thead} fixed>
          <Text style={[s.th, s.cItem]}>Item</Text><Text style={[s.th, s.cQty]}>Quantity</Text><Text style={[s.th, s.cRate]}>Rate</Text><Text style={[s.th, s.cTotal]}>Total</Text>
        </View>
        {c.items.map((i, k) => (
          <View key={k} style={s.tr} wrap={false}>
            <View style={s.cItem}>
              <Text>{i.service}</Text>
              {i.description ? <Text style={s.sub}>{i.description}</Text> : null}
              {i.discountPercent ? <Text style={s.sub}>Discount {i.discountPercent}%</Text> : null}
              {i.taxPercent ? <Text style={s.sub}>Tax {i.taxPercent}%</Text> : null}
            </View>
            <Text style={s.cQty}>{i.quantity} {unit(i.unitBasis)}</Text>
            <Text style={s.cRate}>{formatAmount(c.currency, i.rate)}</Text>
            <Text style={s.cTotal}>{formatAmount(c.currency, i.lineTotal)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <Row label="Subtotal" value={formatAmount(c.currency, c.subtotal)} />
          {c.discountTotal > 0 ? <Row label="Discount" value={`-${formatAmount(c.currency, c.discountTotal)}`} /> : null}
          {c.taxTotal > 0 ? <Row label="Tax" value={formatAmount(c.currency, c.taxTotal)} /> : null}
          <Row label="Total" value={formatAmount(c.currency, c.total)} strong />
        </View>

        {c.validUntil ? <View style={s.block} wrap={false}><Text style={s.p}>This quotation is valid until {formatDate(c.validUntil)}.</Text></View> : null}
        {c.paymentBookingTerms ? (
          <View style={s.block}><Text style={s.label} minPresenceAhead={60}>Payment and booking terms</Text><Text style={s.p}>{c.paymentBookingTerms}</Text></View>
        ) : null}
        <View style={s.block} wrap={false}><Text style={s.label}>Acceptance</Text><Text style={s.p}>{ACCEPTANCE_NOTE}</Text></View>

        <Text style={s.entityLine} fixed>{c.entity.legalName}{identifiers ? ` · ${identifiers}` : ""}</Text>
        {columns.map((col, i) => {
          const pos = (SLOTS[columns.length] ?? SLOTS[2])[i];
          return (
            <Fragment key={col.icon}>
              {letterhead.icons[col.icon] ? <Image src={{ data: letterhead.icons[col.icon] as Buffer, format: "png" }} style={[s.icon, { left: pos.cx - ICON / 2 }]} fixed /> : null}
              <Text style={[s.contact, { left: pos.cx - pos.w / 2, width: pos.w }]} fixed>{col.lines.join("\n")}</Text>
            </Fragment>
          );
        })}
        {(RULES[columns.length] ?? RULES[2]).map((x) => <View key={x} style={[s.rule, { left: x }]} fixed />)}
        <View style={s.foot} fixed>
          <Text>{c.reference} · fingerprint {shortFingerprint(fingerprint)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
