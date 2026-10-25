// Pure, dependency-free: what a CLIENT-FACING quotation may say about the Ordift legal entity that contracts for it. Built only from the authoritative entity and registration
// records, and deliberately narrow: the legal name, the registration type, and the identifiers of CURRENT, VERIFIED registrations of two kinds (commercial registration and tax
// registration). Everything else in the governance records (establishment card, articles, chamber membership, permits, investment conditions, notes, issuing authorities, documents,
// who chose the entity, why, and when) is never shown, so nothing internal can reach a client document.

export type EntityDisplay = { legalName: string; registrationType: string | null; identifiers: { label: string; identifier: string }[] };

type EntityRow = { name: string; legal_name: string | null; registration_type: string | null };
type RegRow = { kind: string; status: string; identifier: string | null; expiresOn: string | null; verifiedAt: string | null };

const SHOWN: { kind: string; label: string }[] = [
  { kind: "commercial_registration", label: "Commercial Registration (CR) No." },
  { kind: "tax_registration", label: "Tax registration No." },
];

export function buildEntityDisplay(entity: EntityRow, registrations: RegRow[], today: string): EntityDisplay {
  const identifiers = SHOWN.flatMap(({ kind, label }) =>
    registrations
      .filter((r) => r.kind === kind && r.status === "active" && r.verifiedAt && r.identifier && r.identifier.trim() && (!r.expiresOn || r.expiresOn >= today))
      .slice(0, 1)
      .map((r) => ({ label, identifier: r.identifier!.trim() })));
  return { legalName: (entity.legal_name?.trim() || entity.name).trim(), registrationType: entity.registration_type?.trim() || null, identifiers };
}
