// ONE mapping from the stored quotation lifecycle status to what people
// read. The register used to print the raw stored value ("sent") while
// the Crew Support panel said "Issued — awaiting client acceptance" for
// the same state (QA, 2026-10-07). The stored values are unchanged (they
// are referenced by constraints and code); only presentation is unified.
export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to issue",
  sent: "Issued",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
};

// Longer form used where there is room to say what happens next.
export const QUOTATION_STATUS_DETAIL: Record<string, string> = {
  ...QUOTATION_STATUS_LABEL,
  sent: "Issued — awaiting client acceptance",
};

export function quotationStatusLabel(status: string): string {
  return QUOTATION_STATUS_LABEL[status] ?? status;
}
