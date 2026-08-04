import type { DefinedTerm } from "@/lib/legal/types";

export default function DefinitionsList({ definitions }: { definitions: DefinedTerm[] }) {
  if (definitions.length === 0) return null;
  return (
    <dl className="space-y-3 border-l-2 border-ordift-gold/40 pl-5">
      {definitions.map((d) => (
        <div key={d.term} id={`definitions-${d.id}`} className="scroll-mt-24">
          <dt className="font-sans font-semibold text-body text-ordift-ink inline">“{d.term}”</dt>{" "}
          <dd className="font-sans text-body text-ordift-ink-muted leading-relaxed inline">{d.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
