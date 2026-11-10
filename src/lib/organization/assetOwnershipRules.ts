// Pure rules for recording WHO LEGALLY OWNS a registered asset. No database, no I/O.
// Five things stay distinct and are never inferred from one another: the PURCHASER (as stated or printed on the receipt), the LEGAL OWNER (the legal entity — recorded here), the FUNDING SOURCE (on the acquisition),
// the ASSIGNED USER (the HR custody register) and the BUSINESS PURPOSE (here, with any incidental personal use flagged for accountant review). Nothing here is an accounting classification or an asset-cost record.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = (s: string | null | undefined) => (s ?? "").trim();

export type OwnershipInput = { assetId: string; entityId: string; purchaserAsStated?: string | null; businessPurpose: string; incidentalPersonalUse: boolean; personalUseNote?: string | null; basisStatement: string; evidenceDocumentId?: string | null };
export type OwnershipValue = { assetId: string; entityId: string; purchaserAsStated: string | null; businessPurpose: string; incidentalPersonalUse: boolean; personalUseNote: string | null; basisStatement: string; evidenceDocumentId: string | null };
export function validateOwnership(i: OwnershipInput): { ok: true; value: OwnershipValue } | { ok: false; error: string } {
  if (!UUID.test(t(i.assetId)) || !UUID.test(t(i.entityId))) return { ok: false, error: "Choose the registered asset and the legal entity." };
  const purchaser = t(i.purchaserAsStated) || null;
  if (purchaser && purchaser.length < 3) return { ok: false, error: "Write the purchaser as stated or printed, or leave it empty." };
  if (t(i.businessPurpose).length < 10 || t(i.businessPurpose).length > 500) return { ok: false, error: "Describe the business purpose (10 to 500 characters)." };
  if (t(i.basisStatement).length < 10 || t(i.basisStatement).length > 1000) return { ok: false, error: "Say how ownership is established, for example the Founder's statement and which documents are pending (10 to 1000 characters)." };
  const note = t(i.personalUseNote) || null;
  if (i.incidentalPersonalUse && (note ?? "").length < 10) return { ok: false, error: "Incidental personal use must be described (at least 10 characters) so the accountant can review any adjustment." };
  const doc = t(i.evidenceDocumentId) || null;
  if (doc && !UUID.test(doc)) return { ok: false, error: "Choose the evidence document from the list." };
  return { ok: true, value: { assetId: t(i.assetId), entityId: t(i.entityId), purchaserAsStated: purchaser, businessPurpose: t(i.businessPurpose), incidentalPersonalUse: i.incidentalPersonalUse, personalUseNote: i.incidentalPersonalUse ? note : null, basisStatement: t(i.basisStatement), evidenceDocumentId: doc } };
}
