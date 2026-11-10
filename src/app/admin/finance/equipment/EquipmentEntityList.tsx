import Link from "next/link";

export type EntityChoice = { id: string; name: string; legalName: string | null; jurisdictionName: string | null };

// Presentational list of legal entities, each linking to its own Equipment & Financing panel. No data access: the page (Super Admin only) passes the entities in.
export function EquipmentEntityList({ entities }: { entities: EntityChoice[] }) {
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {entities.map((e) => (
          <li key={e.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{e.name}</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">{e.legalName ?? e.name}{e.jurisdictionName ? ` · ${e.jurisdictionName}` : ""}</p>
            <Link href={`/admin/organization/legal-entities/${e.id}/equipment`} className="inline-block font-sans text-body-small font-semibold text-ordift-gold-pressed underline underline-offset-4">Open Equipment &amp; Financing →</Link>
          </li>
        ))}
      {entities.length === 0 && <li className="font-sans text-body-small text-ordift-ink-muted">No legal entities are recorded.</li>}
      </ul>
  );
}
