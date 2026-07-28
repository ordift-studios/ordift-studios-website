import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { addLookupOptionAction, toggleLookupOptionAction } from "./actions";
import { listClassifications } from "@/lib/portal/memberNumbers";
import ClassificationManager from "./ClassificationManager";

export const metadata: Metadata = {
  title: "Titles, Engagement Types & Classifications — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

type Row = { id: string; name: string; active: boolean };

async function loadLookup(table: "operational_titles" | "engagement_types"): Promise<Row[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from(table).select("id, name, active").order("sort_order");
  if (error) {
    console.error(`[admin] failed to load ${table}`, error.message);
    return [];
  }
  return data ?? [];
}

function LookupTable({ table, title, rows }: { table: "operational_titles" | "engagement_types"; title: string; rows: Row[] }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">{title}</h2>
      <ul className="divide-y divide-black/5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2.5">
            <span className={`font-sans text-body-small ${r.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
              {r.name}
            </span>
            <form action={toggleLookupOptionAction}>
              <input type="hidden" name="table" value={table} />
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="active" value={String(r.active)} />
              <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                {r.active ? "Deactivate" : "Reactivate"}
              </button>
            </form>
          </li>
        ))}
        {rows.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted py-2">None yet.</p>}
      </ul>
      <form action={addLookupOptionAction} className="flex items-center gap-2 pt-2 border-t border-black/5">
        <input type="hidden" name="table" value={table} />
        <input
          type="text"
          name="name"
          placeholder="Add new…"
          aria-label={`Add new ${title}`}
          required
          className="flex-1 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
        />
        <button type="submit" className="font-sans text-body-small font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">
          Add
        </button>
      </form>
    </section>
  );
}

export default async function AdminLookupsPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");

  const [operationalTitles, engagementTypes, classifications] = await Promise.all([
    loadLookup("operational_titles"),
    loadLookup("engagement_types"),
    listClassifications(true),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin — Super Admin only
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Titles, Engagement Types &amp; Classifications
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Titles and Engagement Types describe a collaborator&apos;s role and working relationship — they never
          affect system permissions. Account Classifications drive Member Numbers instead — a separate, configurable
          identity system (see the section below).
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <LookupTable table="operational_titles" title="Operational Titles" rows={operationalTitles} />
        <LookupTable table="engagement_types" title="Engagement Types" rows={engagementTypes} />
        <ClassificationManager classifications={classifications} />
      </div>
    </div>
  );
}
