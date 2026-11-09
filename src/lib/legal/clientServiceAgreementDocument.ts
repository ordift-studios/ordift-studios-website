import { createHash } from "node:crypto";
import { COUNSEL_SLOT, TOKEN } from "./clientServiceAgreementMaster";

// CLIENT SERVICES AGREEMENT - composition (pure, deterministic, no I/O). Same discipline as the instructor composer, but a SEPARATE implementation sharing no clause text:
// the master's text is copied line for line; only {{TOKENS}} are replaced, from RECORDED facts; composition REFUSES (never guesses, never writes "N/A") when
//   - the master still contains any [[COUNSEL: ...]] slot (an unreviewed master can never produce an issuable agreement),
//   - a particular is missing, or a token has no value, or an unknown token appears,
//   - the quotation's structured payment condition and its written terms disagree (the booking gate would refuse the same quotation).
// The output and its SHA-256 are exactly reproducible from the same inputs, so a preview and the issued artifact can be compared byte for byte.
import { classifyPaymentTerms, paymentConditionSentence, type PaymentChoice } from "@/lib/commercial/paymentConditionTerms";

export type ClientServiceSnapshot = {
  agreementReference: string; jurisdiction: string | null; activities: string[];
  contractingEntity: { id: string; name: string; legalName: string | null; registrationType: string | null; registrationNumber: string | null; businessAddress: string | null };
  signatory: { name: string; position: string; authority: string | null };
  client: { kind: "individual" | "organisation"; legalName?: string | null; organisationName?: string | null; representativeName?: string | null; representativePosition?: string | null; email: string | null; address?: string | null };
  quotation: { reference: string; fingerprint: string | null; currency: string; total: number; payment: PaymentChoice; paymentTermsText: string | null; lines: { serviceItem: string; description: string | null; quantity: number; unitBasis: string }[] };
  schedule?: { startsAt: string; endsAt: string; timezone: string; kind: "on_site" | "online" | "studio"; location?: string | null; platform?: string | null }[];
};
export type ComposeInput = { masterText: string; masterVersion: string; masterContentReference: string | null; masterDocumentHash: string | null; snapshot: ClientServiceSnapshot };
export type ComposeResult = { ok: true; text: string; sha256: string } | { ok: false; missing: string[]; counselSlots?: number };

const fmtMoney = (n: number) => n.toFixed(2);
// "2026-12-01T06:00:00.000Z" in Asia/Qatar -> "1 December 2026, 09:00-13:00 (Asia/Qatar)"; locale-free so the text and its hash never vary by machine
function sessionLine(i: number, s: NonNullable<ClientServiceSnapshot["schedule"]>[number]): string {
  const part = (iso: string) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const a = part(s.startsAt), b = part(s.endsAt);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  const when = sameDay ? `${Number(a.day)} ${months[Number(a.month) - 1]} ${a.year}, ${a.hour}:${a.minute}-${b.hour}:${b.minute}` : `${Number(a.day)} ${months[Number(a.month) - 1]} ${a.year} ${a.hour}:${a.minute} to ${Number(b.day)} ${months[Number(b.month) - 1]} ${b.year} ${b.hour}:${b.minute}`;
  const where = s.kind === "online" ? `online (${s.platform})` : s.kind === "studio" ? `studio (${s.location})` : `on site (${s.location})`;
  return `Session ${i + 1}: ${when} (${s.timezone}), ${where}`;
}

export function composeClientServiceAgreementText(i: ComposeInput): ComposeResult {
  const s = i.snapshot, missing: string[] = [];
  const slots = i.masterText.match(COUNSEL_SLOT)?.length ?? 0;
  if (slots > 0) missing.push(`The master still has ${slots} clause${slots === 1 ? "" : "s"} awaiting counsel's wording`);
  if (!s.agreementReference) missing.push("Agreement reference");
  if (!s.jurisdiction) missing.push("Jurisdiction of the contracting entity");
  if (!s.contractingEntity?.name) missing.push("Contracting entity");
  else { if (!s.contractingEntity.registrationNumber?.trim()) missing.push("Contracting entity registration number"); if (!s.contractingEntity.businessAddress?.trim()) missing.push("Contracting entity business address"); }
  if (!s.signatory?.name || !s.signatory.position || !s.signatory.authority) missing.push("Authorised signatory (name, position and authority)");
  const clientName = s.client?.kind === "organisation" ? s.client.organisationName : s.client?.legalName;
  if (!clientName?.trim()) missing.push(s.client?.kind === "organisation" ? "Client organisation name" : "Client legal name");
  if (s.client?.kind === "organisation" && (!s.client.representativeName?.trim() || !s.client.representativePosition?.trim())) missing.push("Client's authorised representative (name and position)");
  if (!s.client?.email?.trim()) missing.push("Client email");
  if (!s.quotation?.reference) missing.push("Accepted quotation reference");
  if (!s.quotation?.fingerprint || !/^[0-9a-f]{64}$/.test(s.quotation.fingerprint)) missing.push("Accepted quotation content fingerprint");
  if (!s.quotation?.lines?.length) missing.push("Quotation service lines");
  if (!s.activities?.length) missing.push("Activities declared when the quotation was issued");
  if (!i.masterContentReference || !i.masterDocumentHash) missing.push("Controlled master reference");
  if (s.quotation) {
    const check = classifyPaymentTerms(s.quotation.paymentTermsText, s.quotation.payment.condition, s.quotation.payment.depositPercent);
    if (check === "contradiction" || check === "ambiguous" || check === "no_terms") missing.push("The quotation's structured payment condition and its written terms must agree (record the correction first)");
  }
  if (!s.schedule?.length) missing.push("Confirmed schedule (the booking must be confirmed first)");
  if (missing.length) return { ok: false, missing, counselSlots: slots };

  const e = s.contractingEntity;
  const entity = [e.name, e.legalName && e.legalName !== e.name ? `legal name ${e.legalName}` : null, e.registrationType, `registration number ${e.registrationNumber!.trim()}`].filter(Boolean).join(", ") + `; business address: ${e.businessAddress!.split("||").map((p) => p.trim()).filter(Boolean).join(", ")}`;
  const signatory = `${s.signatory.name}, ${s.signatory.position}. Authority as recorded: ${s.signatory.authority}`;
  const org = s.client.kind === "organisation";
  const clientDesc = org ? `${s.client.organisationName}, acting through ${s.client.representativeName}, ${s.client.representativePosition}${s.client.address ? `; address: ${s.client.address}` : ""}; email: ${s.client.email}` : `${s.client.legalName}, contracting personally${s.client.address ? `; address: ${s.client.address}` : ""}; email: ${s.client.email}`;
  const lines = s.quotation.lines.map((l, n) => `  ${n + 1}. ${l.serviceItem}${l.description ? ` - ${l.description}` : ""} (${l.quantity} x ${l.unitBasis})`).join("\n");
  const values: Record<string, string> = {
    ENTITY_DESCRIPTION: entity, ENTITY_SIGNATORY: signatory, CLIENT_DESCRIPTION: clientDesc, QUOTATION_REFERENCE: s.quotation.reference, QUOTATION_FINGERPRINT: s.quotation.fingerprint!, SERVICE_LINES: lines,
    ACTIVITIES: s.activities.join(", "), CURRENCY: s.quotation.currency, TOTAL: fmtMoney(s.quotation.total), PAYMENT_CONDITION_SENTENCE: paymentConditionSentence(s.quotation.payment),
    SCHEDULE: s.schedule!.map((g, n) => sessionLine(n, g)).join("\n"), JURISDICTION: s.jurisdiction!, CLIENT_SIGNATORY: org ? `${s.client.representativeName}, ${s.client.representativePosition}, for ${s.client.organisationName}` : s.client.legalName!,
  };
  const unknown = new Set<string>();
  const body = i.masterText.replace(TOKEN, (_m, key: string) => { if (!(key in values)) { unknown.add(key); return _m; } return values[key]; });
  if (unknown.size) return { ok: false, missing: [`The master uses tokens this composer does not know: ${[...unknown].join(", ")}`] };
  const divider = "=".repeat(72);
  const text = [divider, `AGREEMENT REFERENCE: ${s.agreementReference}`, `MASTER VERSION: ${i.masterVersion}`, `MASTER CONTENT REFERENCE: ${i.masterContentReference}`, `MASTER DOCUMENT SHA-256: ${i.masterDocumentHash}`, divider, "", body].join("\n");
  return { ok: true, text, sha256: createHash("sha256").update(text, "utf8").digest("hex") };
}
