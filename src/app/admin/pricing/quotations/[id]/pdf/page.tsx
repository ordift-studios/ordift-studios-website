import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getClientQuotation } from "@/lib/commercial/clientQuotations";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Quotation PDF — Ordift Studios",
  robots: { index: false, follow: false },
};

// Quotation/Rate Card PDF (2026-09-16, Task 7 of the Universal
// Commercial Rate Card & Quotation System). Uses ONLY the existing
// approved Ordift letterhead (brand/legal-publications/os-letterhead.jpg,
// committed 2026-08-20 as part of the Enterprise Legal Series) — copied
// byte-for-byte into public/brand/ so Next.js can serve it, never
// redesigned or approximated. No new PDF-generation dependency: this is
// a print-optimized HTML page: the browser's own "Print to PDF" IS the
// PDF, generated from the same real client data as the on-screen detail
// view — zero risk of drift between what an admin reviews and what gets
// printed. Selling-side fields only, exactly like getClientQuotation()
// itself returns — there is no cost/margin field anywhere in this
// component's props to accidentally render.
export default async function QuotationPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const quotation = await getClientQuotation(id);
  if (!quotation) notFound();

  return (
    <div className="print-page">
      <style>{`
        .print-page {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background-image: url(/brand/os-letterhead.jpg);
          background-size: cover;
          background-position: top center;
          background-repeat: no-repeat;
          box-sizing: border-box;
          padding: 55mm 20mm 30mm 20mm;
          font-family: Georgia, 'Times New Roman', serif;
          color: #1a1a1a;
        }
        .print-toolbar { text-align: center; margin: 16px 0; }
        @media print {
          .print-toolbar { display: none; }
          body { margin: 0; }
          header, nav { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
        }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9px; color: #666; border-bottom: 1px solid #ccc; padding: 6px 4px; }
        td { padding: 8px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
        .totals td { border: none; padding: 2px 4px; }
        .totals .label { text-align: right; color: #555; }
        .totals .value { text-align: right; width: 110px; }
        .totals .grand td { font-weight: bold; border-top: 1px solid #333; padding-top: 6px; }
      `}</style>

      <PrintButton />

      <div style={{ textAlign: "right", fontSize: 11, marginBottom: 24 }}>
        <div>{quotation.quotationReference}</div>
        <div>{new Date(quotation.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      <div style={{ marginBottom: 24, fontSize: 12 }}>
        <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9, color: "#888" }}>Prepared for</div>
        <div style={{ fontWeight: "bold", fontSize: 14 }}>{quotation.clientName ?? quotation.prospectName}</div>
        {quotation.prospectCompany && <div>{quotation.prospectCompany}</div>}
        {quotation.prospectEmail && <div>{quotation.prospectEmail}</div>}
        {quotation.prospectPhone && <div>{quotation.prospectPhone}</div>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th style={{ textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item) => (
            <tr key={item.id}>
              <td>
                <div>{item.serviceItem}</div>
                {item.description && <div style={{ fontSize: 10, color: "#666" }}>{item.description}</div>}
              </td>
              <td>{item.quantity} {item.unitBasis.replace(/_/g, " ")}</td>
              <td>{quotation.currency} {item.sellingRate.toFixed(2)}</td>
              <td style={{ textAlign: "right" }}>{quotation.currency} {item.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ marginTop: 16 }} className="totals">
        <tbody>
          <tr><td className="label">Subtotal</td><td className="value">{quotation.currency} {quotation.subtotal.toFixed(2)}</td></tr>
          {quotation.discountTotal > 0 && <tr><td className="label">Discount</td><td className="value">-{quotation.currency} {quotation.discountTotal.toFixed(2)}</td></tr>}
          {quotation.taxTotal > 0 && <tr><td className="label">Tax</td><td className="value">{quotation.currency} {quotation.taxTotal.toFixed(2)}</td></tr>}
          <tr className="grand"><td className="label">Total</td><td className="value">{quotation.currency} {quotation.total.toFixed(2)}</td></tr>
        </tbody>
      </table>

      {quotation.validUntil && (
        <p style={{ fontSize: 11, marginTop: 24 }}>This quotation is valid until {new Date(quotation.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</p>
      )}
      {quotation.paymentBookingTerms && (
        <div style={{ fontSize: 11, marginTop: 16 }}>
          <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9, color: "#888" }}>Payment / Booking Terms</div>
          <div style={{ whiteSpace: "pre-line" }}>{quotation.paymentBookingTerms}</div>
        </div>
      )}
    </div>
  );
}
