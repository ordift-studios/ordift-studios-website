// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E, Part 13
// (2026-09-08). Pure formatting/validation for the controlled
// human-readable agreement reference: ORD-AGR-YYYY-######. Actual
// collision-safe SEQUENCE GENERATION is a Postgres sequence
// (public.legal_agreement_reference_seq, migration 0069) consulted
// only from agreementEngine.ts — atomic by construction, so this
// module never has to (and cannot) fabricate a "first" reference.

const REFERENCE_PATTERN = /^ORD-AGR-(\d{4})-(\d{6})$/;

export function formatAgreementReference(year: number, sequenceNumber: number): string {
  return `ORD-AGR-${year}-${String(sequenceNumber).padStart(6, "0")}`;
}

export function isValidAgreementReferenceFormat(reference: string): boolean {
  return REFERENCE_PATTERN.test(reference);
}

export function parseAgreementReference(reference: string): { year: number; sequenceNumber: number } | null {
  const match = REFERENCE_PATTERN.exec(reference);
  if (!match) return null;
  return { year: Number(match[1]), sequenceNumber: Number(match[2]) };
}
