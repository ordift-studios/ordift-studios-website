// Ordift Production Operations — Supplier Quote math (2026-09-07) —
// pure, zero-import. computeQuoteTotal() is the one arithmetic step
// createSupplierQuote() (supplierQuotes.ts) performs — everything else
// about a quote (originalCurrencyCode, supplierSubtotal, taxAmount) is
// stored verbatim, never recomputed or converted. Extracted here so
// it's directly unit-testable, same pure/impure split as every other
// pricing module in this codebase.

export function computeQuoteTotal(supplierSubtotal: number, taxAmount: number | null | undefined): number {
  return Math.round((supplierSubtotal + (taxAmount ?? 0)) * 100) / 100;
}
