import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { listCapabilityPeople, listCapabilityTitles } from "@/lib/crewSupport/capabilities";
import { PROFICIENCIES, PROFICIENCY_LABELS, VERIFICATION_LABELS } from "@/lib/crewSupport/config";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { revokeCapabilityAction, setCapabilityAction } from "./actions";

export const metadata: Metadata = { title: "Crew Capabilities — Ordift Studios Admin", robots: { index: false, follow: false } };

const field = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";

export default async function CapabilitiesPage() {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user)) redirect("/admin/overview");
  const [people, titles] = await Promise.all([listCapabilityPeople(), listCapabilityTitles()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/crew-support" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">← Crew Support</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">Crew capabilities</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-3xl">
          Who can fulfil which kind of crew role, independent of job title. Only people with a matching, non-revoked capability appear as candidates for a role; a person with no capability (including backup or system accounts) never does. A capability is not availability or willingness, and attendance has no effect. Self-declared capabilities are not treated as verified.
        </p>
      </div>

      {people.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">No workforce profiles found.</p>}

      {people.map((p) => (
        <section key={p.profileId} className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h2 className="font-serif font-medium text-body text-ordift-ink">{p.name}{p.memberNumber ? ` (${p.memberNumber})` : " (no member number)"}</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">{[p.engagementType, p.roles.filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No engagement details"}</p>
          </div>

          {p.capabilities.length === 0 ? (
            <p className="font-sans text-caption text-ordift-ink-muted">No capabilities — not offered as crew for any role.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {p.capabilities.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <p className={`font-sans text-body-small ${c.verification === "revoked" ? "text-ordift-ink-muted line-through" : "text-ordift-ink"}`}>
                    {c.titleName} — {PROFICIENCY_LABELS[c.proficiency]} · {VERIFICATION_LABELS[c.verification]}{c.source === "seeded_from_title" ? " · seeded from staff title" : ""}{c.notes ? ` · ${c.notes}` : ""}
                  </p>
                  {c.verification !== "revoked" && (
                    <ActionForm action={revokeCapabilityAction}>
                      <input type="hidden" name="capabilityId" value={c.id} />
                      <SubmitButton pendingLabel="Revoking…" className="font-sans text-caption text-red-700 underline underline-offset-4">Revoke</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={setCapabilityAction} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center border-t border-black/5 pt-3">
            <input type="hidden" name="profileId" value={p.profileId} />
            <select name="titleId" aria-label={`Capability for ${p.name}`} className={field} defaultValue="">
              <option value="" disabled>Add or update capability…</option>
              {titles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select name="proficiency" aria-label="Relevance" className={field} defaultValue="secondary">
              {PROFICIENCIES.map((x) => <option key={x} value={x}>{PROFICIENCY_LABELS[x]}</option>)}
            </select>
            <select name="verification" aria-label="Verification" className={field} defaultValue="verified">
              <option value="verified">Verified</option>
              <option value="self_declared">Self-declared (unverified)</option>
            </select>
            <input name="notes" placeholder="Note (optional)" aria-label="Note" className={field} />
            <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save capability</SubmitButton>
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
