import { getContractingEntity, listOrdinaryContractingCandidates, ordinarySubjectGate } from "@/lib/organization/entityRegistrations";
import { requirementStateLabel } from "@/lib/organization/jurisdictionRequirements";
import ContractingEntityForm from "./ContractingEntityForm";

// Contracting legal entity for an ORDINARY enquiry or quotation (Super Admin only). Reuses the existing contracting-entity records and rules: the entity is
// chosen explicitly (never inferred from currency, nationality or location), recorded with a reason, append-only, and refused once the quotation has been
// accepted or money received. A record with no entity is shown as such and left exactly as it is.
export default async function ContractingEntitySection({ userId, subject }: { userId: string; subject: { type: "enquiry" | "quotation"; id: string } }) {
  const [current, gate] = await Promise.all([getContractingEntity(subject, userId), ordinarySubjectGate(subject)]);
  const { candidates } = await listOrdinaryContractingCandidates(userId, new Date().toISOString().slice(0, 10));
  const options = candidates.map((c) => ({ entityId: c.entityId, name: c.jurisdiction ? `${c.name} (${c.jurisdiction})` : c.name, eligible: c.eligibility.eligible, blockers: c.eligibility.blockers }));
  return (
    <section id="contracting-entity-select" className="rounded-xl border border-black/10 bg-white p-4 sm:p-6 space-y-3 mb-6">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Contracting legal entity</h2>
      {current ? (
        <p className="font-sans text-body-small text-ordift-ink"><strong>{current.entityName}</strong> contracts for this {subject.type} (version {current.version}) — <span className="text-ordift-ink-muted">{current.basis}</span></p>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">No contracting entity is recorded. It is chosen explicitly and never inferred from the client&apos;s currency, nationality or location.</p>
      )}
      {gate.ok ? <ContractingEntityForm subjectType={subject.type} subjectId={subject.id} options={options} /> : <p className="font-sans text-caption text-ordift-ink-muted">{gate.error}</p>}
      <details className="font-sans text-caption text-ordift-ink-muted">
        <summary className="cursor-pointer text-ordift-ink">What each entity needs (by its own jurisdiction)</summary>
        <ul className="mt-2 space-y-2">
          {candidates.map((c) => (
            <li key={c.entityId}>
              <strong className="text-ordift-ink">{c.name}</strong>{c.jurisdiction ? ` — ${c.jurisdiction}` : ""}: {c.eligibility.eligible ? "meets its requirements" : "not available"}
              {c.eligibility.blockers.length > 0 && <ul className="list-disc pl-5">{c.eligibility.blockers.map((b) => <li key={b} className="text-red-800">{b}</li>)}</ul>}
              {c.requirements.length > 0 && <ul className="list-disc pl-5">{c.requirements.map((r) => <li key={r.key}>{r.label}: {requirementStateLabel(r)}</li>)}</ul>}
              {c.advisories.length > 0 && <ul className="list-disc pl-5">{c.advisories.map((a) => <li key={a}>{a} <em>(advisory)</em></li>)}</ul>}
            </li>
          ))}
        </ul>
        <p className="mt-2">Activities are checked when the quotation is issued: only activities recorded as licensed for the entity can be quoted, and a planned activity never counts.</p>
      </details>
      <p className="font-sans text-caption text-ordift-ink-muted">Recording an entity changes nothing else: no quotation, amount, payment, obligation, agreement, stage or email is created or changed.</p>
    </section>
  );
}
