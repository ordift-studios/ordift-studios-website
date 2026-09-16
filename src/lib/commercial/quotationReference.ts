// Universal Commercial Rate Card & Quotation System (2026-09-16). Pure
// formatting/validation for the controlled human-readable quotation
// reference: ORD-QUO-YYYY-######. Mirrors agreementReference.ts
// exactly — actual collision-safe SEQUENCE GENERATION is a Postgres
// sequence (public.client_quotation_reference_seq, migration 0134),
// consulted only from clientQuotations.ts.

const REFERENCE_PATTERN = /^ORD-QUO-(\d{4})-(\d{6})$/;

export function formatQuotationReference(year: number, sequenceNumber: number): string {
  return `ORD-QUO-${year}-${String(sequenceNumber).padStart(6, "0")}`;
}

export function isValidQuotationReferenceFormat(reference: string): boolean {
  return REFERENCE_PATTERN.test(reference);
}

export function parseQuotationReference(reference: string): { year: number; sequenceNumber: number } | null {
  const match = REFERENCE_PATTERN.exec(reference);
  if (!match) return null;
  return { year: Number(match[1]), sequenceNumber: Number(match[2]) };
}
