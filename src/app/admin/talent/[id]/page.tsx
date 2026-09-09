import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getTalentProfileDetailForAdmin } from "@/lib/talent/talentOverview";
import { getTalentMeasurements } from "@/lib/talent/talentMeasurementsEngine";
import { listTalentCategories } from "@/lib/talent/talentProfiles";
import { REPRESENTATION_STATUSES } from "@/lib/talent/talentRepresentation";
import { TALENT_PUBLICATION_STATUSES } from "@/lib/talent/talentPublicationLifecycle";
import {
  setRepresentationStatusAction,
  setPublicationStatusAction,
  setTalentMeasurementsAction,
  removeTalentCategoryAction,
} from "../actions";
import { AssignCategoryForm } from "./AssignCategoryForm";

export const metadata: Metadata = { title: "Talent Profile — Ordift Studios Admin", robots: { index: false, follow: false } };

// Ordift Talent — TALENT-SYS-2B, Phase 2 (2026-09-08). Per-talent
// management page, same pattern as /admin/portfolio/[id]. Every write
// here goes through actions.ts, which in turn goes through the
// DORMANT talent.* capability gates — this page renders the forms
// regardless of who's viewing (matching every other admin page's
// convention in this codebase), the underlying action call is the
// real authorization boundary.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink";

export default async function AdminTalentProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const { id } = await params;
  const [detail, measurements, categories] = await Promise.all([getTalentProfileDetailForAdmin(id), getTalentMeasurements(id), listTalentCategories()]);
  if (!detail) notFound();

  const assignedCategoryIds = new Set(detail.assignedCategoryIds);
  const unassignedCategories = categories.filter((c) => !assignedCategoryIds.has(c.id));
  const assignedCategories = categories.filter((c) => assignedCategoryIds.has(c.id));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/talent" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Talent Management
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{detail.memberNumber ?? detail.name ?? detail.profileId}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          Account status: {detail.status} · Representation: {detail.representationStatus} · Publication: {detail.publicationStatus}
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Representation status</h2>
        <form action={setRepresentationStatusAction} className="flex items-end gap-3 flex-wrap">
          <input type="hidden" name="profileId" value={detail.profileId} />
          <Field label="New status">
            <select name="toStatus" defaultValue={detail.representationStatus} className={inputClass}>
              {REPRESENTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className="rounded-lg bg-ordift-navy-950 text-ordift-gold px-4 py-2 font-sans text-caption font-semibold">
            Update
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Publication status</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Governs the private record only. The public portfolio itself (imagery, gallery, reel) is edited and separately published in{" "}
          <Link href="/studio/structure/talentProfile" className="underline">
            Sanity Studio
          </Link>
          — both must be independently set before a talent appears on the public roster.
        </p>
        <form action={setPublicationStatusAction} className="flex items-end gap-3 flex-wrap">
          <input type="hidden" name="profileId" value={detail.profileId} />
          <Field label="New status">
            <select name="toStatus" defaultValue={detail.publicationStatus} className={inputClass}>
              {TALENT_PUBLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className="rounded-lg bg-ordift-navy-950 text-ordift-gold px-4 py-2 font-sans text-caption font-semibold">
            Update
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Categories</h2>
        {assignedCategories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignedCategories.map((c) => (
              <form key={c.id} action={removeTalentCategoryAction} className="inline-flex items-center gap-2 rounded-full bg-black/5 pl-3 pr-1.5 py-1">
                <input type="hidden" name="profileId" value={detail.profileId} />
                <input type="hidden" name="categoryId" value={c.id} />
                <span className="font-sans text-caption text-ordift-ink">{c.name}</span>
                <button type="submit" aria-label={`Remove ${c.name}`} className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
                  ×
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted italic">No categories assigned yet.</p>
        )}
        {unassignedCategories.length > 0 ? (
          <AssignCategoryForm profileId={detail.profileId} categories={unassignedCategories} />
        ) : categories.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted italic">
            No talent categories exist yet — add one from the <Link href="/admin/talent" className="underline">Talent Management</Link> overview.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Info / measurements</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Casting-relevant facts only — never contact, financial, or internal data.</p>
        <form action={setTalentMeasurementsAction} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <input type="hidden" name="profileId" value={detail.profileId} />
          <Field label="Height (cm)"><input name="heightCm" type="number" step="0.1" defaultValue={measurements?.heightCm ?? ""} className={inputClass} /></Field>
          <Field label="Bust (cm)"><input name="bustCm" type="number" step="0.1" defaultValue={measurements?.bustCm ?? ""} className={inputClass} /></Field>
          <Field label="Waist (cm)"><input name="waistCm" type="number" step="0.1" defaultValue={measurements?.waistCm ?? ""} className={inputClass} /></Field>
          <Field label="Hip (cm)"><input name="hipCm" type="number" step="0.1" defaultValue={measurements?.hipCm ?? ""} className={inputClass} /></Field>
          <Field label="Shoe (EU)"><input name="shoeEu" type="number" step="0.5" defaultValue={measurements?.shoeEu ?? ""} className={inputClass} /></Field>
          <Field label="Hair"><input name="hairColor" type="text" defaultValue={measurements?.hairColor ?? ""} className={inputClass} /></Field>
          <Field label="Eyes"><input name="eyeColor" type="text" defaultValue={measurements?.eyeColor ?? ""} className={inputClass} /></Field>
          <Field label="Languages (comma-separated)"><input name="languages" type="text" defaultValue={measurements?.languages?.join(", ") ?? ""} className={inputClass} /></Field>
          <Field label="Location"><input name="location" type="text" defaultValue={measurements?.location ?? ""} className={inputClass} /></Field>
          <label className="flex items-center gap-2 pt-6">
            <input name="travelReady" type="checkbox" defaultChecked={measurements?.travelReady ?? false} />
            <span className="font-sans text-body-small text-ordift-ink">Travel ready</span>
          </label>
          <div className="col-span-full">
            <button type="submit" className="rounded-lg bg-ordift-navy-950 text-ordift-gold px-4 py-2 font-sans text-caption font-semibold">
              Save measurements
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
