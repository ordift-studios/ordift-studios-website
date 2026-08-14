"use client";

export default function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
    >
      Print Receipt
    </button>
  );
}
