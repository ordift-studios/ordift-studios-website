import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { getActiveCrewSupportRates, getActiveModifierPercent, MODIFIER_LABELS, RATE_UNITS, type ModifierSlug } from "@/lib/crewSupport/rates";
import { listCapabilityTitles } from "@/lib/crewSupport/capabilities";
import { createCrewSupportModifierAction, createCrewSupportRateAction } from "./crewSupportRateActions";

const field = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";

// Governed Creative Crew Support SELLING rates (USD reference). Empty until
// the Founder configures them; no rate is ever pre-filled or estimated.
// Append-only: saving creates a new version. These are never cost rates.
export default async function CrewSupportRatesSection({ marketSlug, marketName }: { marketSlug: string; marketName: string }) {
  const [rates, titles, urgent, overtime] = await Promise.all([
    getActiveCrewSupportRates(marketSlug),
    listCapabilityTitles(),
    getActiveModifierPercent("urgent_uplift_percent", marketSlug),
    getActiveModifierPercent("overtime_uplift_percent", marketSlug),
  ]);
  const modifiers: [ModifierSlug, number | null][] = [["urgent_uplift_percent", urgent], ["overtime_uplift_percent", overtime]];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Creative Crew Support — {marketName} (USD selling rates)</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Governed rates the quotation workspace uses to price crew roles. Where a role has no rate here, its quotation line is a manual line marked “no governed rate”. Saving creates a new version; history is never overwritten. These are client selling prices, not crew costs.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted"><th className="pb-2 pr-4">Capability / role</th>{RATE_UNITS.map((u) => <th key={u.value} className="pb-2 pr-4">{u.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {titles.map((t) => (
                <tr key={t.id} className="font-sans text-body-small text-ordift-ink">
                  <td className="py-2 pr-4">{t.name}</td>
                  {RATE_UNITS.map((u) => {
                    const r = rates.find((x) => x.titleId === t.id && x.unitBasis === u.value);
                    return <td key={u.value} className="py-2 pr-4">{r ? `$${r.priceUsd.toFixed(2)}` : "— not set —"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={createCrewSupportRateAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 border-t border-black/5 pt-4">
          <input type="hidden" name="marketSlug" value={marketSlug} />
          <select name="titleId" aria-label="Capability / role" className={field} defaultValue=""><option value="" disabled>Role…</option>{titles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select name="unitBasis" aria-label="Unit" className={field} defaultValue="full_day">{RATE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
          <input name="priceUsd" type="number" step="0.01" min="0.01" placeholder="Price USD" aria-label="Price in USD" className={field} />
          <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</SubmitButton>
        </ActionForm>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Modifiers — {marketName}</h2>
        <ul className="divide-y divide-black/5">
          {modifiers.map(([slug, value]) => (
            <li key={slug} className="py-2 font-sans text-body-small text-ordift-ink flex justify-between"><span>{MODIFIER_LABELS[slug]}</span><span>{value !== null ? `${value}%` : "Not set"}</span></li>
          ))}
        </ul>
        <ActionForm action={createCrewSupportModifierAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 border-t border-black/5 pt-4">
          <input type="hidden" name="marketSlug" value={marketSlug} />
          <select name="modifierSlug" aria-label="Modifier" className={field} defaultValue="urgent_uplift_percent">{(Object.keys(MODIFIER_LABELS) as ModifierSlug[]).map((s) => <option key={s} value={s}>{MODIFIER_LABELS[s]}</option>)}</select>
          <input name="percentage" type="number" step="0.01" min="0.01" placeholder="Percentage" aria-label="Percentage" className={field} />
          <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
