import { getContractingEntity, listContractingCandidates, ordinarySubjectGate } from "@/lib/organization/entityRegistrations";
import ContractingEntityForm from "./ContractingEntityForm";

// Contracting legal entity for an ORDINARY enquiry or quotation (Super Admin only). Reuses the existing contracting-entity records and rules: the entity is
// chosen explicitly (never inferred from currency, nationality or location), recorded with a reason, append-only, and refused once the quotation has been
// accepted or money received. A record with no entity is shown as such and left exactly as it is.
export default async function ContractingEntitySection({ userId, subject }: { userId: string; subject: { type: "enquiry" | "quotation"; id: string } }) {
  const [current, gate] = await Promise.all([getContractingEntity(subject, userId), ordinarySubjectGate(subject)]);
  const { candidates } = await listContractingCandidates(userId, null, new Date().toISOString().slice(0, 10));
  const options = candidates.map((c) => ({ entityId: c.entityId, name: c.name, eligible: c.eligibility.eligible, blockers: c.eligibility.blockers }));
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Contracting legal entity</h2>
      {current ? (
        <p className="font-sans text-body-small text-ordift-ink"><strong>{current.entityName}</strong> contracts for this {subject.type} (version {current.version}) — <span className="text-ordift-ink-muted">{current.basis}</span></p>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">No contracting entity is recorded. It is chosen explicitly and never inferred from the client&apos;s currency, nationality or location.</p>
      )}
      {gate.ok ? <ContractingEntityForm subjectType={subject.type} subjectId={subject.id} options={options} /> : <p className="font-sans text-caption text-ordift-ink-muted">{gate.error}</p>}
      <p className="font-sans text-caption text-ordift-ink-muted">Recording an entity changes nothing else: no quotation, amount, payment, obligation, agreement, stage or email is created or changed.</p>
    </section>
  );
}
